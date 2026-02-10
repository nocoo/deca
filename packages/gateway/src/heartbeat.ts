/**
 * Heartbeat Logic
 *
 * Pure, testable functions for heartbeat dispatching.
 * Extracted from gateway.ts closure to enable real unit testing.
 */

import type { HeartbeatTask, WakeRequest } from "@deca/agent";
import type { Dispatcher } from "./dispatcher";
import type { MessageResponse } from "./types";

/**
 * Build a heartbeat instruction string from tasks and wake reason
 */
export function buildHeartbeatInstruction(
  tasks: HeartbeatTask[],
  request: WakeRequest,
): string {
  const taskList = tasks.map((t) => t.description).join(", ");
  return `[HEARTBEAT: ${request.reason}] Execute pending tasks: ${taskList}`;
}

/**
 * Dependencies for the heartbeat callback
 */
export interface HeartbeatCallbackDeps {
  dispatcher: Dispatcher;
  sendResult: (text: string) => Promise<void>;
  onError?: (error: Error, source: string) => void;
}

/**
 * Create a heartbeat callback function suitable for Agent.startHeartbeat().
 *
 * The callback:
 * 1. Skips dispatch when no tasks exist
 * 2. Builds an instruction string from tasks + wake reason
 * 3. Dispatches through the unified dispatcher (source="heartbeat", sessionKey="main")
 * 4. Sends successful results through sendResult
 * 5. Catches and reports errors without blocking the next heartbeat
 */
export function createHeartbeatCallback(
  deps: HeartbeatCallbackDeps,
): (tasks: HeartbeatTask[], request: WakeRequest) => Promise<void> {
  return async (
    tasks: HeartbeatTask[],
    request: WakeRequest,
  ): Promise<void> => {
    if (tasks.length === 0) {
      return;
    }

    try {
      const instruction = buildHeartbeatInstruction(tasks, request);

      const response: MessageResponse = await deps.dispatcher.dispatch({
        source: "heartbeat",
        sessionKey: "main",
        content: instruction,
        sender: { id: "heartbeat", username: "heartbeat-scheduler" },
        priority: 5,
      });

      if (response.success && response.text) {
        await deps.sendResult(response.text);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.onError?.(err, "heartbeat");
    }
  };
}
