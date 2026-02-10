import fs from "node:fs/promises";
import path from "node:path";
import type {
  CronJob,
  CronJobInput,
  CronSchedule,
  CronServiceConfig,
} from "./types.js";

interface StorageData {
  jobs: CronJob[];
}

export class CronService {
  private jobs: Map<string, CronJob> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private storagePath: string;
  private onTrigger: CronServiceConfig["onTrigger"];
  private started = false;

  constructor(config: CronServiceConfig) {
    this.storagePath =
      config.storagePath ??
      path.join(process.env.HOME ?? "", ".deca", "cron.json");
    this.onTrigger = config.onTrigger;
  }

  setOnTrigger(callback: NonNullable<CronServiceConfig["onTrigger"]>): void {
    this.onTrigger = callback;
  }

  async initialize(): Promise<void> {
    await this.load();
    this.started = true;
    this.scheduleNext();
  }

  async shutdown(): Promise<void> {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async addJob(input: CronJobInput): Promise<CronJob> {
    const now = Date.now();
    const job: CronJob = {
      ...input,
      id: crypto.randomUUID(),
      createdAtMs: now,
      nextRunAtMs: this.calculateNextRun(input.schedule, now),
    };

    this.jobs.set(job.id, job);
    await this.save();
    this.scheduleNext();

    return job;
  }

  async removeJob(jobId: string): Promise<boolean> {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      await this.save();
      this.scheduleNext();
    }
    return deleted;
  }

  async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    // Use fireAndForget mode to avoid deadlock when called from
    // within an Agent tool — the cron callback dispatches another
    // Agent request through the same serialized global lane.
    await this.triggerJob(job, { fireAndForget: true });
  }

  listJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  getStatus(): { jobCount: number; nextTriggerMs: number | null } {
    const next = this.findNextJob();
    return {
      jobCount: this.jobs.size,
      nextTriggerMs: next?.nextRunAtMs ?? null,
    };
  }

  private scheduleNext(): void {
    if (!this.started) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const next = this.findNextJob();
    if (!next?.nextRunAtMs) return;

    const delay = Math.max(0, next.nextRunAtMs - Date.now());

    this.timer = setTimeout(async () => {
      const job = this.jobs.get(next.id);
      if (job) {
        await this.triggerJob(job);
      }
      this.scheduleNext();
    }, delay);
  }

  private findNextJob(): CronJob | null {
    let earliest: CronJob | null = null;

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (!job.nextRunAtMs) continue;

      if (
        !earliest ||
        job.nextRunAtMs < (earliest.nextRunAtMs ?? Number.POSITIVE_INFINITY)
      ) {
        earliest = job;
      }
    }

    return earliest;
  }

  private async triggerJob(
    job: CronJob,
    opts?: { fireAndForget?: boolean },
  ): Promise<void> {
    const now = Date.now();

    job.lastRunAtMs = now;
    job.nextRunAtMs = this.calculateNextRun(job.schedule, now);

    if (job.schedule.kind === "at") {
      job.enabled = false;
    }

    await this.save();

    if (!this.onTrigger) {
      console.warn(`[Cron] Job ${job.id} triggered but no callback registered`);
      return;
    }

    if (opts?.fireAndForget) {
      // Don't await — prevents deadlock when runJob is called
      // from inside an Agent tool execution context.
      void this.onTrigger(job).catch((err) => {
        console.error(`[Cron] Job ${job.id} trigger failed:`, err);
      });
    } else {
      try {
        await this.onTrigger(job);
      } catch (err) {
        console.error(`[Cron] Job ${job.id} trigger failed:`, err);
      }
    }
  }

  private calculateNextRun(
    schedule: CronSchedule,
    fromMs = Date.now(),
  ): number | undefined {
    switch (schedule.kind) {
      case "at":
        return schedule.atMs > fromMs ? schedule.atMs : undefined;

      case "every":
        return fromMs + schedule.everyMs;

      case "cron":
        return this.parseCronNext(schedule.expr, fromMs);
    }
  }

  private parseCronNext(expr: string, fromMs: number): number {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expr}`);
    }

    const [minute, hour] = parts;

    const next = new Date(fromMs);
    next.setSeconds(0, 0);

    if (minute === "*" && hour === "*") {
      next.setMinutes(next.getMinutes() + 1);
      return next.getTime();
    }

    if (minute !== "*" && hour === "*") {
      const targetMinute = Number.parseInt(minute, 10);
      if (next.getMinutes() >= targetMinute) {
        next.setHours(next.getHours() + 1);
      }
      next.setMinutes(targetMinute);
      return next.getTime();
    }

    if (minute !== "*" && hour !== "*") {
      const targetHour = Number.parseInt(hour, 10);
      const targetMinute = Number.parseInt(minute, 10);

      const currentMinutes = next.getHours() * 60 + next.getMinutes();
      const targetMinutes = targetHour * 60 + targetMinute;

      if (currentMinutes >= targetMinutes) {
        next.setDate(next.getDate() + 1);
      }
      next.setHours(targetHour, targetMinute);
      return next.getTime();
    }

    next.setMinutes(next.getMinutes() + 1);
    return next.getTime();
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, "utf-8");
      const data = JSON.parse(content) as StorageData;

      this.jobs.clear();
      for (const job of data.jobs) {
        this.jobs.set(job.id, job);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[Cron] Failed to load jobs:", err);
      }
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    const data: StorageData = { jobs: Array.from(this.jobs.values()) };
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }
}
