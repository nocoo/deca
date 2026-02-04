import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import {
  type DiscordClientConfig,
  connectDiscord,
  createDiscordClient,
  disconnectDiscord,
  isClientConnected,
} from "./client";

describe("createDiscordClient", () => {
  it("creates client with default intents", () => {
    const client = createDiscordClient();

    expect(client).toBeInstanceOf(Client);
    // Check that essential intents are included
    const intents = client.options.intents;
    expect(intents.has(GatewayIntentBits.Guilds)).toBe(true);
    expect(intents.has(GatewayIntentBits.GuildMessages)).toBe(true);
    expect(intents.has(GatewayIntentBits.DirectMessages)).toBe(true);
    expect(intents.has(GatewayIntentBits.MessageContent)).toBe(true);
  });

  it("creates client with custom intents", () => {
    const config: DiscordClientConfig = {
      intents: [GatewayIntentBits.Guilds],
    };
    const client = createDiscordClient(config);

    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.DirectMessages)).toBe(
      false,
    );
  });

  it("includes required partials for DMs", () => {
    const client = createDiscordClient();

    const partials = client.options.partials || [];
    expect(partials.includes(Partials.Channel)).toBe(true);
    expect(partials.includes(Partials.Message)).toBe(true);
  });
});

describe("connectDiscord", () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = createDiscordClient();
    // Mock the login method
    mockClient.login = mock(() => Promise.resolve("token"));
  });

  afterEach(() => {
    mockClient.destroy();
  });

  it("resolves when ready event fires", async () => {
    // Simulate ready event after login
    const loginMock = mock(() => {
      // Emit ready event shortly after login is called
      setTimeout(() => {
        mockClient.emit(Events.ClientReady, mockClient as never);
      }, 10);
      return Promise.resolve("token");
    });
    mockClient.login = loginMock;

    await expect(
      connectDiscord(mockClient, "test-token", { timeout: 1000 }),
    ).resolves.toBeUndefined();

    expect(loginMock).toHaveBeenCalledWith("test-token");
  });

  it("rejects on error event", async () => {
    const loginMock = mock(() => {
      setTimeout(() => {
        mockClient.emit(Events.Error, new Error("Connection failed"));
      }, 10);
      return Promise.resolve("token");
    });
    mockClient.login = loginMock;

    await expect(
      connectDiscord(mockClient, "test-token", { timeout: 1000 }),
    ).rejects.toThrow("Connection failed");
  });

  it("rejects on timeout", async () => {
    // Never emit ready event
    const loginMock = mock(() => Promise.resolve("token"));
    mockClient.login = loginMock;

    await expect(
      connectDiscord(mockClient, "test-token", { timeout: 50 }),
    ).rejects.toThrow("Connection timeout");
  });

  it("calls login with token", async () => {
    const loginMock = mock(() => {
      setTimeout(() => {
        mockClient.emit(Events.ClientReady, mockClient as never);
      }, 10);
      return Promise.resolve("token");
    });
    mockClient.login = loginMock;

    await connectDiscord(mockClient, "my-bot-token", { timeout: 1000 });

    expect(loginMock).toHaveBeenCalledWith("my-bot-token");
  });
});

describe("disconnectDiscord", () => {
  it("calls client.destroy()", () => {
    const client = createDiscordClient();
    const destroyMock = mock(() => {});
    client.destroy = destroyMock;

    disconnectDiscord(client);

    expect(destroyMock).toHaveBeenCalled();
  });

  it("handles already destroyed client gracefully", () => {
    const client = createDiscordClient();
    client.destroy();

    // Should not throw
    expect(() => disconnectDiscord(client)).not.toThrow();
  });
});

describe("isClientConnected", () => {
  it("returns true when connected", () => {
    const client = createDiscordClient();
    // Simulate connected state
    Object.defineProperty(client, "isReady", {
      value: () => true,
    });

    expect(isClientConnected(client)).toBe(true);
  });

  it("returns false when disconnected", () => {
    const client = createDiscordClient();

    expect(isClientConnected(client)).toBe(false);
  });

  it("returns false before connect", () => {
    const client = createDiscordClient();

    expect(isClientConnected(client)).toBe(false);
  });
});
