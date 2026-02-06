import { describe, expect, it } from "bun:test";
import { generateSessionKey, parseSessionKey } from "./session";
import { DEFAULT_USER_ID } from "./types";

describe("generateSessionKey", () => {
  it("generates key with default values", () => {
    const key = generateSessionKey();
    expect(key).toBe(`agent:main:user:${DEFAULT_USER_ID}`);
  });

  it("generates key with custom userId", () => {
    const key = generateSessionKey({ userId: "user123" });
    expect(key).toBe("agent:main:user:user123");
  });

  it("generates key with custom agentId", () => {
    const key = generateSessionKey({ agentId: "custom-agent" });
    expect(key).toBe(`agent:custom-agent:user:${DEFAULT_USER_ID}`);
  });

  it("generates key with all custom values", () => {
    const key = generateSessionKey({ userId: "user456", agentId: "agent789" });
    expect(key).toBe("agent:agent789:user:user456");
  });

  it("normalizes agentId to lowercase", () => {
    const key = generateSessionKey({ agentId: "MyAgent", userId: "user" });
    expect(key).toBe("agent:myagent:user:user");
  });

  it("replaces invalid characters in agentId", () => {
    const key = generateSessionKey({ agentId: "My Agent!", userId: "user" });
    expect(key).toBe("agent:my-agent-:user:user");
  });

  it("uses default agentId for empty string", () => {
    const key = generateSessionKey({ agentId: "", userId: "user" });
    expect(key).toBe("agent:main:user:user");
  });
});

describe("parseSessionKey", () => {
  it("parses unified format session key", () => {
    const key = "agent:deca:user:user123";
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.userId).toBe("user123");
  });

  it("parses legacy format session key", () => {
    const key = "terminal:deca:user123";
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.userId).toBe("user123");
  });

  it("returns null for invalid unified format", () => {
    expect(parseSessionKey("agent:deca:channel:123")).toBeNull();
    expect(parseSessionKey("agent:deca:user")).toBeNull();
    expect(parseSessionKey("agent:deca")).toBeNull();
  });

  it("returns null for invalid prefix", () => {
    expect(parseSessionKey("discord:deca:user123")).toBeNull();
    expect(parseSessionKey("http:deca:user123")).toBeNull();
  });

  it("returns null for wrong number of parts in legacy format", () => {
    expect(parseSessionKey("terminal:deca")).toBeNull();
    expect(parseSessionKey("terminal")).toBeNull();
  });

  it("returns null for empty parts", () => {
    expect(parseSessionKey("agent::user:user123")).toBeNull();
    expect(parseSessionKey("agent:deca:user:")).toBeNull();
    expect(parseSessionKey("terminal::user123")).toBeNull();
    expect(parseSessionKey("terminal:deca:")).toBeNull();
  });

  it("round-trips with generateSessionKey", () => {
    const original = { userId: "testuser", agentId: "testagent" };
    const key = generateSessionKey(original);
    const parsed = parseSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe(original.userId);
    expect(parsed?.agentId).toBe(original.agentId);
  });
});
