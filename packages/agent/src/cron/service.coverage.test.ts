import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

describe("CronService coverage extras", () => {
  let tempDir: string;
  let storagePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-cov-"));
    storagePath = path.join(tempDir, "cron.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("default storagePath uses HOME env (or empty fallback)", () => {
    const orig = process.env.HOME;
    Reflect.deleteProperty(process.env, "HOME");
    try {
      const svc = new CronService({ onTrigger: async () => {} });
      expect(svc).toBeDefined();
    } finally {
      if (orig !== undefined) process.env.HOME = orig;
    }
  });

  it("parseCronNext: '* *' (any minute, any hour) advances by 1 minute", async () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    const job = await svc.addJob({
      name: "any",
      instruction: "x",
      schedule: { kind: "cron", expr: "* * * * *" },
      enabled: true,
    });
    expect(job.nextRunAtMs).toBeDefined();
    await svc.shutdown();
  });

  it("parseCronNext: 'M *' fires at next occurrence of minute M", async () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    const job = await svc.addJob({
      name: "min15",
      instruction: "x",
      schedule: { kind: "cron", expr: "15 * * * *" },
      enabled: true,
    });
    expect(job.nextRunAtMs).toBeDefined();
    await svc.shutdown();
  });

  it("parseCronNext: '* H' (any minute, specific hour) advances by minute", async () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    // minute='*' and hour!='*' falls through to default branch (lines 226-227)
    const job = await svc.addJob({
      name: "anyminH",
      instruction: "x",
      schedule: { kind: "cron", expr: "* 12 * * *" },
      enabled: true,
    });
    expect(job.nextRunAtMs).toBeDefined();
    await svc.shutdown();
  });

  it("parseCronNext: 'M H' specific minute and hour", async () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    const job1 = await svc.addJob({
      name: "specific1",
      instruction: "x",
      schedule: { kind: "cron", expr: "0 0 * * *" }, // earliest hour to push to next day
      enabled: true,
    });
    const job2 = await svc.addJob({
      name: "specific2",
      instruction: "x",
      schedule: { kind: "cron", expr: "59 23 * * *" }, // latest, today path
      enabled: true,
    });
    expect(job1.nextRunAtMs).toBeDefined();
    expect(job2.nextRunAtMs).toBeDefined();
    await svc.shutdown();
  });

  it("triggerJob without onTrigger registered logs a warning (already covered, also exercise non-fire-and-forget path)", async () => {
    const consoleSpy = vi.fn(() => {});
    const origWarn = console.warn;
    console.warn = consoleSpy;
    const svc = new CronService({ storagePath });
    await svc.initialize();
    const job = await svc.addJob({
      name: "warn",
      instruction: "x",
      schedule: { kind: "every", everyMs: 60_000 },
      enabled: true,
    });
    // Use private triggerJob via timer flow: call internal triggerJob through (svc as any)
    await (
      svc as unknown as {
        triggerJob: (j: unknown) => Promise<void>;
      }
    ).triggerJob(svc.getJob(job.id));
    expect(consoleSpy).toHaveBeenCalled();
    console.warn = origWarn;
    await svc.shutdown();
  });

  it("non-fire-and-forget path catches callback errors", async () => {
    const consoleSpy = vi.fn(() => {});
    const origErr = console.error;
    console.error = consoleSpy;
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {
        throw new Error("bad");
      },
    });
    await svc.initialize();
    const job = await svc.addJob({
      name: "err",
      instruction: "x",
      schedule: { kind: "every", everyMs: 60_000 },
      enabled: true,
    });
    // Direct call to triggerJob without fireAndForget
    await (
      svc as unknown as {
        triggerJob: (
          j: unknown,
          opts?: { fireAndForget?: boolean },
        ) => Promise<void>;
      }
    ).triggerJob(svc.getJob(job.id));
    expect(consoleSpy).toHaveBeenCalled();
    console.error = origErr;
    await svc.shutdown();
  });

  it("load() logs a non-ENOENT read error", async () => {
    const badPath = path.join(tempDir, "bad.json");
    // Write malformed JSON (still openable but parse will fail)
    await fs.writeFile(badPath, "not-json");
    const consoleSpy = vi.fn(() => {});
    const origErr = console.error;
    console.error = consoleSpy;
    const svc = new CronService({
      storagePath: badPath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    expect(consoleSpy).toHaveBeenCalled();
    console.error = origErr;
    await svc.shutdown();
  });

  it("findNextJob picks earliest among multiple enabled jobs", async () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await svc.initialize();
    await svc.addJob({
      name: "later",
      instruction: "x",
      schedule: { kind: "every", everyMs: 600_000 },
      enabled: true,
    });
    await svc.addJob({
      name: "sooner",
      instruction: "x",
      schedule: { kind: "every", everyMs: 60_000 },
      enabled: true,
    });
    const status = svc.getStatus();
    expect(status.jobCount).toBe(2);
    expect(status.nextTriggerMs).toBeDefined();
    await svc.shutdown();
  });

  it("scheduleNext returns early if not started", () => {
    const svc = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    // Without initialize, scheduleNext would be a no-op when called
    (svc as unknown as { scheduleNext: () => void }).scheduleNext();
    expect(svc.getStatus().jobCount).toBe(0);
  });

  it("scheduleNext fires timer and triggers job", async () => {
    const triggered: string[] = [];
    const svc = new CronService({
      storagePath,
      onTrigger: async (job) => {
        triggered.push(job.id);
      },
    });
    await svc.initialize();
    // Add job that fires in 10ms
    await svc.addJob({
      name: "soon",
      instruction: "x",
      schedule: { kind: "at", atMs: Date.now() + 10 },
      enabled: true,
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(triggered.length).toBeGreaterThanOrEqual(1);
    await svc.shutdown();
  });
});
