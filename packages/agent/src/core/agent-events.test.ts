import { afterEach, describe, expect, it } from "bun:test";
import {
  type AgentEventPayload,
  emitAgentEvent,
  onAgentEvent,
} from "./agent-events.js";

describe("agent-events", () => {
  // Track unsubscribe functions to clean up after each test
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.length = 0;
  });

  describe("emitAgentEvent", () => {
    it("should emit event to listeners", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe);

      emitAgentEvent({
        runId: "run-1",
        stream: "lifecycle",
        data: { status: "started" },
      });

      expect(events).toHaveLength(1);
      expect(events[0].runId).toBe("run-1");
      expect(events[0].stream).toBe("lifecycle");
      expect(events[0].data).toEqual({ status: "started" });
    });

    it("should add seq number incrementally per runId", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe);

      emitAgentEvent({ runId: "run-a", stream: "lifecycle", data: {} });
      emitAgentEvent({ runId: "run-a", stream: "tool", data: {} });
      emitAgentEvent({ runId: "run-a", stream: "assistant", data: {} });

      expect(events[0].seq).toBe(1);
      expect(events[1].seq).toBe(2);
      expect(events[2].seq).toBe(3);
    });

    it("should track seq independently per runId", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe);

      emitAgentEvent({ runId: "run-x", stream: "lifecycle", data: {} });
      emitAgentEvent({ runId: "run-y", stream: "lifecycle", data: {} });
      emitAgentEvent({ runId: "run-x", stream: "tool", data: {} });

      const runXEvents = events.filter((e) => e.runId === "run-x");
      const runYEvents = events.filter((e) => e.runId === "run-y");

      expect(runXEvents[0].seq).toBe(1);
      expect(runXEvents[1].seq).toBe(2);
      expect(runYEvents[0].seq).toBe(1);
    });

    it("should add timestamp to events", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe);

      const before = Date.now();
      emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
      const after = Date.now();

      expect(events[0].ts).toBeGreaterThanOrEqual(before);
      expect(events[0].ts).toBeLessThanOrEqual(after);
    });

    it("should include optional fields", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe);

      emitAgentEvent({
        runId: "run-1",
        stream: "lifecycle",
        data: {},
        sessionKey: "agent:main:session",
        agentId: "myagent",
      });

      expect(events[0].sessionKey).toBe("agent:main:session");
      expect(events[0].agentId).toBe("myagent");
    });

    it("should emit to multiple listeners", () => {
      const events1: AgentEventPayload[] = [];
      const events2: AgentEventPayload[] = [];

      const unsub1 = onAgentEvent((evt) => events1.push(evt));
      const unsub2 = onAgentEvent((evt) => events2.push(evt));
      cleanups.push(unsub1, unsub2);

      emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it("should not affect other listeners when one throws", () => {
      const events: AgentEventPayload[] = [];

      const unsub1 = onAgentEvent(() => {
        throw new Error("listener error");
      });
      const unsub2 = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsub1, unsub2);

      // Should not throw
      emitAgentEvent({ runId: "run-1", stream: "error", data: {} });

      expect(events).toHaveLength(1);
    });
  });

  describe("onAgentEvent", () => {
    it("should return unsubscribe function", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));

      emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
      expect(events).toHaveLength(1);

      unsubscribe();

      emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
      expect(events).toHaveLength(1); // Still 1, not subscribed anymore
    });

    it("should allow re-subscribing after unsubscribe", () => {
      const events: AgentEventPayload[] = [];
      const unsubscribe = onAgentEvent((evt) => events.push(evt));
      unsubscribe();

      const unsubscribe2 = onAgentEvent((evt) => events.push(evt));
      cleanups.push(unsubscribe2);

      emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
      expect(events).toHaveLength(1);
    });
  });
});
