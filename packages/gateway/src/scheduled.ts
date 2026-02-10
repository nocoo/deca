/**
 * Heartbeat Logic
 *
 * Pure, testable functions for heartbeat dispatching.
 * Extracted from gateway.ts closure to enable real unit testing.
 */

import type { HeartbeatTask, WakeRequest } from "@deca/agent";
import { stripHeartbeatToken } from "@deca/agent";
import type { Dispatcher } from "./dispatcher";
import type { MessageResponse } from "./types";

/**
 * Build a heartbeat instruction string from tasks and wake reason.
 *
 * Includes HEARTBEAT_OK protocol: Agent should reply with HEARTBEAT_OK
 * when nothing needs attention, so Gateway can suppress noisy delivery.
 */
export function buildHeartbeatInstruction(
  tasks: HeartbeatTask[],
  request: WakeRequest,
): string {
  const taskList = tasks.map((t) => t.description).join(", ");
  return `[HEARTBEAT: ${request.reason}] Execute pending tasks: ${taskList}. Reply with your report for the user. Only reply HEARTBEAT_OK if HEARTBEAT.md does not require any reporting.`;
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
 * 4. Strips HEARTBEAT_OK token from response; skips delivery if nothing to report
 * 5. Sends remaining result text through sendResult
 * 6. Catches and reports errors without blocking the next heartbeat
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
        const stripped = stripHeartbeatToken(response.text);
        if (!stripped.shouldSkip && stripped.text) {
          await deps.sendResult(stripped.text);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.onError?.(err, "heartbeat");
    }
  };
}
