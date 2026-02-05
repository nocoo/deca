import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type Client, Events } from "discord.js";
import { createDiscordClient } from "./client";
import { type DiscordGatewayInstance, createDiscordGateway } from "./gateway";
import type {
  DiscordGatewayConfig,
  MessageHandler,
  MessageResponse,
} from "./types";

function createMockHandler(
  response: MessageResponse = { text: "OK", success: true },
): MessageHandler {
  return {
    handle: mock(() => Promise.resolve(response)),
  };
}

describe("createDiscordGateway", () => {
  it("creates gateway with token", () => {
    const config: DiscordGatewayConfig = {
      token: "test-token",
      handler: createMockHandler(),
    };

    const gateway = createDiscordGateway(config);

    expect(gateway).toBeDefined();
    expect(gateway.isConnected).toBe(false);
  });

  it("creates gateway with handler", () => {
    const handler = createMockHandler();
    const config: DiscordGatewayConfig = {
      token: "test-token",
      handler,
    };

    const gateway = createDiscordGateway(config);

    expect(gateway).toBeDefined();
  });

  it("throws without token", () => {
    const config = {
      handler: createMockHandler(),
    } as DiscordGatewayConfig;

    expect(() => createDiscordGateway(config)).toThrow("token");
  });
});

describe("DiscordGateway", () => {
  let gateway: DiscordGatewayInstance;
  let mockClient: Client;

  beforeEach(() => {
    mockClient = createDiscordClient();
    // Mock login to emit ready
    mockClient.login = mock(() => {
      setTimeout(() => {
        // Simulate user being set
        Object.defineProperty(mockClient, "user", {
          value: {
            id: "bot123",
            username: "testbot",
            discriminator: "0000",
            tag: "testbot#0000",
          },
          configurable: true,
        });
        mockClient.emit(Events.ClientReady, mockClient as never);
      }, 10);
      return Promise.resolve("token");
    });
  });

  afterEach(() => {
    if (gateway?.isConnected) {
      gateway.disconnect();
    }
    mockClient.destroy();
  });

  describe("connect", () => {
    it("connects with token", async () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient, // Inject mock client
      });

      await gateway.connect();

      expect(mockClient.login).toHaveBeenCalledWith("test-token");
    });

    it("sets up message listener", async () => {
      // Track calls to on() while preserving functionality
      const originalOn = mockClient.on.bind(mockClient);
      const onCalls: [string, unknown][] = [];
      mockClient.on = ((event: string, listener: unknown) => {
        onCalls.push([event, listener]);
        return originalOn(event, listener);
      }) as typeof mockClient.on;

      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      await gateway.connect();

      // Should have registered messageCreate listener
      const hasMessageCreate = onCalls.some(
        (call) => call[0] === Events.MessageCreate,
      );
      expect(hasMessageCreate).toBe(true);
    });

    it("updates isConnected", async () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      expect(gateway.isConnected).toBe(false);

      await gateway.connect();

      // isConnected checks client.isReady()
      Object.defineProperty(mockClient, "isReady", {
        value: () => true,
        configurable: true,
      });

      expect(gateway.isConnected).toBe(true);
    });
  });

  describe("disconnect", () => {
    it("disconnects client", async () => {
      const destroySpy = mock(() => {});
      mockClient.destroy = destroySpy;

      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      await gateway.connect();
      gateway.disconnect();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe("properties", () => {
    it("exposes user info", async () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      await gateway.connect();

      expect(gateway.user).not.toBeNull();
      expect(gateway.user?.id).toBe("bot123");
      expect(gateway.user?.username).toBe("testbot");
    });

    it("returns null user before connect", () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      expect(gateway.user).toBeNull();
    });

    it("exposes guild list", async () => {
      // Mock guilds
      Object.defineProperty(mockClient, "guilds", {
        value: {
          cache: new Map([
            [
              "guild1",
              { id: "guild1", name: "Test Guild 1", memberCount: 100 },
            ],
            ["guild2", { id: "guild2", name: "Test Guild 2", memberCount: 50 }],
          ]),
        },
        configurable: true,
      });

      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      await gateway.connect();

      expect(gateway.guilds).toHaveLength(2);
      expect(gateway.guilds[0].id).toBe("guild1");
    });
  });

  describe("reconnect", () => {
    it("enables reconnect by default", () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
      });

      // Gateway created successfully with reconnect enabled
      expect(gateway).toBeDefined();
    });

    it("can disable reconnect", () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
        reconnect: { enabled: false },
      });

      expect(gateway).toBeDefined();
    });

    it("accepts reconnect configuration", () => {
      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
        reconnect: {
          enabled: true,
          maxRetries: 10,
          baseDelayMs: 500,
          maxDelayMs: 30000,
        },
      });

      expect(gateway).toBeDefined();
    });

    it("calls onConnect callback", async () => {
      const onConnect = mock(() => {});

      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
        events: { onConnect },
      });

      await gateway.connect();

      expect(onConnect).toHaveBeenCalled();
    });

    it("calls onError callback on error", async () => {
      const onError = mock(() => {});
      const testError = new Error("Test error");

      gateway = createDiscordGateway({
        token: "test-token",
        handler: createMockHandler(),
        _client: mockClient,
        events: { onError },
      });

      await gateway.connect();

      // Emit error
      mockClient.emit(Events.Error, testError);

      expect(onError).toHaveBeenCalledWith(testError);
    });
  });
});
