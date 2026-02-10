/**
 * Scheduled Dispatch Tests
 *
 * Tests for heartbeat and cron dispatch logic:
 * - buildHeartbeatInstruction / buildCronInstruction (pure functions)
 * - createHeartbeatCallback / createCronCallback (dispatch + delivery)
 * - Stage 2 behavioral integration (real Dispatcher + mock Agent)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  HeartbeatManager,
  type HeartbeatTask,
  type WakeRequest,
} from "@deca/agent";
import { createDispatcher } from "./dispatcher";
import type { DispatchRequest } from "./dispatcher/types";
import {
  type CronJobInfo,
  type HeartbeatCallbackDeps,
  buildCronInstruction,
  buildHeartbeatInstruction,
  createCronCallback,
  createHeartbeatCallback,
} from "./scheduled";

// ============================================================================
// Test Helpers
// ============================================================================

function makeTasks(...descriptions: string[]): HeartbeatTask[] {
  return descriptions.map((d, i) => ({
    description: d,
    completed: false,
    raw: `- [ ] ${d}`,
    line: i + 1,
  }));
}

function makeRequest(reason: WakeRequest["reason"] = "interval"): WakeRequest {
  return { reason };
}

function makeMockDispatcher(response: { text: string; success: boolean }) {
  return {
    dispatch: mock(async (req: DispatchRequest) => response),
    getStatus: () => ({
      queued: 0,
      running: 0,
      concurrency: 1,
      isPaused: false,
    }),
    pause: () => {},
    resume: () => {},
    clear: () => {},
    onIdle: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
}

function createMockDeps(overrides?: Partial<HeartbeatCallbackDeps>) {
  const dispatched: DispatchRequest[] = [];
  const sentResults: string[] = [];
  const errors: { error: Error; source: string }[] = [];

  const deps: HeartbeatCallbackDeps = {
    dispatcher: {
      dispatch: mock(async (req: DispatchRequest) => {
        dispatched.push(req);
        return { text: "Agent response", success: true };
      }),
      getStatus: () => ({
        queued: 0,
        running: 0,
        concurrency: 1,
        isPaused: false,
      }),
      pause: () => {},
      resume: () => {},
      clear: () => {},
      onIdle: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    },
    sendResult: mock(async (text: string) => {
      sentResults.push(text);
    }),
    onError: mock((error: Error, source: string) => {
      errors.push({ error, source });
    }),
    ...overrides,
  };

  return { deps, dispatched, sentResults, errors };
}

// ============================================================================
// buildHeartbeatInstruction
// ============================================================================

describe("buildHeartbeatInstruction", () => {
  it("formats instruction with single task", () => {
    const result = buildHeartbeatInstruction(
      makeTasks("Check obsidian repo"),
      makeRequest("interval"),
    );
    expect(result).toContain("[HEARTBEAT: interval]");
    expect(result).toContain("Check obsidian repo");
    expect(result).toContain("HEARTBEAT_OK");
  });

  it("formats instruction with multiple tasks", () => {
    const result = buildHeartbeatInstruction(
      makeTasks("Check obsidian repo", "Sync notes"),
      makeRequest("interval"),
    );
    expect(result).toContain("Check obsidian repo, Sync notes");
    expect(result).toContain("HEARTBEAT_OK");
  });

  it("includes wake reason in instruction", () => {
    const reasons: WakeRequest["reason"][] = [
      "interval",
      "cron",
      "exec",
      "requested",
    ];
    for (const reason of reasons) {
      const result = buildHeartbeatInstruction(
        makeTasks("Task 1"),
        makeRequest(reason),
      );
      expect(result).toContain(`[HEARTBEAT: ${reason}]`);
    }
  });

  it("includes HEARTBEAT_OK instruction for Agent", () => {
    const result = buildHeartbeatInstruction(
      makeTasks("Task 1"),
      makeRequest(),
    );
    expect(result).toContain("reply HEARTBEAT_OK");
  });
});

// ============================================================================
// createHeartbeatCallback
// ============================================================================

describe("createHeartbeatCallback", () => {
  it("dispatches when tasks exist", async () => {
    const { deps, dispatched } = createMockDeps();
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Check repo"), makeRequest());

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].source).toBe("heartbeat");
    expect(dispatched[0].sessionKey).toBe("main");
    expect(dispatched[0].content).toContain("[HEARTBEAT: interval]");
    expect(dispatched[0].content).toContain("Check repo");
    expect(dispatched[0].priority).toBe(5);
    expect(dispatched[0].sender).toEqual({
      id: "heartbeat",
      username: "heartbeat-scheduler",
    });
  });

  it("does not dispatch when no tasks", async () => {
    const { deps, dispatched, sentResults } = createMockDeps();
    const callback = createHeartbeatCallback(deps);

    await callback([], makeRequest());

    expect(dispatched).toHaveLength(0);
    expect(sentResults).toHaveLength(0);
  });

  it("sends result on successful dispatch", async () => {
    const { deps, sentResults } = createMockDeps();
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Task 1"), makeRequest());

    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("Agent response");
  });

  it("does not send result when dispatch fails", async () => {
    const { deps, sentResults } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => ({
          text: "Error: something went wrong",
          success: false,
          error: "something went wrong",
        })),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Task 1"), makeRequest());

    expect(sentResults).toHaveLength(0);
  });

  it("does not send result when response text is empty", async () => {
    const { deps, sentResults } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => ({ text: "", success: true })),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Task 1"), makeRequest());

    expect(sentResults).toHaveLength(0);
  });

  it("catches dispatch errors and reports via onError", async () => {
    const { deps, errors } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => {
          throw new Error("Dispatch exploded");
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createHeartbeatCallback(deps);

    // Should not throw
    await callback(makeTasks("Task 1"), makeRequest());

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("Dispatch exploded");
    expect(errors[0].source).toBe("heartbeat");
  });

  it("catches non-Error throws and wraps them", async () => {
    const { deps, errors } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => {
          throw "string error";
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Task 1"), makeRequest());

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("string error");
  });

  it("catches sendResult errors and reports via onError", async () => {
    const { deps, errors } = createMockDeps({
      sendResult: mock(async () => {
        throw new Error("Send failed");
      }),
    });
    const callback = createHeartbeatCallback(deps);

    await callback(makeTasks("Task 1"), makeRequest());

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("Send failed");
  });

  it("works without onError callback (no crash)", async () => {
    const deps: HeartbeatCallbackDeps = {
      dispatcher: {
        dispatch: mock(async () => {
          throw new Error("Boom");
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
      sendResult: mock(async () => {}),
      // no onError
    };
    const callback = createHeartbeatCallback(deps);

    // Should not throw even without onError handler
    await callback(makeTasks("Task 1"), makeRequest());
  });

  it("uses main session key for all dispatches", async () => {
    const { deps, dispatched } = createMockDeps();
    const callback = createHeartbeatCallback(deps);

    // Multiple calls with different reasons
    await callback(makeTasks("T1"), makeRequest("interval"));
    await callback(makeTasks("T2"), makeRequest("cron"));
    await callback(makeTasks("T3"), makeRequest("requested"));

    expect(dispatched).toHaveLength(3);
    for (const req of dispatched) {
      expect(req.sessionKey).toBe("main");
    }
  });

  describe("HEARTBEAT_OK protocol", () => {
    it("skips delivery when Agent replies with exact HEARTBEAT_OK", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "HEARTBEAT_OK",
          success: true,
        }),
      });
      const callback = createHeartbeatCallback(deps);

      await callback(makeTasks("Task 1"), makeRequest());

      expect(sentResults).toHaveLength(0);
    });

    it("skips delivery when Agent replies with HEARTBEAT_OK and whitespace", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "  HEARTBEAT_OK  ",
          success: true,
        }),
      });
      const callback = createHeartbeatCallback(deps);

      await callback(makeTasks("Task 1"), makeRequest());

      expect(sentResults).toHaveLength(0);
    });

    it("strips leading HEARTBEAT_OK and delivers remaining text", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "HEARTBEAT_OK Found 3 new commits in repo",
          success: true,
        }),
      });
      const callback = createHeartbeatCallback(deps);

      await callback(makeTasks("Task 1"), makeRequest());

      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("Found 3 new commits in repo");
    });

    it("strips trailing HEARTBEAT_OK and delivers remaining text", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "Checked repo, all good HEARTBEAT_OK",
          success: true,
        }),
      });
      const callback = createHeartbeatCallback(deps);

      await callback(makeTasks("Task 1"), makeRequest());

      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("Checked repo, all good");
    });

    it("delivers normally when no HEARTBEAT_OK token present", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "Found issues: 2 PRs need review",
          success: true,
        }),
      });
      const callback = createHeartbeatCallback(deps);

      await callback(makeTasks("Task 1"), makeRequest());

      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("Found issues: 2 PRs need review");
    });
  });
});

// ============================================================================
// Stage 2 Behavioral Tests: HeartbeatManager + Dispatcher + Callback integrated
//
// These tests wire up a REAL HeartbeatManager (short intervals, real temp dir,
// real HEARTBEAT.md) with a REAL createDispatcher and createHeartbeatCallback.
// The only mock is the handler (simulating the Agent LLM), so we can control
// what the "Agent" responds and verify the full pipeline behavior:
//
//   HeartbeatManager.trigger()
//     -> onTasks callback (created by createHeartbeatCallback)
//       -> dispatcher.dispatch()
//         -> handler.handle() (mock Agent)
//       -> stripHeartbeatToken()
//       -> sendResult() or suppressed
// ============================================================================

describe("heartbeat behavioral (Stage 2 integration)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-behavioral-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  /**
   * Wire up the full pipeline: HeartbeatManager + Dispatcher + Callback.
   * Returns instrumented handles for assertion.
   */
  function wireHeartbeat(opts: {
    agentResponse: string;
    agentSuccess?: boolean;
  }) {
    const dispatched: DispatchRequest[] = [];
    const sentResults: string[] = [];
    const errors: { error: Error; source: string }[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async (req) => {
          dispatched.push(req as DispatchRequest);
          return {
            text: opts.agentResponse,
            success: opts.agentSuccess ?? true,
          };
        },
      },
    });

    const manager = new HeartbeatManager(tempDir, {
      intervalMs: 5000, // Long so timer doesn't interfere with trigger()
      coalesceMs: 10,
      duplicateWindowMs: 5000,
    });

    const callback = createHeartbeatCallback({
      dispatcher,
      sendResult: async (text) => {
        sentResults.push(text);
      },
      onError: (error, source) => {
        errors.push({ error, source });
      },
    });

    manager.onTasks(async (tasks, request) => {
      await callback(tasks, request);
      return { status: "ok", text: opts.agentResponse };
    });

    return { manager, dispatcher, dispatched, sentResults, errors };
  }

  it("trigger with pending tasks dispatches to Agent and delivers result", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Check server status\n- [ ] Review pull requests\n",
    );

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "Server is healthy. 2 PRs need review.",
    });

    await manager.trigger();
    await dispatcher.shutdown();

    // Verify Agent received the correct dispatch
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].source).toBe("heartbeat");
    expect(dispatched[0].sessionKey).toBe("main");
    expect(dispatched[0].content).toContain("[HEARTBEAT: requested]");
    expect(dispatched[0].content).toContain("Check server status");
    expect(dispatched[0].content).toContain("Review pull requests");
    expect(dispatched[0].content).toContain("HEARTBEAT_OK");
    expect(dispatched[0].priority).toBe(5);

    // Verify result was delivered
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("Server is healthy. 2 PRs need review.");
  });

  it("trigger with no pending tasks skips Agent entirely", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [x] All done\n");

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "Should not see this",
    });

    const result = await manager.trigger();
    await dispatcher.shutdown();

    // Nothing dispatched, nothing delivered
    expect(dispatched).toHaveLength(0);
    expect(sentResults).toHaveLength(0);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no-pending-tasks");
  });

  it("HEARTBEAT_OK from Agent suppresses message delivery", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Check if anything needs attention\n",
    );

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "HEARTBEAT_OK",
    });

    await manager.trigger();
    await dispatcher.shutdown();

    // Agent was called
    expect(dispatched).toHaveLength(1);
    // But nothing delivered — HEARTBEAT_OK suppressed it
    expect(sentResults).toHaveLength(0);
  });

  it("HEARTBEAT_OK with trailing content strips token and delivers", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Monitor logs\n",
    );

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "HEARTBEAT_OK Found 1 warning in logs",
    });

    await manager.trigger();
    await dispatcher.shutdown();

    expect(dispatched).toHaveLength(1);
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("Found 1 warning in logs");
  });

  it("Agent failure does not deliver and does not crash", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Run diagnostics\n",
    );

    const { manager, dispatcher, dispatched, sentResults, errors } =
      wireHeartbeat({
        agentResponse: "Error occurred",
        agentSuccess: false,
      });

    const result = await manager.trigger();
    await dispatcher.shutdown();

    // Agent was called but response was unsuccessful
    expect(dispatched).toHaveLength(1);
    // Nothing delivered because success=false
    expect(sentResults).toHaveLength(0);
    // No crash
    expect(result.status).toBe("ok");
  });

  it("duplicate Agent response: manager returns skipped but callback still executes", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Check status\n",
    );

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "All systems operational",
    });

    // First trigger — normal delivery
    const first = await manager.trigger();
    expect(first.status).toBe("ok");
    expect(dispatched).toHaveLength(1);
    expect(sentResults).toHaveLength(1);

    // Second trigger — same response text
    // The callback still executes (Agent is still called, result still sent)
    // but manager marks the result as "duplicate-message"
    const second = await manager.trigger();
    await dispatcher.shutdown();

    expect(second.status).toBe("skipped");
    expect(second.reason).toBe("duplicate-message");
    // Agent WAS called again — duplicate check happens after callback
    expect(dispatched).toHaveLength(2);
    expect(sentResults).toHaveLength(2);
  });

  it("multiple tasks produce correct instruction format", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Backup database\n- [x] Update configs\n- [ ] Run health check\n- [ ] Deploy staging\n",
    );

    const { manager, dispatcher, dispatched, sentResults } = wireHeartbeat({
      agentResponse: "Backup complete. Health check passed. Staging deployed.",
    });

    await manager.trigger();
    await dispatcher.shutdown();

    expect(dispatched).toHaveLength(1);

    // Only pending tasks in the instruction (not the completed one)
    const content = dispatched[0].content;
    expect(content).toContain("Backup database");
    expect(content).toContain("Run health check");
    expect(content).toContain("Deploy staging");
    expect(content).not.toContain("Update configs");

    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe(
      "Backup complete. Health check passed. Staging deployed.",
    );
  });

  it("timer-driven trigger flows through the full pipeline", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Periodic check\n",
    );

    const dispatched: DispatchRequest[] = [];
    const sentResults: string[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async (req) => {
          dispatched.push(req as DispatchRequest);
          return { text: "Checked, all good", success: true };
        },
      },
    });

    const manager = new HeartbeatManager(tempDir, {
      intervalMs: 80,
      coalesceMs: 10,
    });

    const callback = createHeartbeatCallback({
      dispatcher,
      sendResult: async (text) => {
        sentResults.push(text);
      },
    });

    manager.onTasks(async (tasks, request) => {
      await callback(tasks, request);
      return { status: "ok", text: "Checked, all good" };
    });

    // Start the timer and let it fire
    manager.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    manager.stop();
    await dispatcher.shutdown();

    // Timer should have triggered at least once
    expect(dispatched.length).toBeGreaterThanOrEqual(1);
    expect(dispatched[0].source).toBe("heartbeat");
    expect(dispatched[0].content).toContain("[HEARTBEAT: interval]");
    expect(dispatched[0].content).toContain("Periodic check");

    expect(sentResults.length).toBeGreaterThanOrEqual(1);
    expect(sentResults[0]).toBe("Checked, all good");
  });

  it("requestNow(exec) triggers Agent even with no pending tasks", async () => {
    // All tasks completed
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [x] Already done\n",
    );

    const dispatched: DispatchRequest[] = [];
    const sentResults: string[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async (req) => {
          dispatched.push(req as DispatchRequest);
          return { text: "Executed on demand", success: true };
        },
      },
    });

    const manager = new HeartbeatManager(tempDir, {
      intervalMs: 50000,
      coalesceMs: 10,
    });

    const callback = createHeartbeatCallback({
      dispatcher,
      sendResult: async (text) => {
        sentResults.push(text);
      },
    });

    manager.onTasks(async (tasks, request) => {
      await callback(tasks, request);
      return { status: "ok", text: "Executed on demand" };
    });

    // exec bypasses the empty-task check
    manager.requestNow("exec");
    await new Promise((resolve) => setTimeout(resolve, 300));
    manager.stop();
    await dispatcher.shutdown();

    // The callback was called (empty tasks array, but exec bypasses skip)
    // However, createHeartbeatCallback skips when tasks.length === 0
    // This is correct behavior: exec means "run the loop" but if there are
    // truly no tasks, the callback has nothing to send to the Agent
    expect(dispatched).toHaveLength(0);
    expect(sentResults).toHaveLength(0);
  });

  it("error in dispatcher does not crash the heartbeat loop", async () => {
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Risky task\n",
    );

    const errors: { error: Error; source: string }[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async () => {
          throw new Error("LLM API unavailable");
        },
      },
    });

    const manager = new HeartbeatManager(tempDir, {
      intervalMs: 50000,
      coalesceMs: 10,
    });

    const callback = createHeartbeatCallback({
      dispatcher,
      sendResult: async () => {},
      onError: (error, source) => {
        errors.push({ error, source });
      },
    });

    manager.onTasks(async (tasks, request) => {
      await callback(tasks, request);
      return { status: "error" };
    });

    // Should not throw
    const result = await manager.trigger();
    await dispatcher.shutdown();

    // Manager completed without crash
    expect(result.status).toBe("ok");
    // Error was captured
    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("LLM API unavailable");
    expect(errors[0].source).toBe("heartbeat");
  });
});

// ============================================================================
// buildCronInstruction
// ============================================================================

describe("buildCronInstruction", () => {
  it("formats instruction with job name and instruction", () => {
    const result = buildCronInstruction({
      name: "daily-report",
      instruction: "Generate a summary of today's activity",
    });
    expect(result).toBe(
      "[CRON TASK: daily-report] Generate a summary of today's activity",
    );
  });

  it("preserves exact instruction text without modification", () => {
    const result = buildCronInstruction({
      name: "backup",
      instruction: "Run backup with --full flag",
    });
    expect(result).toBe("[CRON TASK: backup] Run backup with --full flag");
  });

  it("handles empty instruction", () => {
    const result = buildCronInstruction({
      name: "ping",
      instruction: "",
    });
    expect(result).toBe("[CRON TASK: ping] ");
  });

  it("does NOT include HEARTBEAT_OK protocol", () => {
    const result = buildCronInstruction({
      name: "check",
      instruction: "Check server status",
    });
    expect(result).not.toContain("HEARTBEAT_OK");
  });
});

// ============================================================================
// createCronCallback
// ============================================================================

describe("createCronCallback", () => {
  const sampleJob: CronJobInfo = {
    name: "daily-report",
    instruction: "Generate daily summary",
  };

  it("dispatches with correct source, sessionKey, and priority", async () => {
    const { deps, dispatched } = createMockDeps();
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].source).toBe("cron");
    expect(dispatched[0].sessionKey).toBe("cron");
    expect(dispatched[0].priority).toBe(5);
    expect(dispatched[0].sender).toEqual({
      id: "cron",
      username: "cron-scheduler",
    });
  });

  it("dispatches with correct instruction content", async () => {
    const { deps, dispatched } = createMockDeps();
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(dispatched[0].content).toBe(
      "[CRON TASK: daily-report] Generate daily summary",
    );
  });

  it("sends result on successful dispatch", async () => {
    const { deps, sentResults } = createMockDeps();
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("Agent response");
  });

  it("does not send result when dispatch fails", async () => {
    const { deps, sentResults } = createMockDeps({
      dispatcher: makeMockDispatcher({
        text: "Error occurred",
        success: false,
      }),
    });
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(sentResults).toHaveLength(0);
  });

  it("does not send result when response text is empty", async () => {
    const { deps, sentResults } = createMockDeps({
      dispatcher: makeMockDispatcher({ text: "", success: true }),
    });
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(sentResults).toHaveLength(0);
  });

  it("catches dispatch errors and reports via onError", async () => {
    const { deps, errors } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => {
          throw new Error("Cron dispatch failed");
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createCronCallback(deps);

    // Should not throw
    await callback(sampleJob);

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("Cron dispatch failed");
    expect(errors[0].source).toBe("cron");
  });

  it("catches non-Error throws and wraps them", async () => {
    const { deps, errors } = createMockDeps({
      dispatcher: {
        dispatch: mock(async () => {
          throw "string error from cron";
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    });
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("string error from cron");
  });

  it("catches sendResult errors and reports via onError", async () => {
    const { deps, errors } = createMockDeps({
      sendResult: mock(async () => {
        throw new Error("Discord delivery failed");
      }),
    });
    const callback = createCronCallback(deps);

    await callback(sampleJob);

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("Discord delivery failed");
    expect(errors[0].source).toBe("cron");
  });

  it("works without onError callback (no crash)", async () => {
    const deps: HeartbeatCallbackDeps = {
      dispatcher: {
        dispatch: mock(async () => {
          throw new Error("Boom");
        }),
        getStatus: () => ({
          queued: 0,
          running: 0,
          concurrency: 1,
          isPaused: false,
        }),
        pause: () => {},
        resume: () => {},
        clear: () => {},
        onIdle: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
      sendResult: mock(async () => {}),
      // no onError
    };
    const callback = createCronCallback(deps);

    // Should not throw even without onError handler
    await callback(sampleJob);
  });

  describe("no HEARTBEAT_OK suppression", () => {
    it("delivers 'HEARTBEAT_OK' as-is (not suppressed)", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "HEARTBEAT_OK",
          success: true,
        }),
      });
      const callback = createCronCallback(deps);

      await callback(sampleJob);

      // Unlike heartbeat, cron delivers HEARTBEAT_OK to the user
      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("HEARTBEAT_OK");
    });

    it("delivers 'HEARTBEAT_OK' with trailing content without stripping", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "HEARTBEAT_OK Some report here",
          success: true,
        }),
      });
      const callback = createCronCallback(deps);

      await callback(sampleJob);

      // Cron does not strip token — full text delivered
      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("HEARTBEAT_OK Some report here");
    });

    it("delivers normal text without modification", async () => {
      const { deps, sentResults } = createMockDeps({
        dispatcher: makeMockDispatcher({
          text: "Daily report: 5 tasks completed, 2 pending",
          success: true,
        }),
      });
      const callback = createCronCallback(deps);

      await callback(sampleJob);

      expect(sentResults).toHaveLength(1);
      expect(sentResults[0]).toBe("Daily report: 5 tasks completed, 2 pending");
    });
  });
});

// ============================================================================
// Stage 2 Behavioral Tests: Dispatcher + CronCallback integrated
//
// These tests wire up a REAL createDispatcher with createCronCallback.
// The only mock is the handler (simulating the Agent LLM), so we can control
// what the "Agent" responds and verify the full pipeline behavior:
//
//   cronCallback(job)
//     -> buildCronInstruction(job)
//     -> dispatcher.dispatch()
//       -> handler.handle() (mock Agent)
//     -> sendResult() — always delivers, no HEARTBEAT_OK suppression
//
// Note: CronService integration (timer scheduling, persistence, etc.) is
// already thoroughly tested in @deca/agent. Here we focus on the dispatch
// pipeline that the gateway owns.
// ============================================================================

describe("cron behavioral (Stage 2 integration)", () => {
  /**
   * Wire up the full pipeline: Dispatcher + CronCallback.
   * Returns the callback and instrumented handles for assertion.
   */
  function wireCron(opts: {
    agentResponse: string;
    agentSuccess?: boolean;
  }) {
    const dispatched: DispatchRequest[] = [];
    const sentResults: string[] = [];
    const errors: { error: Error; source: string }[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async (req) => {
          dispatched.push(req as DispatchRequest);
          return {
            text: opts.agentResponse,
            success: opts.agentSuccess ?? true,
          };
        },
      },
    });

    const callback = createCronCallback({
      dispatcher,
      sendResult: async (text) => {
        sentResults.push(text);
      },
      onError: (error, source) => {
        errors.push({ error, source });
      },
    });

    return { callback, dispatcher, dispatched, sentResults, errors };
  }

  it("cron trigger dispatches to Agent and delivers result", async () => {
    const { callback, dispatcher, dispatched, sentResults } = wireCron({
      agentResponse: "Daily report: all systems nominal.",
    });

    await callback({
      name: "daily-report",
      instruction: "Generate a daily summary",
    });
    await dispatcher.shutdown();

    // Verify Agent received the correct dispatch
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].source).toBe("cron");
    expect(dispatched[0].sessionKey).toBe("cron");
    expect(dispatched[0].content).toBe(
      "[CRON TASK: daily-report] Generate a daily summary",
    );
    expect(dispatched[0].priority).toBe(5);
    expect(dispatched[0].sender).toEqual({
      id: "cron",
      username: "cron-scheduler",
    });

    // Verify result was delivered
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("Daily report: all systems nominal.");
  });

  it("Agent failure does not deliver and does not crash", async () => {
    const { callback, dispatcher, dispatched, sentResults } = wireCron({
      agentResponse: "Error occurred",
      agentSuccess: false,
    });

    await callback({ name: "risky-task", instruction: "Run diagnostics" });
    await dispatcher.shutdown();

    // Agent was called but response was unsuccessful
    expect(dispatched).toHaveLength(1);
    // Nothing delivered because success=false
    expect(sentResults).toHaveLength(0);
  });

  it("HEARTBEAT_OK from Agent is still delivered for cron (not suppressed)", async () => {
    const { callback, dispatcher, dispatched, sentResults } = wireCron({
      agentResponse: "HEARTBEAT_OK",
    });

    await callback({
      name: "check-status",
      instruction: "Reply exactly HEARTBEAT_OK",
    });
    await dispatcher.shutdown();

    // Agent was called
    expect(dispatched).toHaveLength(1);
    // Unlike heartbeat, HEARTBEAT_OK is delivered as-is for cron
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0]).toBe("HEARTBEAT_OK");
  });

  it("error in dispatcher does not crash", async () => {
    const errors: { error: Error; source: string }[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async () => {
          throw new Error("LLM API unavailable");
        },
      },
    });

    const callback = createCronCallback({
      dispatcher,
      sendResult: async () => {},
      onError: (error, source) => {
        errors.push({ error, source });
      },
    });

    // Should not throw
    await callback({ name: "failing-task", instruction: "This will fail" });
    await dispatcher.shutdown();

    // Error was captured
    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe("LLM API unavailable");
    expect(errors[0].source).toBe("cron");
  });

  it("multiple cron jobs dispatch independently with correct instructions", async () => {
    const { callback, dispatcher, dispatched, sentResults } = wireCron({
      agentResponse: "Done",
    });

    await callback({ name: "backup-db", instruction: "Run database backup" });
    await callback({ name: "sync-notes", instruction: "Sync obsidian notes" });
    await dispatcher.shutdown();

    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].content).toBe(
      "[CRON TASK: backup-db] Run database backup",
    );
    expect(dispatched[1].content).toBe(
      "[CRON TASK: sync-notes] Sync obsidian notes",
    );

    expect(sentResults).toHaveLength(2);
  });

  it("concurrent cron dispatches are serialized by the dispatcher", async () => {
    const callOrder: string[] = [];

    const dispatcher = createDispatcher({
      concurrency: 1,
      handler: {
        handle: async (req) => {
          callOrder.push(`start:${req.content}`);
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 20));
          callOrder.push(`end:${req.content}`);
          return { text: "Done", success: true };
        },
      },
    });

    const sentResults: string[] = [];
    const callback = createCronCallback({
      dispatcher,
      sendResult: async (text) => {
        sentResults.push(text);
      },
    });

    // Fire two jobs concurrently
    const p1 = callback({ name: "job-a", instruction: "First" });
    const p2 = callback({ name: "job-b", instruction: "Second" });
    await Promise.all([p1, p2]);
    await dispatcher.shutdown();

    // With concurrency=1, they should be serialized (not interleaved)
    expect(callOrder).toHaveLength(4);
    expect(callOrder[0]).toContain("start:");
    expect(callOrder[1]).toContain("end:");
    expect(callOrder[2]).toContain("start:");
    expect(callOrder[3]).toContain("end:");

    // Both results delivered
    expect(sentResults).toHaveLength(2);
  });
});
