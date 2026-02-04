import { describe, expect, it } from "bun:test";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MAIN_KEY,
  buildAgentMainSessionKey,
  isSubagentSessionKey,
  normalizeAgentId,
  normalizeMainKey,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
  resolveSessionKey,
  toAgentStoreSessionKey,
} from "./session-key.js";

describe("session-key", () => {
  describe("normalizeAgentId", () => {
    it("should return default for empty/null/undefined", () => {
      expect(normalizeAgentId("")).toBe(DEFAULT_AGENT_ID);
      expect(normalizeAgentId(null)).toBe(DEFAULT_AGENT_ID);
      expect(normalizeAgentId(undefined)).toBe(DEFAULT_AGENT_ID);
      expect(normalizeAgentId("   ")).toBe(DEFAULT_AGENT_ID);
    });

    it("should lowercase valid IDs", () => {
      expect(normalizeAgentId("MyAgent")).toBe("myagent");
      expect(normalizeAgentId("AGENT123")).toBe("agent123");
    });

    it("should allow valid characters", () => {
      expect(normalizeAgentId("agent-1")).toBe("agent-1");
      expect(normalizeAgentId("agent_2")).toBe("agent_2");
      expect(normalizeAgentId("a1-b2_c3")).toBe("a1-b2_c3");
    });

    it("should replace invalid characters with dashes", () => {
      expect(normalizeAgentId("agent@test")).toBe("agent-test");
      expect(normalizeAgentId("agent test")).toBe("agent-test");
      expect(normalizeAgentId("agent.name")).toBe("agent-name");
    });

    it("should remove leading and trailing dashes", () => {
      expect(normalizeAgentId("-agent-")).toBe("agent");
      expect(normalizeAgentId("--test--")).toBe("test");
    });

    it("should truncate to 64 characters", () => {
      const longId = "a".repeat(100);
      expect(normalizeAgentId(longId).length).toBeLessThanOrEqual(64);
    });
  });

  describe("normalizeMainKey", () => {
    it("should return default for empty/null/undefined", () => {
      expect(normalizeMainKey("")).toBe(DEFAULT_MAIN_KEY);
      expect(normalizeMainKey(null)).toBe(DEFAULT_MAIN_KEY);
      expect(normalizeMainKey(undefined)).toBe(DEFAULT_MAIN_KEY);
    });

    it("should lowercase values", () => {
      expect(normalizeMainKey("MySession")).toBe("mysession");
    });

    it("should trim whitespace", () => {
      expect(normalizeMainKey("  test  ")).toBe("test");
    });
  });

  describe("buildAgentMainSessionKey", () => {
    it("should build key with agent: prefix", () => {
      expect(
        buildAgentMainSessionKey({ agentId: "test", mainKey: "session1" }),
      ).toBe("agent:test:session1");
    });

    it("should use default mainKey when not provided", () => {
      expect(buildAgentMainSessionKey({ agentId: "test" })).toBe(
        "agent:test:main",
      );
    });

    it("should normalize agentId and mainKey", () => {
      expect(
        buildAgentMainSessionKey({ agentId: "MyAgent", mainKey: "MySession" }),
      ).toBe("agent:myagent:mysession");
    });
  });

  describe("parseAgentSessionKey", () => {
    it("should return null for empty/null/undefined", () => {
      expect(parseAgentSessionKey("")).toBeNull();
      expect(parseAgentSessionKey(null)).toBeNull();
      expect(parseAgentSessionKey(undefined)).toBeNull();
    });

    it("should return null for invalid format", () => {
      expect(parseAgentSessionKey("invalid")).toBeNull();
      expect(parseAgentSessionKey("foo:bar")).toBeNull();
      expect(parseAgentSessionKey("agent:foo")).toBeNull(); // missing rest
    });

    it("should parse valid session key", () => {
      expect(parseAgentSessionKey("agent:myagent:main")).toEqual({
        agentId: "myagent",
        rest: "main",
      });
    });

    it("should handle keys with multiple colons", () => {
      expect(parseAgentSessionKey("agent:myagent:foo:bar:baz")).toEqual({
        agentId: "myagent",
        rest: "foo:bar:baz",
      });
    });

    it("should be case-insensitive for agent prefix", () => {
      expect(parseAgentSessionKey("AGENT:test:main")).toEqual({
        agentId: "test",
        rest: "main",
      });
    });
  });

  describe("isSubagentSessionKey", () => {
    it("should return false for null/undefined/empty", () => {
      expect(isSubagentSessionKey(null)).toBe(false);
      expect(isSubagentSessionKey(undefined)).toBe(false);
      expect(isSubagentSessionKey("")).toBe(false);
    });

    it("should return false for main session key", () => {
      expect(isSubagentSessionKey("agent:test:main")).toBe(false);
    });

    it("should return true for subagent session key", () => {
      expect(isSubagentSessionKey("agent:test:subagent:task-123")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(isSubagentSessionKey("agent:test:SUBAGENT:task")).toBe(true);
    });
  });

  describe("resolveAgentIdFromSessionKey", () => {
    it("should return default for invalid keys", () => {
      expect(resolveAgentIdFromSessionKey(null)).toBe(DEFAULT_AGENT_ID);
      expect(resolveAgentIdFromSessionKey("invalid")).toBe(DEFAULT_AGENT_ID);
    });

    it("should extract agentId from valid key", () => {
      expect(resolveAgentIdFromSessionKey("agent:myagent:main")).toBe(
        "myagent",
      );
    });
  });

  describe("toAgentStoreSessionKey", () => {
    it("should return main key for empty/null requestKey", () => {
      expect(toAgentStoreSessionKey({ agentId: "test", requestKey: "" })).toBe(
        "agent:test:main",
      );
      expect(
        toAgentStoreSessionKey({ agentId: "test", requestKey: null }),
      ).toBe("agent:test:main");
    });

    it("should return main key for 'main' requestKey", () => {
      expect(
        toAgentStoreSessionKey({ agentId: "test", requestKey: "main" }),
      ).toBe("agent:test:main");
      expect(
        toAgentStoreSessionKey({ agentId: "test", requestKey: "MAIN" }),
      ).toBe("agent:test:main");
    });

    it("should preserve existing agent: prefix", () => {
      expect(
        toAgentStoreSessionKey({
          agentId: "ignored",
          requestKey: "agent:other:session",
        }),
      ).toBe("agent:other:session");
    });

    it("should add agent prefix for custom requestKey", () => {
      expect(
        toAgentStoreSessionKey({ agentId: "test", requestKey: "mysession" }),
      ).toBe("agent:test:mysession");
    });
  });

  describe("resolveSessionKey", () => {
    it("should return default when no params provided", () => {
      expect(resolveSessionKey({})).toBe("agent:main:main");
    });

    it("should use agentId when provided", () => {
      expect(resolveSessionKey({ agentId: "myagent" })).toBe(
        "agent:myagent:main",
      );
    });

    it("should prefer sessionKey over sessionId", () => {
      expect(
        resolveSessionKey({ sessionId: "session1", sessionKey: "session2" }),
      ).toBe("agent:main:session2");
    });

    it("should use sessionId when sessionKey not provided", () => {
      expect(resolveSessionKey({ sessionId: "mysession" })).toBe(
        "agent:main:mysession",
      );
    });

    it("should combine agentId with sessionKey", () => {
      expect(
        resolveSessionKey({ agentId: "myagent", sessionKey: "mysession" }),
      ).toBe("agent:myagent:mysession");
    });
  });
});
