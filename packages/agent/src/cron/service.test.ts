import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CronService } from "./service.js";
import type { CronJob } from "./types.js";

describe("CronService", () => {
  let tempDir: string;
  let storagePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-test-"));
    storagePath = path.join(tempDir, "cron.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create with required config", () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });

      expect(service).toBeDefined();
    });

    it("should use default storage path when not provided", () => {
      const service = new CronService({
        onTrigger: async () => {},
      });

      expect(service).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should start with empty jobs when no file exists", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });

      await service.initialize();
      const jobs = service.listJobs();

      expect(jobs).toEqual([]);
      await service.shutdown();
    });

    it("should load existing jobs from file", async () => {
      const existingJobs: CronJob[] = [
        {
          id: "test-id-1",
          name: "test-job",
          instruction: "do something",
          schedule: { kind: "every", everyMs: 60000 },
          enabled: true,
          createdAtMs: Date.now(),
        },
      ];

      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(storagePath, JSON.stringify({ jobs: existingJobs }));

      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });

      await service.initialize();
      const jobs = service.listJobs();

      expect(jobs.length).toBe(1);
      expect(jobs[0].name).toBe("test-job");
      await service.shutdown();
    });
  });

  describe("addJob", () => {
    it("should add job with every schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "hourly-check",
        instruction: "check system status",
        schedule: { kind: "every", everyMs: 3600000 },
        enabled: true,
      });

      expect(job.id).toBeDefined();
      expect(job.name).toBe("hourly-check");
      expect(job.instruction).toBe("check system status");
      expect(job.createdAtMs).toBeDefined();
      expect(job.nextRunAtMs).toBeDefined();

      await service.shutdown();
    });

    it("should add job with at schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const futureTime = Date.now() + 3600000;
      const job = await service.addJob({
        name: "one-time",
        instruction: "run once",
        schedule: { kind: "at", atMs: futureTime },
        enabled: true,
      });

      expect(job.schedule.kind).toBe("at");
      expect(job.nextRunAtMs).toBe(futureTime);

      await service.shutdown();
    });

    it("should add job with cron schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "daily-9am",
        instruction: "morning report",
        schedule: { kind: "cron", expr: "0 9 * * *" },
        enabled: true,
      });

      expect(job.schedule.kind).toBe("cron");
      expect(job.nextRunAtMs).toBeDefined();

      await service.shutdown();
    });

    it("should persist job to file", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "persistent-job",
        instruction: "test persistence",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const content = await fs.readFile(storagePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.jobs.length).toBe(1);
      expect(data.jobs[0].name).toBe("persistent-job");

      await service.shutdown();
    });
  });

  describe("removeJob", () => {
    it("should remove existing job", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "to-remove",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const removed = await service.removeJob(job.id);

      expect(removed).toBe(true);
      expect(service.listJobs().length).toBe(0);

      await service.shutdown();
    });

    it("should return false for non-existent job", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const removed = await service.removeJob("non-existent-id");

      expect(removed).toBe(false);

      await service.shutdown();
    });

    it("should persist removal to file", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "temp-job",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.removeJob(job.id);

      const content = await fs.readFile(storagePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.jobs.length).toBe(0);

      await service.shutdown();
    });
  });

  describe("listJobs", () => {
    it("should return all jobs", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "job-1",
        instruction: "test 1",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.addJob({
        name: "job-2",
        instruction: "test 2",
        schedule: { kind: "every", everyMs: 120000 },
        enabled: false,
      });

      const jobs = service.listJobs();

      expect(jobs.length).toBe(2);
      expect(jobs.map((j) => j.name)).toContain("job-1");
      expect(jobs.map((j) => j.name)).toContain("job-2");

      await service.shutdown();
    });
  });

  describe("getJob", () => {
    it("should return job by id", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const created = await service.addJob({
        name: "find-me",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const found = service.getJob(created.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("find-me");

      await service.shutdown();
    });

    it("should return undefined for non-existent id", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const found = service.getJob("non-existent");

      expect(found).toBeUndefined();

      await service.shutdown();
    });
  });

  describe("getStatus", () => {
    it("should return correct job count", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      expect(service.getStatus().jobCount).toBe(0);

      await service.addJob({
        name: "job-1",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      expect(service.getStatus().jobCount).toBe(1);

      await service.shutdown();
    });

    it("should return next trigger time for enabled jobs", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      expect(service.getStatus().nextTriggerMs).toBeNull();

      await service.addJob({
        name: "scheduled",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      expect(service.getStatus().nextTriggerMs).toBeDefined();

      await service.shutdown();
    });

    it("should not return next trigger for disabled jobs", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "disabled",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: false,
      });

      expect(service.getStatus().nextTriggerMs).toBeNull();

      await service.shutdown();
    });
  });

  describe("runJob", () => {
    it("should trigger callback for existing job (fire-and-forget)", async () => {
      const triggered: string[] = [];
      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          triggered.push(job.id);
        },
      });
      await service.initialize();

      const job = await service.addJob({
        name: "manual-trigger",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.runJob(job.id);
      // runJob uses fire-and-forget for onTrigger; yield to let it complete
      await new Promise((r) => setTimeout(r, 10));

      expect(triggered).toContain(job.id);

      await service.shutdown();
    });

    it("should throw for non-existent job", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await expect(service.runJob("non-existent")).rejects.toThrow(
        "Job not found",
      );

      await service.shutdown();
    });

    it("should update lastRunAtMs after trigger", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "track-run",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      expect(job.lastRunAtMs).toBeUndefined();

      await service.runJob(job.id);

      const updated = service.getJob(job.id);
      expect(updated?.lastRunAtMs).toBeDefined();

      await service.shutdown();
    });
  });

  describe("schedule calculations", () => {
    it("should calculate next run for at schedule in future", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const futureTime = Date.now() + 3600000;
      const job = await service.addJob({
        name: "future-at",
        instruction: "test",
        schedule: { kind: "at", atMs: futureTime },
        enabled: true,
      });

      expect(job.nextRunAtMs).toBe(futureTime);

      await service.shutdown();
    });

    it("should set undefined next run for at schedule in past", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const pastTime = Date.now() - 3600000;
      const job = await service.addJob({
        name: "past-at",
        instruction: "test",
        schedule: { kind: "at", atMs: pastTime },
        enabled: true,
      });

      expect(job.nextRunAtMs).toBeUndefined();

      await service.shutdown();
    });

    it("should calculate next run for every schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const before = Date.now();
      const job = await service.addJob({
        name: "every-5min",
        instruction: "test",
        schedule: { kind: "every", everyMs: 300000 },
        enabled: true,
      });
      const after = Date.now();

      expect(job.nextRunAtMs).toBeGreaterThanOrEqual(before + 300000);
      expect(job.nextRunAtMs).toBeLessThanOrEqual(after + 300000);

      await service.shutdown();
    });

    it("should throw for invalid cron expression", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await expect(
        service.addJob({
          name: "bad-cron",
          instruction: "test",
          schedule: { kind: "cron", expr: "invalid" },
          enabled: true,
        }),
      ).rejects.toThrow("Invalid cron expression");

      await service.shutdown();
    });
  });

  describe("at job behavior", () => {
    it("should disable at job after trigger", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const futureTime = Date.now() + 1000;
      const job = await service.addJob({
        name: "one-shot",
        instruction: "test",
        schedule: { kind: "at", atMs: futureTime },
        enabled: true,
      });

      expect(job.enabled).toBe(true);

      await service.runJob(job.id);

      const updated = service.getJob(job.id);
      expect(updated?.enabled).toBe(false);

      await service.shutdown();
    });
  });

  describe("persistence across restarts", () => {
    it("should reload jobs from disk after shutdown", async () => {
      const service1 = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service1.initialize();

      await service1.addJob({
        name: "persistent",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service1.shutdown();

      const service2 = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service2.initialize();

      const jobs = service2.listJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].name).toBe("persistent");

      await service2.shutdown();
    });
  });

  describe("shutdown", () => {
    it("should clear scheduled timer", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "will-shutdown",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.shutdown();

      expect(service.getStatus().nextTriggerMs).toBeDefined();
    });

    it("should be safe to call multiple times", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.shutdown();
      await service.shutdown();
    });
  });

  describe("error handling", () => {
    it("should handle callback errors gracefully", async () => {
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;

      const service = new CronService({
        storagePath,
        onTrigger: async () => {
          throw new Error("Callback failed");
        },
      });
      await service.initialize();

      const job = await service.addJob({
        name: "error-job",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.runJob(job.id);
      // runJob uses fire-and-forget; yield to let error handler run
      await new Promise((r) => setTimeout(r, 10));

      expect(consoleSpy).toHaveBeenCalled();

      console.error = originalError;
      await service.shutdown();
    });
  });

  describe("setOnTrigger (late binding)", () => {
    it("should allow construction without onTrigger", () => {
      const service = new CronService({ storagePath });
      expect(service).toBeDefined();
    });

    it("should warn when trigger fires without callback", async () => {
      const consoleSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = consoleSpy;

      const service = new CronService({ storagePath });
      await service.initialize();

      const job = await service.addJob({
        name: "no-callback",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.runJob(job.id);

      expect(consoleSpy).toHaveBeenCalled();

      console.warn = originalWarn;
      await service.shutdown();
    });

    it("should use callback set via setOnTrigger", async () => {
      const triggered: string[] = [];
      const service = new CronService({ storagePath });
      await service.initialize();

      service.setOnTrigger(async (job) => {
        triggered.push(job.id);
      });

      const job = await service.addJob({
        name: "late-bound",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.runJob(job.id);
      // runJob uses fire-and-forget; yield to let callback complete
      await new Promise((r) => setTimeout(r, 10));

      expect(triggered).toContain(job.id);
      await service.shutdown();
    });

    it("should override initial callback with setOnTrigger", async () => {
      const initialTriggered: string[] = [];
      const lateTriggered: string[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          initialTriggered.push(job.id);
        },
      });
      await service.initialize();

      service.setOnTrigger(async (job) => {
        lateTriggered.push(job.id);
      });

      const job = await service.addJob({
        name: "override-test",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.runJob(job.id);
      // runJob uses fire-and-forget; yield to let callback complete
      await new Promise((r) => setTimeout(r, 10));

      expect(initialTriggered).toEqual([]);
      expect(lateTriggered).toContain(job.id);
      await service.shutdown();
    });
  });
});
