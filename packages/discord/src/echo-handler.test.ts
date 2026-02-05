import { describe, expect, it } from "bun:test";
import { createEchoHandler } from "./echo-handler";
import type { MessageRequest } from "./types";

describe("EchoHandler", () => {
  it("echoes message content", async () => {
    const handler = createEchoHandler();
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Hello, World!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.success).toBe(true);
    expect(response.text).toContain("Hello, World!");
  });

  it("includes sender info in response", async () => {
    const handler = createEchoHandler({ includeSender: true });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Test message",
      sender: { id: "user123", username: "testuser", displayName: "Test User" },
      channel: { id: "channel456", type: "guild", guildId: "guild789" },
    };

    const response = await handler.handle(request);

    expect(response.text).toContain("testuser");
  });

  it("includes channel info in response", async () => {
    const handler = createEchoHandler({ includeChannel: true });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Test message",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "guild", name: "general" },
    };

    const response = await handler.handle(request);

    expect(response.text).toContain("general");
  });

  it("includes session key in response", async () => {
    const handler = createEchoHandler({ includeSession: true });
    const request: MessageRequest = {
      sessionKey: "discord:mybot:dm:user123",
      content: "Test message",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.text).toContain("discord:mybot:dm:user123");
  });

  it("uses custom prefix", async () => {
    const handler = createEchoHandler({ prefix: "🔊" });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.text).toStartWith("🔊");
  });

  it("simulates delay when configured", async () => {
    const handler = createEchoHandler({ delay: 50 });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const start = Date.now();
    await handler.handle(request);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some variance
  });

  it("can simulate errors", async () => {
    const handler = createEchoHandler({ simulateError: true });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it("can simulate error by content pattern", async () => {
    const handler = createEchoHandler({ errorOnPattern: /error/i });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "trigger an ERROR please",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.success).toBe(false);
  });

  it("succeeds when pattern does not match", async () => {
    const handler = createEchoHandler({ errorOnPattern: /error/i });
    const request: MessageRequest = {
      sessionKey: "test-session",
      content: "normal message",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await handler.handle(request);

    expect(response.success).toBe(true);
  });
});
