import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  HeartbeatManager,
  type HeartbeatResult,
  type HeartbeatTask,
  type WakeRequest,
} from "./manager.js";

describe("HeartbeatManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "heartbeat-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const manager = new HeartbeatManager(tempDir);
      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.intervalMs).toBe(30 * 60 * 1000); // 30 minutes
      expect(status.started).toBe(false);
    });

    it("should accept custom config", () => {
      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 5000,
        enabled: false,
        activeHours: { start: "09:00", end: "18:00" },
      });
      const status = manager.getStatus();

      expect(status.enabled).toBe(false);
      expect(status.intervalMs).toBe(5000);
      expect(status.activeHours).toEqual({ start: "09:00", end: "18:00" });
    });
  });

  describe("parseTasks", () => {
    it("should return empty array when file does not exist", async () => {
      const manager = new HeartbeatManager(tempDir);
      const tasks = await manager.parseTasks();
      expect(tasks).toEqual([]);
    });

    it("should parse checkbox tasks", async () => {
      const content = `# Heartbeat Tasks

- [ ] Uncompleted task
- [x] Completed task
- [ ] Another pending`;

      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), content);

      const manager = new HeartbeatManager(tempDir);
      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(3);
      expect(tasks[0].description).toBe("Uncompleted task");
      expect(tasks[0].completed).toBe(false);
      expect(tasks[0].line).toBe(3);
      expect(tasks[1].description).toBe("Completed task");
      expect(tasks[1].completed).toBe(true);
      expect(tasks[2].completed).toBe(false);
    });

    it("should parse plain list items as incomplete tasks", async () => {
      const content = `# Tasks

- Simple task
- Another task`;

      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), content);

      const manager = new HeartbeatManager(tempDir);
      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(2);
      expect(tasks[0].description).toBe("Simple task");
      expect(tasks[0].completed).toBe(false);
    });

    it("should skip headings and empty lines", async () => {
      const content = `# Heading 1
## Heading 2

- [ ] Task

### Another heading`;

      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), content);

      const manager = new HeartbeatManager(tempDir);
      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBe("Task");
    });

    it("should support asterisk and plus list markers", async () => {
      const content = `* [ ] Task with asterisk
+ [ ] Task with plus`;

      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), content);

      const manager = new HeartbeatManager(tempDir);
      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(2);
    });

    it("should use custom heartbeat path", async () => {
      const customPath = path.join(tempDir, "custom", "tasks.md");
      await fs.mkdir(path.dirname(customPath), { recursive: true });
      await fs.writeFile(customPath, "- [ ] Custom path task");

      const manager = new HeartbeatManager(tempDir, {
        heartbeatPath: customPath,
      });
      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBe("Custom path task");
    });
  });

  describe("getPendingTasks", () => {
    it("should return only incomplete tasks", async () => {
      const content = `- [ ] Pending 1
- [x] Done
- [ ] Pending 2`;

      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), content);

      const manager = new HeartbeatManager(tempDir);
      const pending = await manager.getPendingTasks();

      expect(pending.length).toBe(2);
      expect(pending.every((t) => !t.completed)).toBe(true);
    });
  });

  describe("hasPendingTasks", () => {
    it("should return false when no tasks", async () => {
      const manager = new HeartbeatManager(tempDir);
      expect(await manager.hasPendingTasks()).toBe(false);
    });

    it("should return true when pending tasks exist", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir);
      expect(await manager.hasPendingTasks()).toBe(true);
    });

    it("should return false when all tasks completed", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [x] Done");

      const manager = new HeartbeatManager(tempDir);
      expect(await manager.hasPendingTasks()).toBe(false);
    });
  });

  describe("markCompleted", () => {
    it("should mark task as completed", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir);
      const result = await manager.markCompleted(1);

      expect(result).toBe(true);

      const content = await fs.readFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "utf-8",
      );
      expect(content).toBe("- [x] Task");
    });

    it("should return false for invalid line number", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir);

      expect(await manager.markCompleted(0)).toBe(false);
      expect(await manager.markCompleted(5)).toBe(false);
    });

    it("should return false when line has no checkbox", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "# Heading");

      const manager = new HeartbeatManager(tempDir);
      expect(await manager.markCompleted(1)).toBe(false);
    });

    it("should return false when file does not exist", async () => {
      const manager = new HeartbeatManager(tempDir);
      expect(await manager.markCompleted(1)).toBe(false);
    });
  });

  describe("addTask", () => {
    it("should create file if not exists", async () => {
      const manager = new HeartbeatManager(tempDir);
      await manager.addTask("New task");

      const content = await fs.readFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "utf-8",
      );
      expect(content).toContain("- [ ] New task");
      expect(content).toContain("# Heartbeat Tasks");
    });

    it("should append to existing file", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "# Tasks\n\n- [ ] First",
      );

      const manager = new HeartbeatManager(tempDir);
      await manager.addTask("Second");

      const content = await fs.readFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "utf-8",
      );
      expect(content).toContain("- [ ] First");
      expect(content).toContain("- [ ] Second");
    });
  });

  describe("start/stop", () => {
    it("should start when enabled", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.start();

      expect(manager.getStatus().started).toBe(true);

      manager.stop();
    });

    it("should not start when disabled", () => {
      const manager = new HeartbeatManager(tempDir, { enabled: false });
      manager.start();

      expect(manager.getStatus().started).toBe(false);
    });

    it("should stop correctly", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.start();
      manager.stop();

      expect(manager.getStatus().started).toBe(false);
    });

    it("should not start twice", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.start();
      manager.start();

      expect(manager.getStatus().started).toBe(true);

      manager.stop();
    });
  });

  describe("updateConfig", () => {
    it("should update intervalMs", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.updateConfig({ intervalMs: 5000 });

      expect(manager.getStatus().intervalMs).toBe(5000);
    });

    it("should update activeHours", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.updateConfig({ activeHours: { start: "10:00", end: "16:00" } });

      expect(manager.getStatus().activeHours).toEqual({
        start: "10:00",
        end: "16:00",
      });
    });

    it("should stop when disabled", () => {
      const manager = new HeartbeatManager(tempDir);
      manager.start();
      manager.updateConfig({ enabled: false });

      expect(manager.getStatus().started).toBe(false);
    });
  });

  describe("onTasks callback", () => {
    it("should register callback", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir);
      let callbackTasks: HeartbeatTask[] = [];

      manager.onTasks(async (tasks) => {
        callbackTasks = tasks;
        return { status: "ok" };
      });

      await manager.trigger();

      expect(callbackTasks.length).toBe(1);
      expect(callbackTasks[0].description).toBe("Task");
    });
  });

  describe("trigger", () => {
    it("should return pending tasks", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "- [ ] Pending\n- [x] Done",
      );

      const manager = new HeartbeatManager(tempDir);
      const result = await manager.trigger();

      expect(result.tasks?.length).toBe(1);
      expect(result.tasks?.[0].description).toBe("Pending");
    });

    it("should return empty when no pending tasks", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [x] Done");

      const manager = new HeartbeatManager(tempDir);
      const result = await manager.trigger();

      expect(result.status).toBe("skipped");
      expect(result.reason).toBe("no-pending-tasks");
    });
  });

  describe("active hours", () => {
    it("should skip when outside active hours", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      // Set active hours to a time window that doesn't include current time
      const now = new Date();
      const outOfRangeStart = `${(now.getHours() + 2) % 24}:00`;
      const outOfRangeEnd = `${(now.getHours() + 3) % 24}:00`;

      const manager = new HeartbeatManager(tempDir, {
        activeHours: { start: outOfRangeStart, end: outOfRangeEnd },
      });

      const result = await manager.trigger();

      // Should be skipped because we're outside active hours
      expect(result.status).toBe("skipped");
      expect(result.tasks ?? []).toHaveLength(0);
    });

    it("should execute when within active hours", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      // Set active hours to include current time
      const now = new Date();
      const inRangeStart = `${now.getHours()}:00`;
      const inRangeEnd = `${(now.getHours() + 2) % 24}:00`;

      const manager = new HeartbeatManager(tempDir, {
        activeHours: { start: inRangeStart, end: inRangeEnd },
      });

      const result = await manager.trigger();

      expect(result.tasks).toHaveLength(1);
    });
  });

  describe("getStatus", () => {
    it("should return complete status", () => {
      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 10000,
        activeHours: { start: "08:00", end: "20:00" },
      });

      const status = manager.getStatus();

      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("started");
      expect(status).toHaveProperty("nextDueMs");
      expect(status).toHaveProperty("lastRunAt");
      expect(status).toHaveProperty("intervalMs");
      expect(status).toHaveProperty("activeHours");
      expect(status.intervalMs).toBe(10000);
    });
  });

  describe("requestNow", () => {
    it("should trigger wake with custom reason", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        coalesceMs: 10, // Short coalesce for testing
      });

      let receivedReason: string | undefined;
      manager.onTasks(async (_tasks, request) => {
        receivedReason = request.reason;
        return { status: "ok" };
      });

      manager.requestNow("exec", "test-source");

      // Wait for coalesce window + callback execution (flaky test fix)
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(receivedReason).toBe("exec");
    });

    it("should merge multiple requests with priority", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        coalesceMs: 50,
      });

      let receivedReason: string | undefined;
      manager.onTasks(async (_tasks, request) => {
        receivedReason = request.reason;
        return { status: "ok" };
      });

      // Request multiple times within coalesce window
      // Priority: exec > cron > interval > requested
      manager.requestNow("requested");
      manager.requestNow("interval");
      manager.requestNow("cron");

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should use highest priority reason
      expect(receivedReason).toBe("cron");
    });
  });

  describe("duplicate message suppression", () => {
    it("should suppress duplicate messages within window", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        duplicateWindowMs: 1000,
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok", text: "Same message" };
      });

      // First trigger
      await manager.trigger();
      expect(callCount).toBe(1);

      // Second trigger with same text should still call callback
      // but the result status may be skipped
      await manager.trigger();
      expect(callCount).toBe(2);
    });
  });

  describe("active hours edge cases", () => {
    it("should handle overnight active hours (22:00 - 06:00)", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const now = new Date();
      const currentHour = now.getHours();

      // Test if current hour is within 22:00-06:00
      const isOvernight = currentHour >= 22 || currentHour < 6;

      const manager = new HeartbeatManager(tempDir, {
        activeHours: { start: "22:00", end: "06:00" },
      });

      const result = await manager.trigger();

      if (isOvernight) {
        expect(result.tasks).toHaveLength(1);
      } else {
        expect(result.status).toBe("skipped");
        expect(result.tasks ?? []).toHaveLength(0);
      }
    });
  });

  describe("callback error handling", () => {
    it("should continue after callback error", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir);

      let secondCallbackCalled = false;

      manager.onTasks(async () => {
        throw new Error("First callback error");
      });

      manager.onTasks(async () => {
        secondCallbackCalled = true;
        return { status: "ok" };
      });

      // Should not throw
      await manager.trigger();

      expect(secondCallbackCalled).toBe(true);
    });
  });

  describe("interval scheduling", () => {
    it("should schedule next run after trigger", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 100,
      });

      manager.start();

      // Trigger once
      await manager.trigger();

      const status = manager.getStatus();
      expect(status.lastRunAt).not.toBeNull();
      expect(status.nextDueMs).toBeGreaterThan(0);

      manager.stop();
    });

    it("should not start when intervalMs is 0", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 0,
      });

      manager.start();

      const status = manager.getStatus();
      expect(status.started).toBe(false);

      manager.stop();
    });

    it("should not start when intervalMs is negative", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: -1,
      });

      manager.start();

      const status = manager.getStatus();
      expect(status.started).toBe(false);

      manager.stop();
    });
  });

  // ============================================================
  // Stage 1: Timer Lifecycle Tests
  // Test that timers actually fire, reschedule, and coalesce.
  // Uses short intervals (50-100ms) to keep tests fast.
  // ============================================================

  describe("timer lifecycle (Stage 1)", () => {
    it("start() fires callback automatically on interval", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 50,
        coalesceMs: 10,
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok" };
      });

      manager.start();

      // Wait long enough for at least 1 interval to fire
      await new Promise((resolve) => setTimeout(resolve, 200));
      manager.stop();

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it("rescheduling loop fires callback multiple times", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 60,
        coalesceMs: 10,
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok" };
      });

      manager.start();

      // Wait for multiple intervals
      await new Promise((resolve) => setTimeout(resolve, 400));
      manager.stop();

      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("stop() prevents pending timer from firing", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 100,
        coalesceMs: 10,
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok" };
      });

      manager.start();
      // Stop immediately before the first interval fires
      manager.stop();

      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(callCount).toBe(0);
    });

    it("start() after stop() resumes timer cycle", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 50,
        coalesceMs: 10,
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok" };
      });

      manager.start();
      manager.stop();
      expect(callCount).toBe(0);

      // Re-start
      manager.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      manager.stop();

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it("double-buffering: request during execution is queued and runs after", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 5000, // Long interval so timer doesn't interfere
        coalesceMs: 10,
      });

      const reasons: string[] = [];
      manager.onTasks(async (_tasks, request) => {
        reasons.push(request.reason);
        if (reasons.length === 1) {
          // While first callback is running, request another wake
          manager.requestNow("exec", "test");
          // Simulate some async work so the double-buffer has time to register
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return { status: "ok" };
      });

      // Trigger the first execution
      manager.requestNow("requested");

      // Wait for both executions to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      manager.stop();

      // First call was "requested", second call should be "exec" (double-buffered)
      expect(reasons.length).toBe(2);
      expect(reasons[0]).toBe("requested");
      expect(reasons[1]).toBe("exec");
    });

    it("coalescing merges multiple requests into one execution", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 5000,
        coalesceMs: 100,
      });

      let callCount = 0;
      let receivedReason: string | undefined;
      manager.onTasks(async (_tasks, request) => {
        callCount++;
        receivedReason = request.reason;
        return { status: "ok" };
      });

      // Fire multiple requests within the coalesce window
      manager.requestNow("requested");
      manager.requestNow("interval");
      manager.requestNow("cron");

      // Wait for coalesce + execution
      await new Promise((resolve) => setTimeout(resolve, 300));
      manager.stop();

      // Should have coalesced into a single call with highest priority reason
      expect(callCount).toBe(1);
      expect(receivedReason).toBe("cron");
    });

    it("active hours gating works with timer-driven execution", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      // Set active hours to exclude current time
      const now = new Date();
      const outStart = `${(now.getHours() + 2) % 24}:00`;
      const outEnd = `${(now.getHours() + 3) % 24}:00`;

      const manager = new HeartbeatManager(tempDir, {
        intervalMs: 50,
        coalesceMs: 10,
        activeHours: { start: outStart, end: outEnd },
      });

      let callCount = 0;
      manager.onTasks(async () => {
        callCount++;
        return { status: "ok" };
      });

      manager.start();
      await new Promise((resolve) => setTimeout(resolve, 250));
      manager.stop();

      // Callback should never be called because we're outside active hours
      expect(callCount).toBe(0);
    });
  });

  // ============================================================
  // Stage 2: Agent Processing Tests
  // Test runOnce() logic: what input goes in, what comes out.
  // Uses trigger() which is a synchronous wrapper for runOnce().
  // ============================================================

  describe("agent processing (Stage 2)", () => {
    it("exec reason bypasses empty-task skip", async () => {
      // No pending tasks — all completed
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [x] Done");

      const manager = new HeartbeatManager(tempDir);

      let callbackInvoked = false;
      let receivedTasks: HeartbeatTask[] = [];
      let receivedRequest: WakeRequest | undefined;
      manager.onTasks(async (tasks, request) => {
        callbackInvoked = true;
        receivedTasks = tasks;
        receivedRequest = request;
        return { status: "ok" };
      });

      // Use requestNow with "exec" reason — should call callback even with no pending tasks
      manager.requestNow("exec");
      await new Promise((resolve) => setTimeout(resolve, 400));
      manager.stop();

      expect(callbackInvoked).toBe(true);
      expect(receivedTasks).toHaveLength(0);
      expect(receivedRequest?.reason).toBe("exec");
    });

    it("non-exec reason skips when no pending tasks", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [x] Done");

      const manager = new HeartbeatManager(tempDir);

      let callbackInvoked = false;
      manager.onTasks(async () => {
        callbackInvoked = true;
        return { status: "ok" };
      });

      const result = await manager.trigger();

      expect(callbackInvoked).toBe(false);
      expect(result.status).toBe("skipped");
      expect(result.reason).toBe("no-pending-tasks");
    });

    it("duplicate suppression returns skipped status with correct reason", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        duplicateWindowMs: 5000,
      });

      manager.onTasks(async () => {
        return { status: "ok", text: "Same response text" };
      });

      // First trigger — should succeed
      const first = await manager.trigger();
      expect(first.status).toBe("ok");
      expect(first.text).toBe("Same response text");

      // Second trigger with same text — should be skipped as duplicate
      const second = await manager.trigger();
      expect(second.status).toBe("skipped");
      expect(second.reason).toBe("duplicate-message");
    });

    it("duplicate suppression expires after window", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        duplicateWindowMs: 50, // Very short window for testing
      });

      manager.onTasks(async () => {
        return { status: "ok", text: "Same response" };
      });

      // First trigger
      const first = await manager.trigger();
      expect(first.status).toBe("ok");

      // Wait for the duplicate window to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should no longer be suppressed
      const second = await manager.trigger();
      expect(second.status).toBe("ok");
      expect(second.text).toBe("Same response");
    });

    it("different text is not suppressed", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        duplicateWindowMs: 5000,
      });

      let callIndex = 0;
      manager.onTasks(async () => {
        callIndex++;
        return { status: "ok", text: `Response ${callIndex}` };
      });

      const first = await manager.trigger();
      expect(first.status).toBe("ok");

      const second = await manager.trigger();
      expect(second.status).toBe("ok");
      expect(second.text).toBe("Response 2");
    });

    it("callback receives correct tasks and wake request", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "- [ ] Alpha\n- [x] Beta\n- [ ] Gamma",
      );

      const manager = new HeartbeatManager(tempDir);

      let receivedTasks: HeartbeatTask[] = [];
      let receivedRequest: WakeRequest | undefined;
      manager.onTasks(async (tasks, request) => {
        receivedTasks = tasks;
        receivedRequest = request;
        return { status: "ok" };
      });

      await manager.trigger();

      // Should receive only pending tasks (not completed Beta)
      expect(receivedTasks).toHaveLength(2);
      expect(receivedTasks[0].description).toBe("Alpha");
      expect(receivedTasks[0].completed).toBe(false);
      expect(receivedTasks[1].description).toBe("Gamma");
      expect(receivedTasks[1].completed).toBe(false);

      // Request should have reason "requested" (from trigger())
      expect(receivedRequest?.reason).toBe("requested");
    });

    it("callback result text is stored for duplicate detection", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] Task");

      const manager = new HeartbeatManager(tempDir, {
        duplicateWindowMs: 5000,
      });

      // First callback returns text, second returns nothing
      let callIndex = 0;
      manager.onTasks(async () => {
        callIndex++;
        if (callIndex === 1) return { status: "ok", text: "Agent said hello" };
        return { status: "ok" }; // No text
      });

      const first = await manager.trigger();
      expect(first.text).toBe("Agent said hello");

      // Second trigger — callback returns no text, so no duplicate check
      const second = await manager.trigger();
      expect(second.status).toBe("ok");
      expect(second.text).toBeUndefined();
    });
  });
});
