/**
 * Heartbeat Unit Tests
 *
 * Tests for the extracted heartbeat logic: buildHeartbeatInstruction and createHeartbeatCallback.
 * These test the REAL exported functions, not inline copies.
 */

import { describe, expect, it, mock } from "bun:test";
import type { HeartbeatTask, WakeRequest } from "@deca/agent";
import type { DispatchRequest } from "./dispatcher/types";
import {
  type HeartbeatCallbackDeps,
  buildHeartbeatInstruction,
  createHeartbeatCallback,
} from "./heartbeat";

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
    expect(result).toBe(
      "[HEARTBEAT: interval] Execute pending tasks: Check obsidian repo",
    );
  });

  it("formats instruction with multiple tasks", () => {
    const result = buildHeartbeatInstruction(
      makeTasks("Check obsidian repo", "Sync notes"),
      makeRequest("interval"),
    );
    expect(result).toBe(
      "[HEARTBEAT: interval] Execute pending tasks: Check obsidian repo, Sync notes",
    );
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
});
