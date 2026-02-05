import { describe, expect, it } from "bun:test";
import { createEchoHandler } from "./echo-handler";
import type { MessageRequest } from "./types";

function createRequest(content: string): MessageRequest {
  return {
    sessionKey: "http:deca:session123",
    content,
    sender: {
      id: "user123",
    },
  };
}

describe("createEchoHandler", () => {
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

  it("responds after delay", async () => {
    const handler = createEchoHandler({ delayMs: 50 });
    const start = Date.now();

    await handler.handle(createRequest("delayed"));
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it("handles empty message", async () => {
    const handler = createEchoHandler();
    const response = await handler.handle(createRequest(""));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Echo: ");
  });

  it("handles unicode", async () => {
    const handler = createEchoHandler();
    const response = await handler.handle(createRequest("你好 🚀"));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Echo: 你好 🚀");
  });
});
