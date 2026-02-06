import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Gateway } from "./types";

// ============================================================================
// Mocks
// ============================================================================

// Mock Agent
const mockAgentRun = mock(() =>
  Promise.resolve({ text: "Agent response", turns: 1, toolCalls: 0 }),
);
const mockStartHeartbeat = mock(() => {});
const mockStopHeartbeat = mock(() => {});
const mockAgentReset = mock(() => Promise.resolve());
const mockAgentGetStatus = mock(() =>
  Promise.resolve({
    model: "mock-model",
    agentId: "mock-agent",
    contextTokens: 128000,
    session: {
      key: "test-session",
      messageCount: 10,
      userMessages: 5,
      assistantMessages: 5,
      totalChars: 1000,
    },
  }),
);

mock.module("@deca/agent", () => ({
  Agent: class MockAgent {
    constructor(public config: unknown) {}
    run = mockAgentRun;
    startHeartbeat = mockStartHeartbeat;
    stopHeartbeat = mockStopHeartbeat;
    reset = mockAgentReset;
    getStatus = mockAgentGetStatus;
  },
}));

// Mock Discord
const mockDiscordConnect = mock(() => Promise.resolve());
const mockDiscordShutdown = mock(() => Promise.resolve());
const mockRegisterCommands = mock(() => Promise.resolve());
const mockSlashCommandsCleanup = mock(() => {});
const mockSetupSlashCommands = mock(() => mockSlashCommandsCleanup);

mock.module("@deca/discord", () => ({
  createDiscordGateway: mock((config: unknown) => ({
    connect: mockDiscordConnect,
    shutdown: mockDiscordShutdown,
    client: { guilds: { cache: { size: 1 } } },
    config,
  })),
  registerCommands: mockRegisterCommands,
  setupSlashCommands: mockSetupSlashCommands,
  sendToChannel: mock(() => Promise.resolve()),
}));

// Mock Terminal
const mockTerminalStart = mock(() => Promise.resolve());
const mockTerminalStop = mock(() => {});

mock.module("@deca/terminal", () => ({
  createTerminal: mock((config: unknown) => ({
    start: mockTerminalStart,
    stop: mockTerminalStop,
    config,
  })),
}));

// Mock HTTP
const mockHttpStart = mock(() => Promise.resolve());
const mockHttpStop = mock(() => {});

mock.module("@deca/http", () => ({
  createHttpServer: mock((config: unknown) => ({
    start: mockHttpStart,
    stop: mockHttpStop,
    config,
  })),
}));

// Import after mocks are set up
import { createEchoGateway, createGateway } from "./gateway";

// ============================================================================
// Test Utilities
// ============================================================================

// Track gateways to clean up
const gateways: Gateway[] = [];

afterEach(async () => {
  for (const gateway of gateways) {
    if (gateway.isRunning) {
      await gateway.stop();
    }
  }
  gateways.length = 0;
});

beforeEach(() => {
  // Reset mocks
  mockAgentRun.mockClear();
  mockStartHeartbeat.mockClear();
  mockStopHeartbeat.mockClear();
  mockAgentReset.mockClear();
  mockDiscordConnect.mockClear();
  mockDiscordShutdown.mockClear();
  mockRegisterCommands.mockClear();
  mockSlashCommandsCleanup.mockClear();
  mockSetupSlashCommands.mockClear();
  mockTerminalStart.mockClear();
  mockTerminalStop.mockClear();
  mockHttpStart.mockClear();
  mockHttpStop.mockClear();
});

// ============================================================================
// createGateway Tests
// ============================================================================

describe("createGateway", () => {
  describe("lifecycle", () => {
    it("starts and stops correctly with HTTP channel", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      expect(gateway.isRunning).toBe(false);
      expect(gateway.channels).toEqual([]);

      await gateway.start();
      expect(gateway.isRunning).toBe(true);
      expect(gateway.channels).toContain("http");
      expect(mockHttpStart).toHaveBeenCalledTimes(1);

      await gateway.stop();
      expect(gateway.isRunning).toBe(false);
      expect(gateway.channels).toEqual([]);
      expect(mockHttpStop).toHaveBeenCalledTimes(1);
    });

    it("starts and stops correctly with Discord channel", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: { token: "discord-token" },
      });
      gateways.push(gateway);

      await gateway.start();
      expect(gateway.channels).toContain("discord");
      expect(mockDiscordConnect).toHaveBeenCalledTimes(1);

      await gateway.stop();
      expect(mockDiscordShutdown).toHaveBeenCalledTimes(1);
    });

    it("starts and stops correctly with Terminal channel", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        terminal: { enabled: true, userId: "user1" },
      });
      gateways.push(gateway);

      await gateway.start();
      expect(gateway.channels).toContain("terminal");

      // Terminal start is called asynchronously
      await new Promise((r) => setTimeout(r, 10));

      await gateway.stop();
      expect(mockTerminalStop).toHaveBeenCalledTimes(1);
    });

    it("starts all channels when configured", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: { token: "discord-token" },
        http: { port: 3000 },
        terminal: { enabled: true },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).toContain("discord");
      expect(gateway.channels).toContain("http");
      expect(gateway.channels).toContain("terminal");
    });

    it("ignores multiple start calls", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.start();

      expect(mockHttpStart).toHaveBeenCalledTimes(1);
    });

    it("ignores multiple stop calls", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.stop();
      await gateway.stop();

      expect(mockHttpStop).toHaveBeenCalledTimes(1);
    });
  });

  describe("event callbacks", () => {
    it("calls onStart when gateway starts", async () => {
      let started = false;

      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
        events: {
          onStart: () => {
            started = true;
          },
        },
      });
      gateways.push(gateway);

      await gateway.start();
      expect(started).toBe(true);
    });

    it("calls onStop when gateway stops", async () => {
      let stopped = false;

      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
        events: {
          onStop: () => {
            stopped = true;
          },
        },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.stop();
      expect(stopped).toBe(true);
    });
  });

  describe("handler", () => {
    it("returns agent adapter as handler after start", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.handler).toBeDefined();
      expect(typeof gateway.handler?.handle).toBe("function");
    });

    it("handler calls agent.run", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      await gateway.start();

      await gateway.handler?.handle({
        sessionKey: "test:session:123",
        content: "hello",
        sender: { id: "user1" },
      });

      expect(mockAgentRun).toHaveBeenCalledTimes(1);
    });
  });

  describe("terminal error handling", () => {
    it("catches terminal start errors", async () => {
      let capturedError: Error | null = null;

      mockTerminalStart.mockImplementation(() =>
        Promise.reject(new Error("Terminal failed")),
      );

      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        terminal: { enabled: true },
        events: {
          onError: (error) => {
            capturedError = error;
          },
        },
      });
      gateways.push(gateway);

      await gateway.start();

      // Wait for async error
      await new Promise((r) => setTimeout(r, 50));

      expect(capturedError).not.toBeNull();
      expect(capturedError?.message).toBe("Terminal failed");
    });

    it("catches terminal start errors (non-Error)", async () => {
      let capturedError: Error | null = null;

      mockTerminalStart.mockImplementation(() =>
        Promise.reject("string error"),
      );

      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        terminal: { enabled: true },
        events: {
          onError: (error) => {
            capturedError = error;
          },
        },
      });
      gateways.push(gateway);

      await gateway.start();

      // Wait for async error
      await new Promise((r) => setTimeout(r, 50));

      expect(capturedError).not.toBeNull();
      expect(capturedError?.message).toBe("string error");
    });
  });

  describe("heartbeat", () => {
    it("starts heartbeat when enabled with Discord channel", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", enableHeartbeat: true },
        discord: { token: "discord-token", heartbeatChannelId: "channel-123" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockStartHeartbeat).toHaveBeenCalledTimes(1);
    });

    it("does not start heartbeat when heartbeatChannelId is missing", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", enableHeartbeat: true },
        discord: { token: "discord-token" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockStartHeartbeat).not.toHaveBeenCalled();
    });

    it("does not start heartbeat when enableHeartbeat is false", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", enableHeartbeat: false },
        discord: { token: "discord-token", heartbeatChannelId: "channel-123" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockStartHeartbeat).not.toHaveBeenCalled();
    });

    it("does not start heartbeat without Discord channel", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", enableHeartbeat: true },
        http: { port: 3000 },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockStartHeartbeat).not.toHaveBeenCalled();
    });

    it("stops heartbeat when gateway stops", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", enableHeartbeat: true },
        discord: { token: "discord-token", heartbeatChannelId: "channel-123" },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.stop();

      expect(mockStopHeartbeat).toHaveBeenCalledTimes(1);
    });
  });

  describe("slash commands", () => {
    it("registers slash commands when clientId is provided", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
        },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockRegisterCommands).toHaveBeenCalledTimes(1);
      expect(mockRegisterCommands).toHaveBeenCalledWith(
        { clientId: "client-123", token: "discord-token" },
        undefined,
      );
      expect(mockSetupSlashCommands).toHaveBeenCalledTimes(1);
    });

    it("registers guild-specific commands when guildId is provided", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
          guildId: "guild-456",
        },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockRegisterCommands).toHaveBeenCalledWith(
        { clientId: "client-123", token: "discord-token" },
        "guild-456",
      );
    });

    it("does not register slash commands without clientId", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: { token: "discord-token" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockRegisterCommands).not.toHaveBeenCalled();
      expect(mockSetupSlashCommands).not.toHaveBeenCalled();
    });

    it("does not register slash commands when explicitly disabled", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
          enableSlashCommands: false,
        },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(mockRegisterCommands).not.toHaveBeenCalled();
      expect(mockSetupSlashCommands).not.toHaveBeenCalled();
    });

    it("cleans up slash commands on stop", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
        },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.stop();

      expect(mockSlashCommandsCleanup).toHaveBeenCalledTimes(1);
    });

    it("passes agentId to slash commands config", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key", agentId: "my-agent" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
        },
      });
      gateways.push(gateway);

      await gateway.start();

      const setupCall = mockSetupSlashCommands.mock.calls[0];
      const config = setupCall[1];
      expect(config.agentId).toBe("my-agent");
    });

    it("provides onClearSession callback that calls agent.reset", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
        },
      });
      gateways.push(gateway);

      await gateway.start();

      const setupCall = mockSetupSlashCommands.mock.calls[0];
      const config = setupCall[1];

      await config.onClearSession("test-session-key");

      expect(mockAgentReset).toHaveBeenCalledWith("test-session-key");
    });

    it("provides onGetStatus callback that returns gateway status", async () => {
      const gateway = createGateway({
        agent: { apiKey: "test-key" },
        discord: {
          token: "discord-token",
          clientId: "client-123",
        },
      });
      gateways.push(gateway);

      await gateway.start();

      const setupCall = mockSetupSlashCommands.mock.calls[0];
      const config = setupCall[1];

      const status = await config.onGetStatus("test-session");

      expect(status.guilds).toBe(1);
      expect(typeof status.uptime).toBe("number");
      expect(status.model).toBe("mock-model");
      expect(status.contextTokens).toBe(128000);
      expect(status.session).toEqual({
        key: "test-session",
        messageCount: 10,
        totalChars: 1000,
      });
    });
  });
});

// ============================================================================
// createEchoGateway Tests
// ============================================================================

describe("createEchoGateway", () => {
  describe("lifecycle", () => {
    it("starts and stops correctly", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
      });
      gateways.push(gateway);

      expect(gateway.isRunning).toBe(false);
      expect(gateway.channels).toEqual([]);

      await gateway.start();
      expect(gateway.isRunning).toBe(true);
      expect(gateway.channels).toContain("http");

      await gateway.stop();
      expect(gateway.isRunning).toBe(false);
      expect(gateway.channels).toEqual([]);
    });

    it("calls event callbacks", async () => {
      let started = false;
      let stopped = false;

      const gateway = createEchoGateway({
        http: { port: 0 },
        events: {
          onStart: () => {
            started = true;
          },
          onStop: () => {
            stopped = true;
          },
        },
      });
      gateways.push(gateway);

      await gateway.start();
      expect(started).toBe(true);

      await gateway.stop();
      expect(stopped).toBe(true);
    });

    it("ignores multiple start calls", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
      });
      gateways.push(gateway);

      await gateway.start();
      const channels1 = gateway.channels.length;

      await gateway.start();
      const channels2 = gateway.channels.length;

      expect(channels1).toBe(channels2);
    });

    it("ignores multiple stop calls", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
      });
      gateways.push(gateway);

      await gateway.start();
      await gateway.stop();
      await gateway.stop();

      expect(gateway.isRunning).toBe(false);
    });
  });

  describe("handler", () => {
    it("provides echo handler", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
      });
      gateways.push(gateway);

      const response = await gateway.handler.handle({
        sessionKey: "test:session:123",
        content: "hello",
        sender: { id: "user1" },
      });

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: hello");
    });

    it("uses custom prefix", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
        echoPrefix: "Test: ",
      });
      gateways.push(gateway);

      const response = await gateway.handler.handle({
        sessionKey: "test:session:123",
        content: "world",
        sender: { id: "user1" },
      });

      expect(response.text).toBe("Test: world");
    });
  });

  describe("channels", () => {
    it("tracks active channels", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).toContain("http");
    });

    it("supports multiple channels", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
        terminal: { enabled: true, userId: "test" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).toContain("http");
      expect(gateway.channels).toContain("terminal");
    });

    it("supports discord channel", async () => {
      const gateway = createEchoGateway({
        discord: { token: "test-token" },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).toContain("discord");
    });

    it("supports all channels together", async () => {
      const gateway = createEchoGateway({
        discord: { token: "test-token" },
        http: { port: 0 },
        terminal: { enabled: true },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).toContain("discord");
      expect(gateway.channels).toContain("http");
      expect(gateway.channels).toContain("terminal");
    });
  });

  describe("terminal handling", () => {
    it("respects terminal.enabled = false", async () => {
      const gateway = createEchoGateway({
        http: { port: 0 },
        terminal: { enabled: false },
      });
      gateways.push(gateway);

      await gateway.start();

      expect(gateway.channels).not.toContain("terminal");
    });
  });
});
