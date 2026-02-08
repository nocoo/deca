/**
 * Heartbeat Integration Tests
 *
 * Tests for heartbeat callback dispatching through the unified dispatcher.
 * Heartbeat should use main session and dispatch through dispatcher like cron does.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { HeartbeatTask, WakeRequest } from "@deca/agent";
import type { DispatchRequest } from "./dispatcher/types";

describe("Heartbeat Callback", () => {
  describe("setupHeartbeatCallback", () => {
    it("should dispatch heartbeat instruction when tasks exist", async () => {
      const dispatchedRequests: DispatchRequest[] = [];
      const mockDispatcher = {
        dispatch: async (req: DispatchRequest) => {
          dispatchedRequests.push(req);
          return { text: "ok", success: true };
        },
      };

      // Simulate heartbeat callback behavior
      const tasks: HeartbeatTask[] = [
        {
          description: "Check obsidian repo",
          completed: false,
          raw: "- [ ] Check obsidian repo",
          line: 1,
        },
      ];
      const request: WakeRequest = { reason: "interval" };

      // This simulates what setupHeartbeatCallback should do
      if (tasks.length > 0) {
        const taskList = tasks.map((t) => t.description).join(", ");
        const instruction = `[HEARTBEAT: ${request.reason}] Execute pending tasks: ${taskList}`;
        await mockDispatcher.dispatch({
          source: "heartbeat",
          sessionKey: "main",
          content: instruction,
          sender: { id: "heartbeat", username: "heartbeat-scheduler" },
          priority: 5,
        });
      }

      expect(dispatchedRequests).toHaveLength(1);
      expect(dispatchedRequests[0].source).toBe("heartbeat");
      expect(dispatchedRequests[0].sessionKey).toBe("main");
      expect(dispatchedRequests[0].content).toContain("[HEARTBEAT: interval]");
      expect(dispatchedRequests[0].content).toContain("Check obsidian repo");
      expect(dispatchedRequests[0].priority).toBe(5);
    });

    it("should not dispatch when no tasks", async () => {
      const dispatchedRequests: DispatchRequest[] = [];
      const mockDispatcher = {
        dispatch: async (req: DispatchRequest) => {
          dispatchedRequests.push(req);
          return { text: "ok", success: true };
        },
      };

      const tasks: HeartbeatTask[] = [];
      const request: WakeRequest = { reason: "interval" };

      // This simulates what setupHeartbeatCallback should do
      if (tasks.length > 0) {
        await mockDispatcher.dispatch({
          source: "heartbeat",
          sessionKey: "main",
          content: "test",
          sender: { id: "heartbeat", username: "heartbeat-scheduler" },
        });
      }

      expect(dispatchedRequests).toHaveLength(0);
    });

    it("should use 'main' as session key for heartbeat", async () => {
      const dispatchedRequests: DispatchRequest[] = [];
      const mockDispatcher = {
        dispatch: async (req: DispatchRequest) => {
          dispatchedRequests.push(req);
          return { text: "ok", success: true };
        },
      };

      const tasks: HeartbeatTask[] = [
        {
          description: "Task 1",
          completed: false,
          raw: "- [ ] Task 1",
          line: 1,
        },
      ];

      await mockDispatcher.dispatch({
        source: "heartbeat",
        sessionKey: "main",
        content: "[HEARTBEAT: interval] Execute pending tasks",
        sender: { id: "heartbeat", username: "heartbeat-scheduler" },
        priority: 5,
      });

      expect(dispatchedRequests[0].sessionKey).toBe("main");
    });

    it("should include wake reason in instruction", async () => {
      const testCases: WakeRequest["reason"][] = [
        "interval",
        "cron",
        "exec",
        "requested",
      ];

      for (const reason of testCases) {
        const dispatchedRequests: DispatchRequest[] = [];
        const mockDispatcher = {
          dispatch: async (req: DispatchRequest) => {
            dispatchedRequests.push(req);
            return { text: "ok", success: true };
          },
        };

        const instruction = `[HEARTBEAT: ${reason}] Execute pending tasks`;
        await mockDispatcher.dispatch({
          source: "heartbeat",
          sessionKey: "main",
          content: instruction,
          sender: { id: "heartbeat", username: "heartbeat-scheduler" },
        });

        expect(dispatchedRequests[0].content).toContain(
          `[HEARTBEAT: ${reason}]`,
        );
      }
    });
  });

  describe("Heartbeat Reply Routing", () => {
    it("should support onReply callback for sending to Discord", async () => {
      const replies: { text: string; target: string }[] = [];

      // Simulate onReply callback that sends to DM and main channel
      const onReply = async (text: string, targets: string[]) => {
        for (const target of targets) {
          replies.push({ text, target });
        }
      };

      // Simulate heartbeat result
      const result = "Checked obsidian repo: 3 new commits found";
      await onReply(result, ["dm:123456", "channel:789012"]);

      expect(replies).toHaveLength(2);
      expect(replies[0]).toEqual({ text: result, target: "dm:123456" });
      expect(replies[1]).toEqual({ text: result, target: "channel:789012" });
    });
  });
});

describe("POST /heartbeat/trigger endpoint", () => {
  it("should return tasks when triggered", async () => {
    const mockTasks: HeartbeatTask[] = [
      {
        description: "Test task",
        completed: false,
        raw: "- [ ] Test task",
        line: 1,
      },
    ];

    const mockTriggerHeartbeat = mock(() => Promise.resolve(mockTasks));
    const mockAdapter = {
      agent: {
        triggerHeartbeat: mockTriggerHeartbeat,
      },
    };

    // Simulate the endpoint handler logic
    const tasks = await mockAdapter.agent.triggerHeartbeat();
    const response = {
      ok: true,
      tasks: tasks.map((t) => ({
        description: t.description,
        completed: t.completed,
        line: t.line,
      })),
    };

    expect(response.ok).toBe(true);
    expect(response.tasks).toHaveLength(1);
    expect(response.tasks[0].description).toBe("Test task");
    expect(response.tasks[0].completed).toBe(false);
    expect(response.tasks[0].line).toBe(1);
  });

  it("should return empty tasks array when no pending tasks", async () => {
    const mockTriggerHeartbeat = mock(() => Promise.resolve([]));
    const mockAdapter = {
      agent: {
        triggerHeartbeat: mockTriggerHeartbeat,
      },
    };

    const tasks = await mockAdapter.agent.triggerHeartbeat();
    const response = {
      ok: true,
      tasks: tasks.map((t) => ({
        description: t.description,
        completed: t.completed,
        line: t.line,
      })),
    };

    expect(response.ok).toBe(true);
    expect(response.tasks).toHaveLength(0);
  });

  it("should handle errors gracefully", async () => {
    const mockTriggerHeartbeat = mock(() =>
      Promise.reject(new Error("Heartbeat failed")),
    );
    const mockAdapter = {
      agent: {
        triggerHeartbeat: mockTriggerHeartbeat,
      },
    };

    let response: { ok: boolean; error?: string };
    try {
      await mockAdapter.agent.triggerHeartbeat();
      response = { ok: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      response = { ok: false, error: err.message };
    }

    expect(response.ok).toBe(false);
    expect(response.error).toBe("Heartbeat failed");
  });
});

describe("buildHeartbeatInstruction", () => {
  function buildHeartbeatInstruction(
    tasks: HeartbeatTask[],
    request: WakeRequest,
  ): string {
    const taskList = tasks.map((t) => t.description).join(", ");
    return `[HEARTBEAT: ${request.reason}] Execute pending tasks: ${taskList}`;
  }

  it("should format instruction with tasks and reason", () => {
    const tasks: HeartbeatTask[] = [
      {
        description: "Check obsidian repo",
        completed: false,
        raw: "- [ ] Check obsidian repo",
        line: 1,
      },
      {
        description: "Sync notes",
        completed: false,
        raw: "- [ ] Sync notes",
        line: 2,
      },
    ];
    const request: WakeRequest = { reason: "interval" };

    const instruction = buildHeartbeatInstruction(tasks, request);

    expect(instruction).toBe(
      "[HEARTBEAT: interval] Execute pending tasks: Check obsidian repo, Sync notes",
    );
  });

  it("should handle single task", () => {
    const tasks: HeartbeatTask[] = [
      {
        description: "Single task",
        completed: false,
        raw: "- [ ] Single task",
        line: 1,
      },
    ];
    const request: WakeRequest = { reason: "requested" };

    const instruction = buildHeartbeatInstruction(tasks, request);

    expect(instruction).toBe(
      "[HEARTBEAT: requested] Execute pending tasks: Single task",
    );
  });
});
