import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Client, Guild, Message, TextChannel, User } from "discord.js";
import { ChannelType as DJSChannelType } from "discord.js";
import {
  type ListenerConfig,
  createMessageListener,
  extractContent,
  processMessage,
  shouldProcessMessage,
} from "./listener";
import type { AllowlistConfig, MessageHandler, MessageResponse } from "./types";

// Mock factories
function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user123",
    username: "testuser",
    displayName: "Test User",
    bot: false,
    ...overrides,
  } as User;
}

function createMockGuild(overrides: Partial<Guild> = {}): Guild {
  return {
    id: "guild456",
    name: "Test Guild",
    ...overrides,
  } as Guild;
}

function createMockChannel(overrides: Partial<TextChannel> = {}): TextChannel {
  return {
    id: "channel789",
    name: "test-channel",
    type: DJSChannelType.GuildText,
    send: mock(() => Promise.resolve({ id: "sent-id" })),
    sendTyping: mock(() => Promise.resolve()),
    isTextBased: () => true,
    ...overrides,
  } as unknown as TextChannel;
}

function createMockMessage(overrides: Partial<Message> = {}): Message {
  const author = createMockUser(overrides.author as Partial<User>);
  const guild = createMockGuild(overrides.guild as Partial<Guild>);
  const channel = createMockChannel(overrides.channel as Partial<TextChannel>);

  // Track reactions for testing
  const reactionsCache = new Map<
    string,
    { users: { remove: ReturnType<typeof mock> } }
  >();

  return {
    id: "msg-id",
    content: "Hello bot!",
    author,
    guild,
    channel,
    mentions: {
      users: new Map(),
      has: () => false,
    },
    reply: mock(() => Promise.resolve({ id: "reply-id" })),
    react: mock(async (emoji: string) => {
      reactionsCache.set(emoji, {
        users: { remove: mock(() => Promise.resolve()) },
      });
    }),
    reactions: {
      cache: {
        get: (emoji: string) => reactionsCache.get(emoji),
      },
    },
    ...overrides,
  } as unknown as Message;
}

function createMockHandler(
  response: MessageResponse = { text: "OK", success: true },
): MessageHandler {
  return {
    handle: mock(() => Promise.resolve(response)),
  };
}

function createMockClient(user: Partial<User> = {}): Client {
  return {
    user: {
      id: "bot123",
      username: "testbot",
      ...user,
    },
    on: mock(() => {}),
    off: mock(() => {}),
  } as unknown as Client;
}

describe("shouldProcessMessage", () => {
  const botUserId = "bot123";

  describe("bot filtering", () => {
    it("ignores bot messages by default", () => {
      const message = createMockMessage({
        author: createMockUser({ bot: true }),
      });
      const config: ListenerConfig = { handler: createMockHandler() };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("ignores own messages", () => {
      const message = createMockMessage({
        author: createMockUser({ id: "bot123" }),
      });
      const config: ListenerConfig = { handler: createMockHandler() };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("processes user messages", () => {
      const message = createMockMessage();
      const config: ListenerConfig = { handler: createMockHandler() };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(true);
    });
  });

  describe("allowlist", () => {
    it("respects guild allowlist", () => {
      const message = createMockMessage({
        guild: createMockGuild({ id: "wrong-guild" }),
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        allowlist: { guilds: ["allowed-guild"] },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("respects channel allowlist", () => {
      const message = createMockMessage({
        channel: createMockChannel({ id: "wrong-channel" }),
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        allowlist: { channels: ["allowed-channel"] },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("respects user allowlist", () => {
      const message = createMockMessage({
        author: createMockUser({ id: "wrong-user" }),
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        allowlist: { users: ["allowed-user"] },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("respects deny list", () => {
      const message = createMockMessage({
        author: createMockUser({ id: "denied-user" }),
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        allowlist: { denyUsers: ["denied-user"] },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("allows when all checks pass", () => {
      const message = createMockMessage({
        author: createMockUser({ id: "user123" }),
        guild: createMockGuild({ id: "guild456" }),
        channel: createMockChannel({ id: "channel789" }),
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        allowlist: {
          users: ["user123"],
          guilds: ["guild456"],
          channels: ["channel789"],
        },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(true);
    });
  });

  describe("mention requirement", () => {
    it("requires mention when global config set", () => {
      const message = createMockMessage({
        mentions: { users: new Map(), has: () => false } as never,
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        requireMention: true,
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("processes when mentioned and required", () => {
      const message = createMockMessage({
        mentions: {
          users: new Map([["bot123", createMockUser({ id: "bot123" })]]),
          has: (user: User) => user.id === "bot123",
        } as never,
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        requireMention: true,
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(true);
    });

    it("processes without mention when not required", () => {
      const message = createMockMessage();
      const config: ListenerConfig = {
        handler: createMockHandler(),
        requireMention: false,
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(true);
    });

    it("requires mention for specific guild", () => {
      const message = createMockMessage({
        guild: createMockGuild({ id: "strict-guild" }),
        mentions: { users: new Map(), has: () => false } as never,
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        requireMentionByGuild: { "strict-guild": true },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });

    it("requires mention for specific channel", () => {
      const message = createMockMessage({
        channel: createMockChannel({ id: "strict-channel" }),
        mentions: { users: new Map(), has: () => false } as never,
      });
      const config: ListenerConfig = {
        handler: createMockHandler(),
        requireMentionByChannel: { "strict-channel": true },
      };

      expect(shouldProcessMessage(message, botUserId, config)).toBe(false);
    });
  });
});

describe("extractContent", () => {
  it("trims whitespace", () => {
    const content = extractContent("  Hello world  ", "bot123");
    expect(content).toBe("Hello world");
  });

  it("removes bot mention", () => {
    const content = extractContent("<@bot123> Hello", "bot123");
    expect(content).toBe("Hello");
  });

  it("removes multiple mentions of bot", () => {
    const content = extractContent("<@bot123> Hello <@bot123>", "bot123");
    expect(content).toBe("Hello");
  });

  it("preserves other user mentions", () => {
    const content = extractContent("<@bot123> Hello <@other456>", "bot123");
    expect(content).toBe("Hello <@other456>");
  });

  it("handles nickname mentions", () => {
    const content = extractContent("<@!bot123> Hello", "bot123");
    expect(content).toBe("Hello");
  });
});

describe("processMessage", () => {
  it("calls handler with correct MessageRequest", async () => {
    const handler = createMockHandler();
    const message = createMockMessage({
      content: "Hello bot!",
      author: createMockUser({ id: "user123", username: "testuser" }),
      guild: createMockGuild({ id: "guild456", name: "Test Guild" }),
      channel: createMockChannel({ id: "channel789", name: "test-channel" }),
    });

    await processMessage(message, "bot123", {
      handler,
      agentId: "mybot",
    });

    expect(handler.handle).toHaveBeenCalled();
    const call = (handler.handle as ReturnType<typeof mock>).mock.calls[0];
    const request = call[0];

    expect(request.content).toBe("Hello bot!");
    expect(request.sender.id).toBe("user123");
    expect(request.sender.username).toBe("testuser");
    expect(request.channel.id).toBe("channel789");
    expect(request.channel.guildId).toBe("guild456");
    expect(request.sessionKey).toContain("discord:mybot:");
  });

  it("sends reply on success", async () => {
    const handler = createMockHandler({ text: "Hello!", success: true });
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler, debugMode: false });

    expect(message.reply).toHaveBeenCalledWith("Hello!");
  });

  it("sends error message on failure", async () => {
    const handler = createMockHandler({
      text: "",
      success: false,
      error: "Something went wrong",
    });
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler, debugMode: false });

    expect(message.reply).toHaveBeenCalled();
    const replyCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
    expect(replyCall[0]).toContain("Something went wrong");
  });

  it("handles handler exceptions", async () => {
    const handler: MessageHandler = {
      handle: mock(() => Promise.reject(new Error("Handler crashed"))),
    };
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler, debugMode: false });

    // Should send error message, not throw
    expect(message.reply).toHaveBeenCalled();
    const replyCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
    expect(replyCall[0]).toContain("error");
  });

  it("handles handler sync exceptions", async () => {
    const handler: MessageHandler = {
      handle: mock(() => {
        throw new Error("Sync handler crash");
      }),
    };
    const message = createMockMessage();

    // Should not throw, should handle gracefully
    await processMessage(message, "bot123", { handler, debugMode: false });

    expect(message.reply).toHaveBeenCalled();
    const replyCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
    expect(replyCall[0]).toContain("error");
  });

  it("handles reply failures gracefully", async () => {
    const handler: MessageHandler = {
      handle: mock(() => Promise.reject(new Error("Handler error"))),
    };
    const message = createMockMessage();
    // Make reply throw
    message.reply = mock(() => Promise.reject(new Error("Reply failed")));

    // Should not throw even if reply fails
    await expect(
      processMessage(message, "bot123", { handler, debugMode: false }),
    ).resolves.toBeUndefined();
  });

  it("handles non-Error exceptions", async () => {
    const handler: MessageHandler = {
      handle: mock(() => Promise.reject("string error")),
    };
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler, debugMode: false });

    expect(message.reply).toHaveBeenCalled();
    const replyCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
    expect(replyCall[0]).toContain("error");
  });

  it("shows typing before handler call", async () => {
    const handler = createMockHandler();
    const channel = createMockChannel();
    const message = createMockMessage({ channel });

    await processMessage(message, "bot123", { handler });

    expect(channel.sendTyping).toHaveBeenCalled();
  });

  describe("debugMode", () => {
    it("sends debug message before processing when debugMode is true", async () => {
      const handler = createMockHandler({ text: "Response", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler, debugMode: true });

      // Should have 2 replies: debug message + actual response
      expect(message.reply).toHaveBeenCalledTimes(2);
      const firstCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
      const secondCall = (message.reply as ReturnType<typeof mock>).mock.calls[1];

      // First message should be debug info
      expect(firstCall[0]).toContain("Processing...");
      expect(firstCall[0]).toContain("Session:");
      expect(firstCall[0]).toContain("```");

      // Second message should be actual response
      expect(secondCall[0]).toBe("Response");
    });

    it("sends debug message by default (debugMode undefined)", async () => {
      const handler = createMockHandler({ text: "Response", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      // Should have 2 replies: debug message + actual response
      expect(message.reply).toHaveBeenCalledTimes(2);
      const firstCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
      expect(firstCall[0]).toContain("Processing...");
    });

    it("skips debug message when debugMode is false", async () => {
      const handler = createMockHandler({ text: "Response", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler, debugMode: false });

      // Should only have 1 reply: actual response
      expect(message.reply).toHaveBeenCalledTimes(1);
      expect(message.reply).toHaveBeenCalledWith("Response");
    });

    it("includes short session key in debug message", async () => {
      const handler = createMockHandler({ text: "OK", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler, debugMode: true });

      const firstCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
      // Session key should be truncated (last 12 chars with ... prefix)
      expect(firstCall[0]).toMatch(/Session: \.\.\.[a-z0-9:]+/i);
    });

    it("includes timestamp in debug message", async () => {
      const handler = createMockHandler({ text: "OK", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler, debugMode: true });

      const firstCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
      // Should contain ISO timestamp format
      expect(firstCall[0]).toMatch(/Time: \d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("reactions", () => {
    it("adds 👀 reaction when message received", async () => {
      const handler = createMockHandler();
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      expect(message.react).toHaveBeenCalledWith("👀");
    });

    it("adds ✅ reaction on success", async () => {
      const handler = createMockHandler({ text: "OK", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      expect(message.react).toHaveBeenCalledWith("✅");
    });

    it("adds ❌ reaction on handler error", async () => {
      const handler: MessageHandler = {
        handle: mock(() => Promise.reject(new Error("Error"))),
      };
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      expect(message.react).toHaveBeenCalledWith("❌");
    });

    it("adds ❌ reaction on failure response", async () => {
      const handler = createMockHandler({
        text: "",
        success: false,
        error: "Failed",
      });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      expect(message.react).toHaveBeenCalledWith("❌");
    });

    it("removes 👀 reaction after processing", async () => {
      const handler = createMockHandler({ text: "OK", success: true });
      const message = createMockMessage();

      await processMessage(message, "bot123", { handler });

      // 👀 reaction should have users.remove called
      const receivedReaction = (
        message.reactions as unknown as {
          cache: { get: (emoji: string) => { users: { remove: unknown } } };
        }
      ).cache.get("👀");
      expect(receivedReaction?.users.remove).toHaveBeenCalledWith("bot123");
    });
  });
});

describe("createMessageListener", () => {
  it("returns cleanup function", () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);

    expect(typeof cleanup).toBe("function");
  });

  it("has shutdown method on cleanup function", () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);

    expect(typeof cleanup.shutdown).toBe("function");
  });

  it("has pendingCount property on cleanup function", () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);

    expect(cleanup.pendingCount).toBe(0);
  });

  it("creates with debounce enabled", () => {
    const client = createMockClient();
    const config: ListenerConfig = {
      handler: createMockHandler(),
      debounce: { enabled: true, windowMs: 1000 },
    };

    const cleanup = createMessageListener(client, config);

    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("creates with debounce disabled", () => {
    const client = createMockClient();
    const config: ListenerConfig = {
      handler: createMockHandler(),
      debounce: { enabled: false },
    };

    const cleanup = createMessageListener(client, config);

    expect(typeof cleanup).toBe("function");
  });

  it("cleanup removes event listener", () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);
    cleanup();

    expect(client.off).toHaveBeenCalled();
  });

  it("shutdown waits for pending tasks and removes listener", async () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);
    await cleanup.shutdown?.();

    expect(client.off).toHaveBeenCalled();
  });
});

describe("processMessage edge cases", () => {
  it("skips empty content after extraction", async () => {
    const handler = createMockHandler();
    // Message with only bot mention = empty after extraction
    const message = createMockMessage({
      content: "<@bot123>",
    });

    await processMessage(message, "bot123", { handler });

    // Handler should not be called for empty content
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it("skips whitespace-only content", async () => {
    const handler = createMockHandler();
    const message = createMockMessage({
      content: "   ",
    });

    await processMessage(message, "bot123", { handler });

    expect(handler.handle).not.toHaveBeenCalled();
  });

  it("handles DM messages (no guild)", async () => {
    const handler = createMockHandler();
    const message = createMockMessage({
      content: "Hello!",
      guild: null as unknown as Guild,
    });

    await processMessage(message, "bot123", { handler });

    expect(handler.handle).toHaveBeenCalled();
    const call = (handler.handle as ReturnType<typeof mock>).mock.calls[0];
    const request = call[0];
    expect(request.channel.type).toBe("dm");
  });

  it("handles thread messages", async () => {
    const handler = createMockHandler();
    const threadChannel = createMockChannel({
      id: "thread123",
      name: "thread-name",
      type: DJSChannelType.PublicThread,
    });
    // Add parentId for thread
    (threadChannel as unknown as { parentId: string }).parentId =
      "parent-channel-id";

    const message = createMockMessage({
      content: "Hello from thread!",
      channel: threadChannel,
    });

    await processMessage(message, "bot123", { handler });

    expect(handler.handle).toHaveBeenCalled();
    const call = (handler.handle as ReturnType<typeof mock>).mock.calls[0];
    const request = call[0];
    expect(request.channel.type).toBe("thread");
    expect(request.channel.threadId).toBe("thread123");
  });

  it("handles private thread messages", async () => {
    const handler = createMockHandler();
    const threadChannel = createMockChannel({
      id: "private-thread123",
      type: DJSChannelType.PrivateThread,
    });
    (threadChannel as unknown as { parentId: string | null }).parentId = null;

    const message = createMockMessage({
      content: "Hello from private thread!",
      channel: threadChannel,
    });

    await processMessage(message, "bot123", { handler });

    expect(handler.handle).toHaveBeenCalled();
    const call = (handler.handle as ReturnType<typeof mock>).mock.calls[0];
    const request = call[0];
    expect(request.channel.type).toBe("thread");
  });

  it("handles channel without name property", async () => {
    const handler = createMockHandler();
    const channelWithoutName = {
      id: "channel789",
      type: DJSChannelType.GuildText,
      send: mock(() => Promise.resolve({ id: "sent-id" })),
      sendTyping: mock(() => Promise.resolve()),
      isTextBased: () => true,
      // No 'name' property
    } as unknown as TextChannel;

    const message = createMockMessage({
      content: "Hello!",
      channel: channelWithoutName,
    });

    await processMessage(message, "bot123", { handler });

    expect(handler.handle).toHaveBeenCalled();
  });
});
