/**
 * Agent 事件流（简化版）
 *
 * 目标：提供可观测性与可追踪性，让运行过程可订阅。
 * 参考 OpenClaw: src/infra/agent-events.ts
 */

export type AgentEventStream =
  | "lifecycle"
  | "assistant"
  | "tool"
  | "subagent"
  | "error";

export type AgentEventPayload = {
  runId: string;
  seq: number;
  ts: number;
  stream: AgentEventStream;
  data: Record<string, unknown>;
  sessionKey?: string;
  agentId?: string;
};

const listeners = new Set<(evt: AgentEventPayload) => void>();
const seqByRun = new Map<string, number>();

export function emitAgentEvent(event: Omit<AgentEventPayload, "seq" | "ts">) {
  const nextSeq = (seqByRun.get(event.runId) ?? 0) + 1;
  seqByRun.set(event.runId, nextSeq);
  const payload: AgentEventPayload = {
    ...event,
    seq: nextSeq,
    ts: Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // 忽略监听器错误，避免影响主流程
    }
  }
}

export function onAgentEvent(
  listener: (evt: AgentEventPayload) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
