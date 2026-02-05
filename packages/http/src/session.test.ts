import { describe, expect, it } from "bun:test";
import {
  generateSessionKey,
  parseSessionKey,
  generateSessionId,
  extractSessionId,
} from "./session";
import { HTTP_SESSION_PREFIX } from "./types";

describe("generateSessionId", () => {
  it("generates unique IDs", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
  });

  it("generates string IDs", () => {
    const id = generateSessionId();
    expect(typeof id).toBe("string");
  });
});

describe("generateSessionKey", () => {
  it("generates key with default values", () => {
    const key = generateSessionKey();
    expect(key).toMatch(new RegExp(`^${HTTP_SESSION_PREFIX}:deca:.+$`));
  });

  it("generates key with custom sessionId", () => {
    const key = generateSessionKey({ sessionId: "session123" });
    expect(key).toBe(`${HTTP_SESSION_PREFIX}:deca:session123`);
  });

  it("generates key with custom agentId", () => {
    const key = generateSessionKey({ sessionId: "s1", agentId: "custom" });
    expect(key).toBe(`${HTTP_SESSION_PREFIX}:custom:s1`);
  });
});

describe("parseSessionKey", () => {
  it("parses valid session key", () => {
    const key = `${HTTP_SESSION_PREFIX}:deca:session123`;
    const result = parseSessionKey(key);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("deca");
    expect(result?.sessionId).toBe("session123");
  });

  it("returns null for invalid prefix", () => {
    expect(parseSessionKey("terminal:deca:session")).toBeNull();
  });

  it("returns null for wrong number of parts", () => {
    expect(parseSessionKey("http:deca")).toBeNull();
    expect(parseSessionKey("http:deca:session:extra")).toBeNull();
  });

  it("returns null for empty parts", () => {
    expect(parseSessionKey("http::session")).toBeNull();
    expect(parseSessionKey("http:deca:")).toBeNull();
  });

  it("round-trips with generateSessionKey", () => {
    const key = generateSessionKey({ sessionId: "test123", agentId: "agent1" });
    const parsed = parseSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.sessionId).toBe("test123");
    expect(parsed?.agentId).toBe("agent1");
  });
});

describe("extractSessionId", () => {
  it("extracts session ID from valid key", () => {
    const sessionId = extractSessionId("http:deca:abc123");
    expect(sessionId).toBe("abc123");
  });

  it("returns null for invalid key", () => {
    expect(extractSessionId("invalid")).toBeNull();
  });
});
