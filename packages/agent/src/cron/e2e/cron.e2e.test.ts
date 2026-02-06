/**
 * E2E tests for CronService with real timer execution
 *
 * These tests verify the complete cron flow:
 * - Input: CronJobInput → CronService.addJob()
 * - Process: setTimeout auto-trigger
 * - Output: onTrigger callback with standardized CronJob
 *
 * Run with: bun test src/cron/e2e/
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CronService } from "../service.js";
import type { CronJob } from "../types.js";

describe("CronService E2E", () => {
  let tempDir: string;
  let storagePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-e2e-"));
    storagePath = path.join(tempDir, "cron.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ==================== Input Standardization ====================

  describe("Input Standardization", () => {
    it("should accept every schedule with everyMs in milliseconds", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "every-5-seconds",
        instruction: "Check system status",
        schedule: { kind: "every", everyMs: 5000 },
        enabled: true,
      });

      expect(job.id).toBeDefined();
      expect(job.schedule).toEqual({ kind: "every", everyMs: 5000 });
      expect(job.nextRunAtMs).toBeDefined();
      expect(job.nextRunAtMs).toBeGreaterThan(Date.now());

      console.log("✅ every schedule accepted with everyMs");
      await service.shutdown();
    });

    it("should accept at schedule with absolute timestamp", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const futureTime = Date.now() + 60000;
      const job = await service.addJob({
        name: "one-time-task",
        instruction: "Send reminder",
        schedule: { kind: "at", atMs: futureTime },
        enabled: true,
      });

      expect(job.schedule).toEqual({ kind: "at", atMs: futureTime });
      expect(job.nextRunAtMs).toBe(futureTime);

      console.log("✅ at schedule accepted with absolute timestamp");
      await service.shutdown();
    });

    it("should accept cron expression schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "daily-9am",
        instruction: "Morning standup reminder",
        schedule: { kind: "cron", expr: "0 9 * * *" },
        enabled: true,
      });

      expect(job.schedule).toEqual({ kind: "cron", expr: "0 9 * * *" });
      expect(job.nextRunAtMs).toBeDefined();

      console.log("✅ cron expression accepted");
      await service.shutdown();
    });

    it("should reject invalid cron expressions", async () => {
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

      console.log("✅ invalid cron expression rejected");
      await service.shutdown();
    });

    it("should set undefined nextRunAtMs for past at schedule", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const pastTime = Date.now() - 60000;
      const job = await service.addJob({
        name: "past-task",
        instruction: "Already missed",
        schedule: { kind: "at", atMs: pastTime },
        enabled: true,
      });

      expect(job.nextRunAtMs).toBeUndefined();

      console.log("✅ past at schedule has undefined nextRunAtMs");
      await service.shutdown();
    });
  });

  // ==================== Auto Trigger ====================

  describe("Auto Trigger", () => {
    it("should trigger job automatically when time comes", async () => {
      const triggered: CronJob[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          triggered.push(job);
        },
      });
      await service.initialize();

      await service.addJob({
        name: "quick-job",
        instruction: "Fast trigger test",
        schedule: { kind: "every", everyMs: 50 },
        enabled: true,
      });

      // Wait for trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(triggered.length).toBeGreaterThanOrEqual(1);
      expect(triggered[0].name).toBe("quick-job");

      console.log(`✅ Job auto-triggered ${triggered.length} time(s)`);
      await service.shutdown();
    });

    it("should trigger multiple jobs in correct order", async () => {
      const triggerOrder: string[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          triggerOrder.push(job.name);
        },
      });
      await service.initialize();

      // Job A: triggers at 30ms
      await service.addJob({
        name: "job-A",
        instruction: "First",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      // Job B: triggers at 60ms
      await service.addJob({
        name: "job-B",
        instruction: "Second",
        schedule: { kind: "every", everyMs: 60 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(triggerOrder[0]).toBe("job-A");
      expect(triggerOrder).toContain("job-B");

      console.log(`✅ Jobs triggered in order: ${triggerOrder.join(" → ")}`);
      await service.shutdown();
    });

    it("should disable at-schedule job after trigger", async () => {
      let triggeredJob: CronJob | null = null;

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          triggeredJob = job;
        },
      });
      await service.initialize();

      const job = await service.addJob({
        name: "one-shot",
        instruction: "Run once only",
        schedule: { kind: "at", atMs: Date.now() + 30 },
        enabled: true,
      });

      expect(job.enabled).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(triggeredJob).not.toBeNull();

      const updated = service.getJob(job.id);
      expect(updated?.enabled).toBe(false);

      console.log("✅ at-schedule job disabled after trigger");
      await service.shutdown();
    });

    it("should reschedule every-schedule job after trigger", async () => {
      let triggerCount = 0;

      const service = new CronService({
        storagePath,
        onTrigger: async () => {
          triggerCount++;
        },
      });
      await service.initialize();

      const job = await service.addJob({
        name: "recurring",
        instruction: "Repeat",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      const initialNextRun = job.nextRunAtMs;

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updated = service.getJob(job.id);
      expect(updated?.nextRunAtMs).toBeGreaterThan(initialNextRun ?? 0);
      expect(updated?.lastRunAtMs).toBeDefined();
      expect(triggerCount).toBeGreaterThanOrEqual(1);

      console.log(
        `✅ every-schedule job rescheduled (triggered ${triggerCount}x)`,
      );
      await service.shutdown();
    });

    it("should not trigger disabled jobs", async () => {
      let triggered = false;

      const service = new CronService({
        storagePath,
        onTrigger: async () => {
          triggered = true;
        },
      });
      await service.initialize();

      await service.addJob({
        name: "disabled-job",
        instruction: "Should not run",
        schedule: { kind: "every", everyMs: 30 },
        enabled: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(triggered).toBe(false);

      console.log("✅ Disabled job was not triggered");
      await service.shutdown();
    });
  });

  // ==================== Output Standardization ====================

  describe("Output Standardization", () => {
    it("should call onTrigger with complete CronJob", async () => {
      let receivedJob: CronJob | null = null;

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          receivedJob = job;
        },
      });
      await service.initialize();

      await service.addJob({
        name: "full-job",
        instruction: "Complete job test",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(receivedJob).not.toBeNull();
      expect(receivedJob?.id).toBeDefined();
      expect(receivedJob?.name).toBe("full-job");
      expect(receivedJob?.instruction).toBe("Complete job test");
      expect(receivedJob?.schedule).toEqual({ kind: "every", everyMs: 30 });
      expect(receivedJob?.enabled).toBe(true);
      expect(receivedJob?.createdAtMs).toBeDefined();
      expect(receivedJob?.lastRunAtMs).toBeDefined();

      console.log("✅ onTrigger received complete CronJob");
      await service.shutdown();
    });

    it("should format instruction correctly for agent.run", async () => {
      const receivedInstructions: string[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          // Simulate adapter.ts formatting logic
          const instruction = `[CRON TASK: ${job.name}] ${job.instruction}`;
          receivedInstructions.push(instruction);
        },
      });
      await service.initialize();

      await service.addJob({
        name: "daily-report",
        instruction: "Generate daily sales report",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(receivedInstructions.length).toBeGreaterThanOrEqual(1);
      expect(receivedInstructions[0]).toBe(
        "[CRON TASK: daily-report] Generate daily sales report",
      );

      console.log("✅ Instruction formatted correctly for agent.run");
      console.log(`   Output: ${receivedInstructions[0]}`);
      await service.shutdown();
    });

    it("should handle special characters in name and instruction", async () => {
      const receivedInstructions: string[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          const instruction = `[CRON TASK: ${job.name}] ${job.instruction}`;
          receivedInstructions.push(instruction);
        },
      });
      await service.initialize();

      await service.addJob({
        name: "email-notify",
        instruction:
          "Send email to user@example.com with subject: 'Daily Update'",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(receivedInstructions[0]).toBe(
        "[CRON TASK: email-notify] Send email to user@example.com with subject: 'Daily Update'",
      );

      console.log("✅ Special characters handled correctly");
      await service.shutdown();
    });
  });

  // ==================== Persistence ====================

  describe("Persistence", () => {
    it("should persist jobs to JSON file", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "persistent-job",
        instruction: "Should survive restart",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.shutdown();

      // Verify file exists and has correct content
      const content = await fs.readFile(storagePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.jobs).toHaveLength(1);
      expect(data.jobs[0].name).toBe("persistent-job");

      console.log("✅ Job persisted to JSON file");
    });

    it("should reload jobs after restart", async () => {
      // Create first service and add job
      const service1 = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service1.initialize();

      const original = await service1.addJob({
        name: "survives-restart",
        instruction: "Test persistence",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service1.shutdown();

      // Create second service and verify job loaded
      const service2 = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service2.initialize();

      const jobs = service2.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(original.id);
      expect(jobs[0].name).toBe("survives-restart");

      console.log("✅ Job reloaded after restart");
      await service2.shutdown();
    });

    it("should continue scheduling after restart", async () => {
      let triggered = false;

      // Create first service and add a quick job
      const service1 = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service1.initialize();

      await service1.addJob({
        name: "quick-after-restart",
        instruction: "Should trigger after restart",
        schedule: { kind: "every", everyMs: 50 },
        enabled: true,
      });

      await service1.shutdown();

      // Create second service with trigger tracking
      const service2 = new CronService({
        storagePath,
        onTrigger: async () => {
          triggered = true;
        },
      });
      await service2.initialize();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(triggered).toBe(true);

      console.log("✅ Scheduling continued after restart");
      await service2.shutdown();
    });

    it("should update lastRunAtMs after trigger and persist", async () => {
      const service = new CronService({
        storagePath,
        onTrigger: async () => {},
      });
      await service.initialize();

      const job = await service.addJob({
        name: "track-runs",
        instruction: "Track last run",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      expect(job.lastRunAtMs).toBeUndefined();

      await new Promise((resolve) => setTimeout(resolve, 80));

      // Verify in memory
      const updated = service.getJob(job.id);
      expect(updated?.lastRunAtMs).toBeDefined();

      // Verify persisted
      const content = await fs.readFile(storagePath, "utf-8");
      const data = JSON.parse(content);
      expect(data.jobs[0].lastRunAtMs).toBeDefined();

      console.log("✅ lastRunAtMs updated and persisted");
      await service.shutdown();
    });
  });

  // ==================== Integration Point ====================

  describe("Integration Point", () => {
    it("should provide all fields needed by adapter", async () => {
      let jobForAdapter: CronJob | null = null;

      const service = new CronService({
        storagePath,
        onTrigger: async (job) => {
          jobForAdapter = job;
        },
      });
      await service.initialize();

      await service.addJob({
        name: "adapter-test",
        instruction: "Execute this task",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));

      // Verify all fields needed by adapter.ts
      expect(jobForAdapter).not.toBeNull();
      expect(jobForAdapter?.name).toBeDefined();
      expect(jobForAdapter?.instruction).toBeDefined();

      // Simulate adapter formatting
      const sessionKey = "cron";
      const instruction = `[CRON TASK: ${jobForAdapter?.name}] ${jobForAdapter?.instruction}`;

      expect(sessionKey).toBe("cron");
      expect(instruction).toBe("[CRON TASK: adapter-test] Execute this task");

      console.log("✅ All fields provided for adapter integration");
      console.log(`   Session key: ${sessionKey}`);
      console.log(`   Instruction: ${instruction}`);
      await service.shutdown();
    });

    it("should handle concurrent job triggers", async () => {
      const triggerTimes: number[] = [];

      const service = new CronService({
        storagePath,
        onTrigger: async () => {
          triggerTimes.push(Date.now());
          // Simulate slow processing
          await new Promise((resolve) => setTimeout(resolve, 20));
        },
      });
      await service.initialize();

      // Add two jobs with very close trigger times
      await service.addJob({
        name: "fast-1",
        instruction: "First",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await service.addJob({
        name: "fast-2",
        instruction: "Second",
        schedule: { kind: "every", everyMs: 35 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(triggerTimes.length).toBeGreaterThanOrEqual(2);

      console.log(`✅ Handled ${triggerTimes.length} concurrent triggers`);
      await service.shutdown();
    });
  });

  // ==================== Error Handling ====================

  describe("Error Handling", () => {
    it("should continue scheduling after onTrigger error", async () => {
      let callCount = 0;

      const service = new CronService({
        storagePath,
        onTrigger: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("First trigger failed");
          }
        },
      });
      await service.initialize();

      await service.addJob({
        name: "error-recovery",
        instruction: "Should recover",
        schedule: { kind: "every", everyMs: 30 },
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(callCount).toBeGreaterThanOrEqual(2);

      console.log(`✅ Recovered from error, triggered ${callCount} times`);
      await service.shutdown();
    });

    it("should handle missing storage directory", async () => {
      const nestedPath = path.join(tempDir, "nested", "deep", "cron.json");

      const service = new CronService({
        storagePath: nestedPath,
        onTrigger: async () => {},
      });
      await service.initialize();

      await service.addJob({
        name: "nested-storage",
        instruction: "Test nested dir",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      // Verify file was created
      const exists = await fs
        .access(nestedPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      console.log("✅ Created nested storage directory");
      await service.shutdown();
    });
  });
});
