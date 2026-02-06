import { describe, expect, it } from "bun:test";
import {
  generateSessionKey,
  parseSessionKey,
  extractUserId,
  extractSessionId,
} from "./session";
import { HTTP_SESSION_PREFIX } from "./types";

describe("generateSessionKey", () => {
  it("generates key with unified format", () => {
    const key = generateSessionKey({ userId: "user123" });
    expect(key).toBe("agent:deca:user:user123");
  });

  it("generates key with custom agentId", () => {
    const key = generateSessionKey({ userId: "user123", agentId: "custom" });
    expect(key).toBe("agent:custom:user:user123");
  });

  it("normalizes userId to lowercase", () => {
    const key = generateSessionKey({ userId: "User123" });
    expect(key).toBe("agent:deca:user:user123");
  });

  it("normalizes agentId to lowercase", () => {
    const key = generateSessionKey({ userId: "user123", agentId: "MyAgent" });
    expect(key).toBe("agent:myagent:user:user123");
  });

  it("throws for empty userId", () => {
    expect(() => generateSessionKey({ userId: "" })).toThrow();
  });

  it("throws for whitespace userId", () => {
    expect(() => generateSessionKey({ userId: "   " })).toThrow();
  });
});

describe("parseSessionKey", () => {
  it("parses new unified format", () => {
    const key = "agent:deca:user:user123";
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.userId).toBe("user123");
  });

  it("parses legacy http format", () => {
    const key = `${HTTP_SESSION_PREFIX}:deca:session123`;
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.userId).toBe("session123");
  });

  it("returns null for invalid prefix", () => {
    expect(parseSessionKey("terminal:deca:session")).toBeNull();
  });

  it("returns null for wrong number of parts in unified format", () => {
    expect(parseSessionKey("agent:deca:user")).toBeNull();
    expect(parseSessionKey("agent:deca:user:a:b")).toBeNull();
  });

  it("returns null for wrong number of parts in legacy format", () => {
    expect(parseSessionKey("http:deca")).toBeNull();
    expect(parseSessionKey("http:deca:session:extra")).toBeNull();
  });

  it("returns null for empty parts in legacy format", () => {
    expect(parseSessionKey("http::session")).toBeNull();
    expect(parseSessionKey("http:deca:")).toBeNull();
  });

  it("round-trips with generateSessionKey", () => {
    const key = generateSessionKey({ userId: "test123", agentId: "agent1" });
    const parsed = parseSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe("test123");
    expect(parsed?.agentId).toBe("agent1");
  });
});

describe("extractUserId", () => {
  it("extracts userId from new unified format", () => {
    const userId = extractUserId("agent:deca:user:user123");
    expect(userId).toBe("user123");
  });

  it("extracts userId from legacy format", () => {
    const userId = extractUserId("http:deca:abc123");
    expect(userId).toBe("abc123");
  });

  it("returns null for invalid key", () => {
    expect(extractUserId("invalid")).toBeNull();
  });
});

describe("extractSessionId (deprecated)", () => {
  it("works as alias for extractUserId", () => {
    const sessionId = extractSessionId("http:deca:abc123");
    expect(sessionId).toBe("abc123");
  });
});
