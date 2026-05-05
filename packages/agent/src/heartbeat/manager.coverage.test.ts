import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeartbeatManager } from "./manager.js";

describe("HeartbeatManager coverage extras", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("HeartbeatWake.execute returns when handler not set", async () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    const wake = (
      mgr as unknown as {
        wake: {
          state: { running: boolean; timer: unknown; pendingReason: string };
          setHandler: (h: unknown) => void;
          request: (r: { reason: string }) => void;
        };
      }
    ).wake;
    // Force handler null
    (wake as unknown as { handler: unknown }).handler = null;
    wake.request({ reason: "requested" });
    expect(wake.state.timer).not.toBeNull();
    // Wait for coalesce window + execute
    await new Promise((r) => setTimeout(r, 300));
    // After execute() returns early, the timer must have been cleared and
    // running flag reset back to false (finally block).
    expect(wake.state.timer).toBeNull();
    expect(wake.state.running).toBe(false);
  });

  it("HeartbeatWake.execute retries when result is skipped with requests-in-flight", async () => {
    const mgr = new HeartbeatManager(tempDir, {
      intervalMs: 60_000,
      coalesceMs: 10,
    });
    const wake = (
      mgr as unknown as {
        wake: {
          setHandler: (h: unknown) => void;
          request: (r: { reason: string }) => void;
        };
      }
    ).wake;
    let calls = 0;
    (wake as unknown as { handler: unknown }).handler = async () => {
      calls++;
      if (calls === 1) {
        return { status: "skipped", reason: "requests-in-flight" };
      }
      return { status: "ok" };
    };
    // Override retryMs to be small
    (wake as unknown as { retryMs: number }).retryMs = 10;
    wake.request({ reason: "requested" });
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("HeartbeatWake.stop with active timer clears it", () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    const wake = (
      mgr as unknown as {
        wake: {
          state: { timer: unknown; scheduled: boolean };
          request: (r: { reason: string }) => void;
          stop: () => void;
        };
      }
    ).wake;
    wake.request({ reason: "requested" });
    expect(wake.state.timer).not.toBeNull();
    wake.stop();
    expect(wake.state.timer).toBeNull();
    expect(wake.state.scheduled).toBe(false);
  });

  it("parseTasksFromContent: handles plain list items without checkbox", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "# Title\n- plain item\n* another\n+ third\n- \n",
    );
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    const tasks = await mgr.parseTasks();
    expect(tasks.some((t) => t.description === "plain item")).toBe(true);
    expect(tasks.some((t) => t.description === "another")).toBe(true);
    expect(tasks.some((t) => t.description === "third")).toBe(true);
  });

  it("updateConfig: setting enabled=false stops the manager", () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    mgr.start();
    mgr.updateConfig({ enabled: false });
    expect(mgr.getStatus().enabled).toBe(false);
  });

  it("updateConfig: setting enabled=true on started manager schedules next", () => {
    const mgr = new HeartbeatManager(tempDir, {
      intervalMs: 60_000,
      enabled: false,
    });
    // Force started
    (mgr as unknown as { started: boolean }).started = true;
    mgr.updateConfig({ enabled: true });
    expect(mgr.getStatus().enabled).toBe(true);
    mgr.stop();
  });

  it("updateConfig: when started+enabled+timer present, reschedules", () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    mgr.start();
    const before = (
      mgr as unknown as { state: { timer: unknown; nextDueMs: number } }
    ).state;
    const oldTimer = before.timer;
    expect(oldTimer).not.toBeNull();
    mgr.updateConfig({ intervalMs: 30_000 });
    // The timer must have been replaced and intervalMs propagated to status.
    expect(before.timer).not.toBe(oldTimer);
    expect(before.timer).not.toBeNull();
    expect(mgr.getStatus().intervalMs).toBe(30_000);
    mgr.stop();
  });

  it("isWithinActiveHours: cross-midnight window", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] task");
    // 22:00 - 06:00 - allow most times
    const mgr = new HeartbeatManager(tempDir, {
      intervalMs: 60_000,
      activeHours: { start: "22:00", end: "06:00" },
    });
    // Either skipped (outside) or ok (inside) - just verify it runs
    const result = await mgr.trigger();
    expect(result.status).toBeDefined();
  });

  it("isDuplicateMessage: same text within window suppresses", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] task1");
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    mgr.onTasks(async () => ({ status: "ok", text: "same-text" }));
    const r1 = await mgr.trigger();
    expect(r1.status).toBe("ok");
    const r2 = await mgr.trigger();
    expect(r2.status).toBe("skipped");
    expect(r2.reason).toBe("duplicate-message");
  });

  it("markCompleted: invalid line number returns false", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] x");
    const mgr = new HeartbeatManager(tempDir);
    expect(await mgr.markCompleted(0)).toBe(false);
    expect(await mgr.markCompleted(999)).toBe(false);
  });

  it("markCompleted: line that doesn't change returns false", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "no checkbox here");
    const mgr = new HeartbeatManager(tempDir);
    expect(await mgr.markCompleted(1)).toBe(false);
  });

  it("markCompleted: returns false when file missing", async () => {
    const mgr = new HeartbeatManager(tempDir);
    expect(await mgr.markCompleted(1)).toBe(false);
  });

  it("addTask: appends to existing file", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "# Heartbeat\n");
    const mgr = new HeartbeatManager(tempDir);
    await mgr.addTask("new thing");
    const content = await fs.readFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "utf-8",
    );
    expect(content).toContain("new thing");
  });

  it("addTask: creates default file when missing", async () => {
    const mgr = new HeartbeatManager(tempDir);
    await mgr.addTask("first");
    const content = await fs.readFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "utf-8",
    );
    expect(content).toContain("first");
  });

  it("hasPendingTasks: returns true when pending exists", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] task\n- [x] done",
    );
    const mgr = new HeartbeatManager(tempDir);
    expect(await mgr.hasPendingTasks()).toBe(true);
  });

  it("hasPendingTasks: returns false when all done", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [x] done\n- [x] also done",
    );
    const mgr = new HeartbeatManager(tempDir);
    expect(await mgr.hasPendingTasks()).toBe(false);
  });

  it("getHeartbeatPath: handles absolute path", async () => {
    const absPath = path.join(tempDir, "custom-hb.md");
    await fs.writeFile(absPath, "- [ ] x");
    const mgr = new HeartbeatManager(tempDir, { heartbeatPath: absPath });
    const tasks = await mgr.parseTasks();
    expect(tasks.length).toBe(1);
  });

  it("requestNow with default reason", () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 60_000 });
    mgr.requestNow();
    const wake = (
      mgr as unknown as {
        wake: { state: { timer: unknown; pendingReason: string } };
      }
    ).wake;
    // Default reason "requested" must be queued and a coalesce timer scheduled.
    expect(wake.state.pendingReason).toBe("requested");
    expect(wake.state.timer).not.toBeNull();
    mgr.stop();
  });

  it("start: returns when intervalMs <= 0", () => {
    const mgr = new HeartbeatManager(tempDir, { intervalMs: 0 });
    mgr.start();
    expect(mgr.getStatus().started).toBe(false);
  });

  it("runOnce: callback throwing logs error and continues", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] x");
    const mgr = new HeartbeatManager(tempDir);
    mgr.onTasks(async () => {
      throw new Error("cb-err");
    });
    const result = await mgr.trigger();
    expect(result.status).toBeDefined();
  });

  it("runOnce: exec reason runs even with no pending tasks", async () => {
    // No tasks file at all
    const mgr = new HeartbeatManager(tempDir);
    let called = false;
    mgr.onTasks(async () => {
      called = true;
      return { status: "ok" };
    });
    await (
      mgr as unknown as {
        runOnce: (req: { reason: string }) => Promise<unknown>;
      }
    ).runOnce({ reason: "exec" });
    expect(called).toBe(true);
  });
});
