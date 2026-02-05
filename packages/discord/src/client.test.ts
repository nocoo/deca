import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import {
  type DiscordClientConfig,
  connectDiscord,
  createDiscordClient,
  disconnectDiscord,
  getClientIntents,
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

describe("getClientIntents", () => {
  it("returns array of intent names", () => {
    const client = createDiscordClient();

    const intents = getClientIntents(client);

    expect(Array.isArray(intents)).toBe(true);
    expect(intents.length).toBeGreaterThan(0);
    expect(intents).toContain("Guilds");
    expect(intents).toContain("GuildMessages");
    expect(intents).toContain("DirectMessages");
    expect(intents).toContain("MessageContent");
  });

  it("returns only requested intents for custom config", () => {
    const client = createDiscordClient({
      intents: [GatewayIntentBits.Guilds],
    });

    const intents = getClientIntents(client);

    expect(intents).toContain("Guilds");
    expect(intents).not.toContain("DirectMessages");
    expect(intents).not.toContain("MessageContent");
  });

  it("returns empty array when no intents", () => {
    const client = createDiscordClient({
      intents: [],
    });

    const intents = getClientIntents(client);

    expect(intents).toEqual([]);
  });
});

describe("connectDiscord login error handling", () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = createDiscordClient();
  });

  afterEach(() => {
    try {
      mockClient.destroy();
    } catch {
      // Ignore
    }
  });

  it("rejects when login throws error", async () => {
    // Mock login to reject immediately
    mockClient.login = mock(() =>
      Promise.reject(new Error("Invalid token")),
    );

    await expect(
      connectDiscord(mockClient, "bad-token", { timeout: 1000 }),
    ).rejects.toThrow("Invalid token");
  });

  it("rejects only once when multiple errors occur", async () => {
    // Add an error handler to prevent unhandled error
    mockClient.on(Events.Error, () => {
      // Swallow error to prevent unhandled error
    });

    // Mock login to reject AND emit error
    mockClient.login = mock(() => {
      setTimeout(() => {
        mockClient.emit(Events.Error, new Error("Second error"));
      }, 5);
      return Promise.reject(new Error("First error"));
    });

    // Should only reject once with first error
    await expect(
      connectDiscord(mockClient, "bad-token", { timeout: 1000 }),
    ).rejects.toThrow("First error");

    // Wait for the setTimeout to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
