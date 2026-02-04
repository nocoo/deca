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

    await processMessage(message, "bot123", { handler });

    expect(message.reply).toHaveBeenCalledWith("Hello!");
  });

  it("sends error message on failure", async () => {
    const handler = createMockHandler({
      text: "",
      success: false,
      error: "Something went wrong",
    });
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler });

    expect(message.reply).toHaveBeenCalled();
    const replyCall = (message.reply as ReturnType<typeof mock>).mock.calls[0];
    expect(replyCall[0]).toContain("Something went wrong");
  });

  it("handles handler exceptions", async () => {
    const handler: MessageHandler = {
      handle: mock(() => Promise.reject(new Error("Handler crashed"))),
    };
    const message = createMockMessage();

    await processMessage(message, "bot123", { handler });

    // Should send error message, not throw
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
});

describe("createMessageListener", () => {
  it("returns cleanup function", () => {
    const client = createMockClient();
    const config: ListenerConfig = { handler: createMockHandler() };

    const cleanup = createMessageListener(client, config);

    expect(typeof cleanup).toBe("function");
  });
});
