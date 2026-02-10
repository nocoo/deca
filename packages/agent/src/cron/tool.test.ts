import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "../tools/types.js";
import { CronService } from "./service.js";
import { type CronToolInput, createCronTool } from "./tool.js";

describe("cronTool", () => {
  let tempDir: string;
  let storagePath: string;
  let service: CronService;
  let tool: ReturnType<typeof createCronTool>;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-tool-test-"));
    storagePath = path.join(tempDir, "cron.json");

    service = new CronService({
      storagePath,
      onTrigger: async () => {},
    });
    await service.initialize();

    tool = createCronTool(service);

    ctx = {
      workspaceDir: tempDir,
      sessionKey: "test-session",
    };
  });

  afterEach(async () => {
    await service.shutdown();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("cron");
    });

    it("should have description", () => {
      expect(tool.description).toContain("scheduled tasks");
    });

    it("should have input schema with action required", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.required).toContain("action");
    });
  });

  describe("status action", () => {
    it("should return status with no jobs", async () => {
      const result = await tool.execute({ action: "status" }, ctx);

      expect(result).toContain("Cron Status");
      expect(result).toContain("Jobs: 0");
      expect(result).toContain("Next trigger: none");
    });

    it("should return status with jobs", async () => {
      await service.addJob({
        name: "test",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const result = await tool.execute({ action: "status" }, ctx);

      expect(result).toContain("Jobs: 1");
      expect(result).not.toContain("Next trigger: none");
    });
  });

  describe("list action", () => {
    it("should return empty message when no jobs", async () => {
      const result = await tool.execute({ action: "list" }, ctx);

      expect(result).toBe("No scheduled jobs.");
    });

    it("should list all jobs", async () => {
      await service.addJob({
        name: "job-1",
        instruction: "test 1",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      await service.addJob({
        name: "job-2",
        instruction: "test 2",
        schedule: { kind: "cron", expr: "0 9 * * *" },
        enabled: false,
      });

      const result = await tool.execute({ action: "list" }, ctx);

      expect(result).toContain("Scheduled Jobs (2)");
      expect(result).toContain("job-1");
      expect(result).toContain("job-2");
      expect(result).toContain("enabled");
      expect(result).toContain("disabled");
    });
  });

  describe("add action", () => {
    it("should require name", async () => {
      const result = await tool.execute(
        {
          action: "add",
          instruction: "test",
          schedule: { kind: "every", everyMs: 60000 },
        },
        ctx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("name");
    });

    it("should require instruction", async () => {
      const result = await tool.execute(
        {
          action: "add",
          name: "test",
          schedule: { kind: "every", everyMs: 60000 },
        },
        ctx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("instruction");
    });

    it("should require schedule", async () => {
      const result = await tool.execute(
        {
          action: "add",
          name: "test",
          instruction: "test",
        },
        ctx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("schedule");
    });

    it("should add job with every schedule", async () => {
      const result = await tool.execute(
        {
          action: "add",
          name: "hourly",
          instruction: "check status",
          schedule: { kind: "every", everyMs: 3600000 },
        },
        ctx,
      );

      expect(result).toContain("Job created");
      expect(result).toContain("hourly");
      expect(result).toContain("every 1h");
    });

    it("should add job with at schedule", async () => {
      const futureTime = Date.now() + 3600000;
      const result = await tool.execute(
        {
          action: "add",
          name: "one-time",
          instruction: "reminder",
          schedule: { kind: "at", atMs: futureTime },
        },
        ctx,
      );

      expect(result).toContain("Job created");
      expect(result).toContain("one-time");
      expect(result).toContain("at ");
    });

    it("should add job with cron schedule", async () => {
      const result = await tool.execute(
        {
          action: "add",
          name: "daily",
          instruction: "morning report",
          schedule: { kind: "cron", expr: "0 9 * * *" },
        },
        ctx,
      );

      expect(result).toContain("Job created");
      expect(result).toContain("0 9 * * *");
    });
  });

  describe("remove action", () => {
    it("should require jobId", async () => {
      const result = await tool.execute({ action: "remove" }, ctx);

      expect(result).toContain("Error");
      expect(result).toContain("jobId");
    });

    it("should remove existing job", async () => {
      const job = await service.addJob({
        name: "to-delete",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const result = await tool.execute(
        { action: "remove", jobId: job.id },
        ctx,
      );

      expect(result).toContain("Job removed");
      expect(result).toContain(job.id);
    });

    it("should report when job not found", async () => {
      const result = await tool.execute(
        { action: "remove", jobId: "non-existent" },
        ctx,
      );

      expect(result).toContain("Job not found");
    });
  });

  describe("run action", () => {
    it("should require jobId", async () => {
      const result = await tool.execute({ action: "run" }, ctx);

      expect(result).toContain("Error");
      expect(result).toContain("jobId");
    });

    it("should trigger existing job", async () => {
      const triggered: string[] = [];
      const triggerService = new CronService({
        storagePath: path.join(tempDir, "trigger-cron.json"),
        onTrigger: async (job) => {
          triggered.push(job.id);
        },
      });
      await triggerService.initialize();

      const triggerTool = createCronTool(triggerService);

      const job = await triggerService.addJob({
        name: "run-me",
        instruction: "test",
        schedule: { kind: "every", everyMs: 60000 },
        enabled: true,
      });

      const result = await triggerTool.execute(
        { action: "run", jobId: job.id },
        ctx,
      );

      expect(result).toContain("Job triggered");
      // runJob uses fire-and-forget; yield to let callback complete
      await new Promise((r) => setTimeout(r, 10));
      expect(triggered).toContain(job.id);

      await triggerService.shutdown();
    });

    it("should return error for non-existent job", async () => {
      const result = await tool.execute(
        { action: "run", jobId: "non-existent" },
        ctx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("Job not found");
    });
  });

  describe("unknown action", () => {
    it("should handle unknown action", async () => {
      const result = await tool.execute(
        { action: "invalid" as CronToolInput["action"] },
        ctx,
      );

      expect(result).toContain("Unknown action");
    });
  });

  describe("error handling", () => {
    it("should catch and return errors", async () => {
      const result = await tool.execute(
        {
          action: "add",
          name: "bad-cron",
          instruction: "test",
          schedule: { kind: "cron", expr: "invalid" },
        },
        ctx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("Invalid cron expression");
    });
  });
});
