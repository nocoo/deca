import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { MessageRequest } from "../channels/discord/types";
import {
  type DiscordAgentAdapterConfig,
  createDiscordAgentAdapter,
} from "./discord-agent-adapter";

// Mock Agent
function createMockAgent() {
  return {
    run: mock(() =>
      Promise.resolve({
        response: "Hello from agent!",
        success: true,
      }),
    ),
  };
}

describe("DiscordAgentAdapter", () => {
  let mockAgent: ReturnType<typeof createMockAgent>;

  beforeEach(() => {
    mockAgent = createMockAgent();
  });

  it("calls agent.run with message content", async () => {
    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    await adapter.handle(request);

    expect(mockAgent.run).toHaveBeenCalled();
    const runCall = mockAgent.run.mock.calls[0];
    expect(runCall[0]).toBe("Hello!");
  });

  it("passes session key to agent", async () => {
    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
    });

    const request: MessageRequest = {
      sessionKey: "discord:mybot:guild:g1:c1:u1",
      content: "Test message",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "guild" },
    };

    await adapter.handle(request);

    const runCall = mockAgent.run.mock.calls[0];
    const options = runCall[1];
    expect(options.sessionKey).toBe("discord:mybot:guild:g1:c1:u1");
  });

  it("returns agent response", async () => {
    mockAgent.run = mock(() =>
      Promise.resolve({
        response: "Agent says hello!",
        success: true,
      }),
    );

    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await adapter.handle(request);

    expect(response.success).toBe(true);
    expect(response.text).toBe("Agent says hello!");
  });

  it("handles agent errors", async () => {
    mockAgent.run = mock(() =>
      Promise.resolve({
        response: "",
        success: false,
        error: "Agent failed",
      }),
    );

    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await adapter.handle(request);

    expect(response.success).toBe(false);
    expect(response.error).toBe("Agent failed");
  });

  it("handles agent exceptions", async () => {
    mockAgent.run = mock(() => Promise.reject(new Error("Agent crashed")));

    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    const response = await adapter.handle(request);

    expect(response.success).toBe(false);
    expect(response.error).toContain("Agent crashed");
  });

  it("includes context info when configured", async () => {
    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
      includeContext: true,
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser", displayName: "Test User" },
      channel: { id: "channel456", type: "guild", name: "general" },
    };

    await adapter.handle(request);

    const runCall = mockAgent.run.mock.calls[0];
    const message = runCall[0];
    // Should include context in the message
    expect(message).toContain("Hello!");
  });

  it("uses custom system prompt", async () => {
    const adapter = createDiscordAgentAdapter({
      agent: mockAgent as never,
      systemPrompt: "You are a helpful Discord bot.",
    });

    const request: MessageRequest = {
      sessionKey: "discord:test:dm:user123",
      content: "Hello!",
      sender: { id: "user123", username: "testuser" },
      channel: { id: "channel456", type: "dm" },
    };

    await adapter.handle(request);

    const runCall = mockAgent.run.mock.calls[0];
    const options = runCall[1];
    expect(options.systemPrompt).toBe("You are a helpful Discord bot.");
  });
});
