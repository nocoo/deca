import { describe, expect, it } from "bun:test";
import { createEchoHandler } from "./echo-handler";
import type { MessageRequest } from "./types";

function createRequest(content: string, onTextDelta?: (delta: string) => void): MessageRequest {
  return {
    sessionKey: "terminal:deca:user123",
    content,
    sender: {
      id: "user123",
      username: "testuser",
    },
    callbacks: onTextDelta ? { onTextDelta } : undefined,
  };
}

describe("createEchoHandler", () => {
  describe("basic echo", () => {
    it("echoes message with default prefix", async () => {
      const handler = createEchoHandler();
      const response = await handler.handle(createRequest("hello"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: hello");
    });

    it("echoes message with custom prefix", async () => {
      const handler = createEchoHandler({ prefix: "Reply: " });
      const response = await handler.handle(createRequest("world"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Reply: world");
    });

    it("echoes message with empty prefix", async () => {
      const handler = createEchoHandler({ prefix: "" });
      const response = await handler.handle(createRequest("test"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("test");
    });
  });

  describe("delay", () => {
    it("responds after delay", async () => {
      const handler = createEchoHandler({ delayMs: 50 });
      const start = Date.now();

      const response = await handler.handle(createRequest("delayed"));
      const elapsed = Date.now() - start;

      expect(response.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });

    it("responds immediately with zero delay", async () => {
      const handler = createEchoHandler({ delayMs: 0 });
      const start = Date.now();

      await handler.handle(createRequest("instant"));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("streaming simulation", () => {
    it("sends characters one by one when streaming enabled", async () => {
      const handler = createEchoHandler({
        prefix: "",
        simulateStreaming: true,
        streamingDelayMs: 0,
      });

      const received: string[] = [];
      const response = await handler.handle(
        createRequest("hi", (delta) => received.push(delta)),
      );

      expect(response.success).toBe(true);
      expect(response.text).toBe("hi");
      expect(received).toEqual(["h", "i"]);
    });

    it("does not stream when callback not provided", async () => {
      const handler = createEchoHandler({
        simulateStreaming: true,
        streamingDelayMs: 0,
      });

      // Should not throw even without callback
      const response = await handler.handle(createRequest("test"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: test");
    });

    it("respects streaming delay", async () => {
      const handler = createEchoHandler({
        prefix: "",
        simulateStreaming: true,
        streamingDelayMs: 20,
      });

      const received: string[] = [];
      const start = Date.now();

      await handler.handle(createRequest("ab", (delta) => received.push(delta)));
      const elapsed = Date.now() - start;

      expect(received).toEqual(["a", "b"]);
      expect(elapsed).toBeGreaterThanOrEqual(35); // 2 chars * 20ms with tolerance
    });
  });

  describe("special characters", () => {
    it("handles empty message", async () => {
      const handler = createEchoHandler();
      const response = await handler.handle(createRequest(""));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: ");
    });

    it("handles multi-line message", async () => {
      const handler = createEchoHandler();
      const response = await handler.handle(createRequest("line1\nline2"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: line1\nline2");
    });

    it("handles unicode", async () => {
      const handler = createEchoHandler();
      const response = await handler.handle(createRequest("你好 🎉"));

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: 你好 🎉");
    });
  });
});
