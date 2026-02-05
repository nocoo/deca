import { describe, expect, it } from "bun:test";
import { generateSessionKey, parseSessionKey } from "./session";
import { TERMINAL_SESSION_PREFIX, DEFAULT_USER_ID } from "./types";

describe("generateSessionKey", () => {
  it("generates key with default values", () => {
    const key = generateSessionKey();
    expect(key).toBe(`${TERMINAL_SESSION_PREFIX}:deca:${DEFAULT_USER_ID}`);
  });

  it("generates key with custom userId", () => {
    const key = generateSessionKey({ userId: "user123" });
    expect(key).toBe(`${TERMINAL_SESSION_PREFIX}:deca:user123`);
  });

  it("generates key with custom agentId", () => {
    const key = generateSessionKey({ agentId: "custom-agent" });
    expect(key).toBe(`${TERMINAL_SESSION_PREFIX}:custom-agent:${DEFAULT_USER_ID}`);
  });

  it("generates key with all custom values", () => {
    const key = generateSessionKey({ userId: "user456", agentId: "agent789" });
    expect(key).toBe(`${TERMINAL_SESSION_PREFIX}:agent789:user456`);
  });
});

describe("parseSessionKey", () => {
  it("parses valid session key", () => {
    const key = `${TERMINAL_SESSION_PREFIX}:deca:user123`;
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.userId).toBe("user123");
  });

  it("returns null for invalid prefix", () => {
    const key = "discord:deca:user123";
    expect(parseSessionKey(key)).toBeNull();
  });

  it("returns null for wrong number of parts", () => {
    expect(parseSessionKey("terminal:deca")).toBeNull();
    expect(parseSessionKey("terminal:deca:user:extra")).toBeNull();
    expect(parseSessionKey("terminal")).toBeNull();
  });

  it("returns null for empty parts", () => {
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
