import { describe, expect, it, mock } from "bun:test";
import { createAgentAdapter, createEchoAdapter } from "./adapter";
import type { MessageRequest } from "./types";

// Mock the Agent class from @deca/agent
const mockRun = mock(() =>
  Promise.resolve({
    text: "Agent response",
    turns: 1,
    toolCalls: 0,
  }),
);

const mockCronInitialize = mock(() => Promise.resolve());
const mockCronShutdown = mock(() => Promise.resolve());

const mockRequestNow = mock(() => {});
const mockSetTools = mock(() => {});

mock.module("@deca/agent", () => ({
  Agent: class MockAgent {
    constructor(public config: unknown) {}
    run = mockRun;
    setTools = mockSetTools;
    getHeartbeat = () => ({ requestNow: mockRequestNow });
  },
  CronService: class MockCronService {
    constructor(public config: unknown) {}
    initialize = mockCronInitialize;
    shutdown = mockCronShutdown;
  },
  createBuiltinToolsWithCron: (_cronService: unknown) => [
    { name: "cron", description: "cron tool" },
  ],
}));

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

describe("createAgentAdapter", () => {
  it("creates adapter with required config", async () => {
    const adapter = await createAgentAdapter({
      apiKey: "test-api-key",
    });

    expect(adapter).toBeDefined();
    expect(typeof adapter.handle).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
  });

  it("creates adapter with full config", async () => {
    const adapter = await createAgentAdapter({
      apiKey: "test-api-key",
      baseUrl: "https://custom.api.com",
      model: "claude-3-opus",
      agentId: "custom-agent",
      systemPrompt: "You are a helpful assistant",
      sessionDir: "/tmp/sessions",
      workspaceDir: "/tmp/workspace",
      enableMemory: true,
    });

    expect(adapter).toBeDefined();
  });

  it("returns successful response from agent", async () => {
    mockRun.mockImplementation(() =>
      Promise.resolve({
        text: "Hello from agent",
        turns: 1,
        toolCalls: 0,
      }),
    );

    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    const response = await adapter.handle(createRequest("hello"));

    expect(response.success).toBe(true);
    expect(response.text).toBe("Hello from agent");
    expect(response.error).toBeUndefined();
  });

  it("passes sessionKey and content to agent.run", async () => {
    mockRun.mockClear();
    mockRun.mockImplementation(() =>
      Promise.resolve({ text: "ok", turns: 1, toolCalls: 0 }),
    );

    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    await adapter.handle(createRequest("test message"));

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][0]).toBe("test:session:123");
    expect(mockRun.mock.calls[0][1]).toBe("test message");
  });

  it("passes onTextDelta callback to agent.run", async () => {
    mockRun.mockClear();
    const deltaCallback = mock(() => {});

    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    await adapter.handle(createRequest("hello", deltaCallback));

    expect(mockRun).toHaveBeenCalledTimes(1);
    const options = mockRun.mock.calls[0][2];
    expect(options.onTextDelta).toBe(deltaCallback);
  });

  it("returns error response when agent throws Error", async () => {
    mockRun.mockImplementation(() =>
      Promise.reject(new Error("API rate limit exceeded")),
    );

    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    const response = await adapter.handle(createRequest("hello"));

    expect(response.success).toBe(false);
    expect(response.text).toBe("Error: API rate limit exceeded");
    expect(response.error).toBe("API rate limit exceeded");
  });

  it("returns error response when agent throws string", async () => {
    mockRun.mockImplementation(() => Promise.reject("Unknown error"));

    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    const response = await adapter.handle(createRequest("hello"));

    expect(response.success).toBe(false);
    expect(response.text).toBe("Error: Unknown error");
    expect(response.error).toBe("Unknown error");
  });

  it("uses default agentId when not provided", async () => {
    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    expect(adapter).toBeDefined();
  });

  it("uses default enableMemory when not provided", async () => {
    const adapter = await createAgentAdapter({ apiKey: "test-key" });
    expect(adapter).toBeDefined();
  });

  it("creates CronService when enableCron is true", async () => {
    mockCronInitialize.mockClear();

    const adapter = await createAgentAdapter({
      apiKey: "test-key",
      enableCron: true,
    });

    expect(adapter.cronService).toBeDefined();
    expect(mockCronInitialize).toHaveBeenCalledTimes(1);
  });

  it("does not create CronService when enableCron is false", async () => {
    mockCronInitialize.mockClear();

    const adapter = await createAgentAdapter({
      apiKey: "test-key",
      enableCron: false,
    });

    expect(adapter.cronService).toBeUndefined();
    expect(mockCronInitialize).not.toHaveBeenCalled();
  });

  it("shutdown calls CronService.shutdown when cron enabled", async () => {
    mockCronShutdown.mockClear();

    const adapter = await createAgentAdapter({
      apiKey: "test-key",
      enableCron: true,
    });

    await adapter.shutdown();

    expect(mockCronShutdown).toHaveBeenCalledTimes(1);
  });

  it("shutdown works when cron disabled", async () => {
    mockCronShutdown.mockClear();

    const adapter = await createAgentAdapter({
      apiKey: "test-key",
    });

    await adapter.shutdown();

    expect(mockCronShutdown).not.toHaveBeenCalled();
  });
});
