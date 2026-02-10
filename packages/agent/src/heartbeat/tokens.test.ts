/**
 * Heartbeat Tokens Tests
 */

import { describe, expect, it } from "bun:test";
import { HEARTBEAT_OK, stripHeartbeatToken } from "./tokens";

describe("HEARTBEAT_OK", () => {
  it("is a string constant", () => {
    expect(HEARTBEAT_OK).toBe("HEARTBEAT_OK");
  });
});

describe("stripHeartbeatToken", () => {
  describe("skip cases (shouldSkip=true)", () => {
    it("skips undefined input", () => {
      expect(stripHeartbeatToken(undefined)).toEqual({
        text: "",
        didStrip: false,
        shouldSkip: true,
      });
    });

    it("skips empty string", () => {
      expect(stripHeartbeatToken("")).toEqual({
        text: "",
        didStrip: false,
        shouldSkip: true,
      });
    });

    it("skips whitespace-only", () => {
      expect(stripHeartbeatToken("   ")).toEqual({
        text: "",
        didStrip: false,
        shouldSkip: true,
      });
    });

    it("skips exact HEARTBEAT_OK", () => {
      expect(stripHeartbeatToken("HEARTBEAT_OK")).toEqual({
        text: "",
        didStrip: true,
        shouldSkip: true,
      });
    });

    it("skips HEARTBEAT_OK with surrounding whitespace", () => {
      expect(stripHeartbeatToken("  HEARTBEAT_OK  ")).toEqual({
        text: "",
        didStrip: true,
        shouldSkip: true,
      });
    });
  });

  describe("strip cases (didStrip=true, shouldSkip=false)", () => {
    it("strips leading token", () => {
      expect(stripHeartbeatToken("HEARTBEAT_OK hello world")).toEqual({
        text: "hello world",
        didStrip: true,
        shouldSkip: false,
      });
    });

    it("strips trailing token", () => {
      expect(stripHeartbeatToken("hello world HEARTBEAT_OK")).toEqual({
        text: "hello world",
        didStrip: true,
        shouldSkip: false,
      });
    });

    it("strips leading token with extra whitespace", () => {
      expect(stripHeartbeatToken("  HEARTBEAT_OK   content here  ")).toEqual({
        text: "content here",
        didStrip: true,
        shouldSkip: false,
      });
    });

    it("strips trailing token with extra whitespace", () => {
      expect(stripHeartbeatToken("  content here   HEARTBEAT_OK  ")).toEqual({
        text: "content here",
        didStrip: true,
        shouldSkip: false,
      });
    });
  });

  describe("no-strip cases (didStrip=false)", () => {
    it("passes through normal text", () => {
      expect(stripHeartbeatToken("Hello, I checked everything")).toEqual({
        text: "Hello, I checked everything",
        didStrip: false,
        shouldSkip: false,
      });
    });

    it("does not strip token in the middle", () => {
      expect(stripHeartbeatToken("before HEARTBEAT_OK after")).toEqual({
        text: "before HEARTBEAT_OK after",
        didStrip: false,
        shouldSkip: false,
      });
    });

    it("does not strip partial token match", () => {
      expect(stripHeartbeatToken("HEARTBEAT_OKAY")).toEqual({
        text: "HEARTBEAT_OKAY",
        didStrip: false,
        shouldSkip: false,
      });
    });
  });
});
