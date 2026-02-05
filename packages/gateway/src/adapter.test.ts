import { describe, expect, it } from "bun:test";
import { createEchoAdapter } from "./adapter";
import type { MessageRequest } from "./types";

function createRequest(
  content: string,
  onTextDelta?: (delta: string) => void,
): MessageRequest {
  return {
    sessionKey: "test:session:123",
    content,
    sender: {
      id: "user123",
      username: "testuser",
    },
    callbacks: onTextDelta ? { onTextDelta } : undefined,
  };
}

describe("createEchoAdapter", () => {
  it("echoes message with default prefix", async () => {
    const adapter = createEchoAdapter();
    const response = await adapter.handle(createRequest("hello"));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Echo: hello");
  });

  it("echoes message with custom prefix", async () => {
    const adapter = createEchoAdapter("Reply: ");
    const response = await adapter.handle(createRequest("world"));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Reply: world");
  });

  it("streams characters when callback provided", async () => {
    const adapter = createEchoAdapter("");
    const received: string[] = [];

    const response = await adapter.handle(
      createRequest("ab", (delta) => received.push(delta)),
    );

    expect(response.success).toBe(true);
    expect(response.text).toBe("ab");
    expect(received).toEqual(["a", "b"]);
  });

  it("handles empty message", async () => {
    const adapter = createEchoAdapter();
    const response = await adapter.handle(createRequest(""));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Echo: ");
  });

  it("handles unicode", async () => {
    const adapter = createEchoAdapter();
    const response = await adapter.handle(createRequest("你好 🌟"));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Echo: 你好 🌟");
  });
});
