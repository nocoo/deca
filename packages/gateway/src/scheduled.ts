/**
 * Scheduled Dispatch Logic
 *
 * Pure, testable functions for heartbeat and cron dispatching.
 * Both systems share the same Dispatcher but differ in:
 * - Instruction format
 * - Noise suppression (heartbeat has HEARTBEAT_OK, cron always delivers)
 * - Session key ("main" vs "cron")
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
 * Minimal cron job shape needed for instruction building.
 * Avoids importing full CronJob type from @deca/agent.
 */
export interface CronJobInfo {
  name: string;
  instruction: string;
}

/**
 * Build a cron instruction string from a job definition.
 *
 * Unlike heartbeat, cron has no HEARTBEAT_OK protocol —
 * scheduled tasks are user-initiated and should always report results.
 */
export function buildCronInstruction(job: CronJobInfo): string {
  return `[CRON TASK: ${job.name}] ${job.instruction}`;
}

/**
 * Dependencies for scheduled callbacks (shared by heartbeat and cron)
 */
export interface ScheduledCallbackDeps {
  dispatcher: Dispatcher;
  sendResult: (text: string) => Promise<void>;
  onError?: (error: Error, source: string) => void;
}

// Backward-compatible alias
export type HeartbeatCallbackDeps = ScheduledCallbackDeps;

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
  deps: ScheduledCallbackDeps,
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
        sessionKey: "heartbeat",
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

/**
 * Create a cron callback function for CronService.onTrigger().
 *
 * Unlike heartbeat:
 * - No HEARTBEAT_OK suppression — cron results are always delivered
 * - Uses source="cron" and sessionKey="cron"
 * - Takes a CronJobInfo instead of tasks + wake request
 */
export function createCronCallback(
  deps: ScheduledCallbackDeps,
): (job: CronJobInfo) => Promise<void> {
  return async (job: CronJobInfo): Promise<void> => {
    try {
      const instruction = buildCronInstruction(job);

      const response: MessageResponse = await deps.dispatcher.dispatch({
        source: "cron",
        sessionKey: "cron",
        content: instruction,
        sender: { id: "cron", username: "cron-scheduler" },
        priority: 5,
      });

      if (response.success && response.text) {
        await deps.sendResult(response.text);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.onError?.(err, "cron");
    }
  };
}
