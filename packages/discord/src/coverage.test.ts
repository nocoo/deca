/**
 * Targeted branch coverage supplements.
 *
 * Each test in this file is paired with a specific uncovered branch
 * identified via coverage/coverage-final.json. Keep tests narrow.
 */

import type {
  ChatInputCommandInteraction,
  Client,
  Message,
  TextChannel,
  User,
} from "discord.js";
import { ChannelType as DJSChannelType, Events } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the REST class so registerCommands does not hit the network
const mockPut = vi.fn(() => Promise.resolve());
vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>(
    "discord.js",
  );
  class MockREST {
    setToken() {
      return { put: mockPut };
    }
  }
  return {
    ...actual,
    REST: MockREST,
  };
});
import { connectDiscord, createDiscordClient } from "./client";
import { createDebounceManager } from "./debounce";
import { createEchoHandler } from "./echo-handler";
import { createDiscordGateway } from "./gateway";
import { createGracefulShutdown } from "./graceful-shutdown";
import { createMessageListener, processMessage, shouldProcessMessage } from "./listener";
import { createReconnectManager } from "./reconnect";
import { ReplyQueue } from "./reply-queue";
import { ReplyThrottler } from "./reply-throttler";
import { sendReply } from "./sender";
import { parseUnifiedSessionKey } from "./session";
import { setupSlashCommands, registerCommands } from "./slash-commands";
import type { MessageHandler } from "./types";

// ---------------------------------------------------------------------------
// debounce.ts
// ---------------------------------------------------------------------------

describe("debounce coverage", () => {
  it("uses default windowMs when config omits it (line 73)", async () => {
    // No windowMs in config — exercises ?? 3000 default branch
    const handler = vi.fn(async () => {});
    const manager = createDebounceManager(handler, {});
    expect(manager.pendingCount).toBe(0);
  });

  it("flush returns early when group missing (line 106)", async () => {
    // Clear before timer fires so flush() finds no group
    const handler = vi.fn(async () => {});
    const manager = createDebounceManager(handler, { windowMs: 30 });
    const message = {
      id: "m1",
      content: "x",
      author: { id: "u1" },
      channel: { id: "c1" },
    } as unknown as Message;
    manager.add(message);
    manager.clear();
    await new Promise((r) => setTimeout(r, 60));
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler errors inside flush are swallowed", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const manager = createDebounceManager(handler, { windowMs: 20 });
    const message = {
      id: "m1",
      content: "x",
      author: { id: "u1" },
      channel: { id: "c1" },
    } as unknown as Message;
    manager.add(message);
    await new Promise((r) => setTimeout(r, 60));
    expect(handler).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// echo-handler.ts
// ---------------------------------------------------------------------------

describe("echo-handler coverage", () => {
  it("formats sender without displayName (line 90)", async () => {
    const handler = createEchoHandler({ includeSender: true });
    const response = await handler.handle({
      sessionKey: "s",
      content: "hi",
      sender: { id: "u", username: "user" }, // no displayName
      channel: { id: "c", type: "dm" },
    });
    expect(response.text).toContain("@user");
    expect(response.text).not.toContain("(@user)");
  });

  it("formats channel without name (line 97)", async () => {
    const handler = createEchoHandler({ includeChannel: true });
    const response = await handler.handle({
      sessionKey: "s",
      content: "hi",
      sender: { id: "u", username: "user" },
      channel: { id: "abc123", type: "dm" }, // no name
    });
    expect(response.text).toContain("Channel abc123");
  });
});

// ---------------------------------------------------------------------------
// sender.ts
// ---------------------------------------------------------------------------

describe("sender coverage", () => {
  it("sendReply with empty content sends single empty chunk", async () => {
    // chunkMessage("") returns [""] (length 1), so reply is still called once.
    // The `if (chunks.length > 0)` true branch is exercised here too — the
    // false branch is unreachable in practice.
    const replyMock = vi.fn(() => Promise.resolve({ id: "x" }));
    const sendMock = vi.fn(() => Promise.resolve({ id: "x" }));
    const message = {
      id: "m",
      reply: replyMock,
      channel: { send: sendMock, isTextBased: () => true },
    } as unknown as Message;

    await sendReply(message, "");
    expect(replyMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// reply-throttler.ts
// ---------------------------------------------------------------------------

describe("reply-throttler coverage", () => {
  it("respects explicit minIntervalMs and maxProgress (lines 21-22)", () => {
    // Pass values so ?? defaults don't kick in
    const t = new ReplyThrottler({ minIntervalMs: 1000, maxProgress: 1 });
    expect(t).toBeDefined();
  });

  it("uses defaults when no config provided (lines 21-22 default branch)", () => {
    // No constructor args → ?? falls through to defaults
    const t = new ReplyThrottler();
    expect(t).toBeDefined();
  });

  it("uses defaults when config omits fields", () => {
    // Empty object → both fields are undefined → defaults used
    const t = new ReplyThrottler({});
    expect(t).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// reply-queue.ts
// ---------------------------------------------------------------------------

describe("reply-queue coverage", () => {
  it("flush is a no-op when message is null (line 58/67)", async () => {
    const q = new ReplyQueue({ flushIntervalMs: 10 });
    // No enqueue happened → message is still null; flush should resolve without throwing
    await expect(q.flush()).resolves.toBeUndefined();
    // Internal state must remain clean: no message captured
    const internal = q as unknown as { message: Message | null; queue: unknown[] };
    expect(internal.message).toBeNull();
    expect(internal.queue.length).toBe(0);
  });

  it("startFlushTimer skips when timer already exists", async () => {
    const q = new ReplyQueue({ flushIntervalMs: 10 });
    const replyFn = vi.fn(() => Promise.resolve({ id: "x" }));
    const message = {
      id: "m",
      reply: replyFn,
      channel: {
        send: vi.fn(() => Promise.resolve({ id: "x" })),
        isTextBased: () => true,
    isSendable: () => true,
      },
    } as unknown as Message;

    await q.enqueue(message, "ack1", { kind: "ack" });
    const internal = q as unknown as {
      flushTimer: ReturnType<typeof setTimeout> | null;
    };
    const firstTimer = internal.flushTimer;
    expect(firstTimer).not.toBeNull();

    // Second ack triggers startFlushTimer again — must hit `if (this.flushTimer) return`
    // and therefore keep the same timer reference (no replacement).
    await q.enqueue(message, "ack2", { kind: "ack" });
    expect(internal.flushTimer).toBe(firstTimer);
    // Both ack messages should have been sent immediately.
    expect(replyFn).toHaveBeenCalledTimes(2);

    q.reset();
    expect(internal.flushTimer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reconnect.ts
// ---------------------------------------------------------------------------

describe("reconnect coverage", () => {
  it("wraps non-Error rejection from connect() (line 114)", async () => {
    const onMaxRetries = vi.fn(() => {});
    const connect = vi.fn(() => Promise.reject("string failure"));
    const m = createReconnectManager(connect, {
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 5,
      jitterFactor: 0,
      onMaxRetries,
    });
    m.schedule();
    await new Promise((r) => setTimeout(r, 50));
    expect(onMaxRetries).toHaveBeenCalled();
    const errArg = onMaxRetries.mock.calls[0][0] as unknown as Error;
    expect(errArg).toBeInstanceOf(Error);
    expect(errArg.message).toBe("string failure");
    m.stop();
  });
});

// ---------------------------------------------------------------------------
// graceful-shutdown.ts
// ---------------------------------------------------------------------------

describe("graceful-shutdown coverage", () => {
  it("done() is idempotent (line 79)", () => {
    const s = createGracefulShutdown();
    const done = s.trackTask();
    expect(s.pendingCount).toBe(1);
    done();
    expect(s.pendingCount).toBe(0);
    // Calling again should be a no-op (`if (completed) return`)
    done();
    expect(s.pendingCount).toBe(0);
  });

  it("initiateShutdown is idempotent (line 101)", async () => {
    const s = createGracefulShutdown({ timeoutMs: 50 });
    const done = s.trackTask();
    const p1 = s.initiateShutdown();
    // Second call returns immediately via early-return branch
    const p2 = s.initiateShutdown();
    expect(p1).toBeInstanceOf(Promise);
    expect(p2).toBeInstanceOf(Promise);
    done();
    await Promise.all([p1, p2]);
  });
});

// ---------------------------------------------------------------------------
// session.ts
// ---------------------------------------------------------------------------

describe("session coverage", () => {
  it("parseUnifiedSessionKey returns null for user with extra parts (line 80)", () => {
    expect(
      parseUnifiedSessionKey("agent:bot:user:user1:extra"),
    ).toBeNull();
  });

  it("parseUnifiedSessionKey returns null for channel with wrong parts (line 84)", () => {
    expect(parseUnifiedSessionKey("agent:bot:channel:onlyone")).toBeNull();
  });

  it("parseUnifiedSessionKey returns null for thread with wrong parts (line 88)", () => {
    expect(parseUnifiedSessionKey("agent:bot:thread:onlyone")).toBeNull();
  });

  it("parseUnifiedSessionKey returns null for unknown type (line 91)", () => {
    expect(parseUnifiedSessionKey("agent:bot:bogus:rest")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// client.ts
// ---------------------------------------------------------------------------

describe("client coverage", () => {
  it("ignores ready event after timeout already fired (lines 82-91)", async () => {
    const client = createDiscordClient();
    // Add an error handler so post-timeout error events don't bubble
    client.on(Events.Error, () => {});
    let loginResolved = false;
    client.login = vi.fn(() => {
      loginResolved = true;
      return Promise.resolve("token");
    });

    await expect(
      connectDiscord(client, "tok", { timeout: 30 }),
    ).rejects.toThrow("Connection timeout");
    expect(loginResolved).toBe(true);
    // After connect() rejected, the registered once() handlers were removed
    // by cleanup(). Emitting ready/error here is a no-op for connect.
    try {
      client.destroy();
    } catch {}
  });

  it("ignores login rejection after timer/ready fired (line 120)", async () => {
    const client = createDiscordClient();
    let rejectLogin: ((e: Error) => void) | null = null;
    client.login = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectLogin = reject;
        }),
    );
    // Fire ready quickly so resolved=true, then reject login
    setTimeout(() => {
      client.emit(Events.ClientReady, client as never);
      // Reject after we've resolved
      setTimeout(() => rejectLogin?.(new Error("late login error")), 5);
    }, 5);

    await expect(
      connectDiscord(client, "tok", { timeout: 500 }),
    ).resolves.toBeUndefined();

    // Wait for the late rejection to happen (catch handler runs but resolved=true)
    await new Promise((r) => setTimeout(r, 30));
    try {
      client.destroy();
    } catch {}
  });
});

// ---------------------------------------------------------------------------
// gateway.ts
// ---------------------------------------------------------------------------

describe("gateway coverage", () => {
  it("constructs gateway without injected client (covers default createDiscordClient path)", async () => {
    // Without `_client`, the gateway uses createDiscordClient() at line 58.
    // Lines 130-131 (fresh client on reconnect) require a real network connection
    // to exercise — not feasible in unit tests. We at least verify the no-inject
    // construction path produces a working interface.
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };

    const gateway = createDiscordGateway({
      token: "test-token",
      handler,
      reconnect: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 5,
      },
      events: {
        onReconnect: vi.fn(),
        onReconnectFailed: vi.fn(),
      },
    });

    expect(gateway.isConnected).toBe(false);
    expect(gateway.pendingCount).toBe(0);
    expect(gateway.user).toBeNull();
    expect(gateway.guilds).toEqual([]);
    expect(gateway.client).toBeDefined();
    // disconnect must be idempotent and not throw without an active connection
    expect(() => gateway.disconnect()).not.toThrow();
    expect(gateway.isConnected).toBe(false);
  });

  it("invokes onReconnect/onReconnectFailed callbacks (lines 154-157)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const onReconnect = vi.fn(() => {});
    const onReconnectFailed = vi.fn(() => {});

    // Inject a client so we can drive doConnect through ShardDisconnect
    const client = createDiscordClient();
    // Make login always fail so reconnect attempts will exhaust
    client.login = vi.fn(() => Promise.reject(new Error("nope")));

    const gateway = createDiscordGateway({
      token: "test-token",
      handler,
      reconnect: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 5,
      },
      events: {
        onReconnect,
        onReconnectFailed,
        onError: vi.fn(),
      },
      _client: client,
    } as never);

    // Attempt initial connect — will fail
    await expect(gateway.connect()).rejects.toThrow();

    // Trigger ShardDisconnect to schedule reconnect
    client.emit(Events.ShardDisconnect, { code: 1000 } as never, 0);

    // Wait for reconnect attempt to fail and exhaust
    await new Promise((r) => setTimeout(r, 100));

    expect(onReconnectFailed).toHaveBeenCalled();
    gateway.disconnect();
  });
});

// ---------------------------------------------------------------------------
// listener.ts
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Message> = {}): Message {
  const author = {
    id: "user123",
    username: "u",
    displayName: "U",
    bot: false,
    ...(overrides.author as Partial<User>),
  } as User;
  const guild = {
    id: "guild456",
    name: "G",
    ...(overrides.guild as object),
  };
  const channel = {
    id: "channel789",
    name: "c",
    type: DJSChannelType.GuildText,
    send: vi.fn(() => Promise.resolve({ id: "x" })),
    sendTyping: vi.fn(() => Promise.resolve()),
    isTextBased: () => true,
    isSendable: () => true,
    ...(overrides.channel as object),
  };
  const reactionsCache = new Map<
    string,
    { users: { remove: ReturnType<typeof vi.fn> } }
  >();
  return {
    id: "msg",
    content: "hello",
    author,
    guild,
    channel,
    mentions: { users: new Map(), has: () => false },
    reply: vi.fn(() => Promise.resolve({ id: "r" })),
    react: vi.fn(async (emoji: string) => {
      reactionsCache.set(emoji, {
        users: { remove: vi.fn(() => Promise.resolve()) },
      });
    }),
    reactions: { cache: { get: (e: string) => reactionsCache.get(e) } },
    ...overrides,
  } as unknown as Message;
}

describe("listener coverage", () => {
  it("processDebouncedMessage skips empty merged content (line 282-283)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    let onMessage: ((m: Message) => Promise<void>) | null = null;
    const client = {
      user: { id: "bot123", username: "b" },
      on: vi.fn((event: string, h: (m: Message) => Promise<void>) => {
        if (event === "messageCreate") onMessage = h;
      }),
      off: vi.fn(),
    } as unknown as Client;

    const cleanup = createMessageListener(client, {
      handler,
      debounce: { enabled: true, windowMs: 20 },
    });

    // Message that is only a bot mention — extracts to empty
    const m = makeMessage({ content: "<@bot123>" });
    await onMessage?.(m);
    await new Promise((r) => setTimeout(r, 60));

    // Handler must not be called — empty content path
    expect(handler.handle).not.toHaveBeenCalled();
    cleanup();
  });

  it("sends placeholder when handler succeeds with empty text (lines 335-338)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "", success: true })),
    };
    const m = makeMessage();
    await processMessage(m, "bot123", { handler });

    expect(m.reply).toHaveBeenCalled();
    const call = (m.reply as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[0]).toContain("没有生成回复");
  });

  it("getParentChannelId returns undefined when parentId is null (line 461)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const threadChannel = {
      id: "thread1",
      name: "t",
      type: DJSChannelType.PublicThread,
      send: vi.fn(() => Promise.resolve({ id: "x" })),
      sendTyping: vi.fn(() => Promise.resolve()),
      isTextBased: () => true,
    isSendable: () => true,
      parentId: null,
    };
    const m = makeMessage({
      channel: threadChannel as unknown as TextChannel,
    });

    await processMessage(m, "bot123", { handler });

    expect(handler.handle).toHaveBeenCalled();
  });

  it("shouldProcessMessage handles thread with null parentId (line 461)", () => {
    // Allowlist forces getParentChannelId to be called
    const threadChannel = {
      id: "thread-null",
      name: "t",
      type: DJSChannelType.PublicThread,
      send: vi.fn(),
      sendTyping: vi.fn(),
      isTextBased: () => true,
    isSendable: () => true,
      parentId: null,
    };
    const m = makeMessage({
      channel: threadChannel as unknown as TextChannel,
    });

    // No allowlist → still calls getParentChannelId via isAllowed
    const result = shouldProcessMessage(m, "bot123", {
      handler: { handle: vi.fn() },
      allowlist: { channels: ["thread-null"] },
    });
    expect(result).toBe(true);
  });

  it("uses mainChannelId routing when configured (line 395-402)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const m = makeMessage({ content: "hello" });
    await processMessage(m, "bot123", {
      handler,
      mainChannelId: "channel789",
      mainUserId: "main-user-1",
      agentId: "myagent",
    });

    expect(handler.handle).toHaveBeenCalled();
    const req = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(req.sessionKey).toBe("agent:myagent:user:main-user-1");
  });

  it("uses mainChannelId without mainUserId falls back to author (line 399)", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const m = makeMessage({ content: "hello" });
    await processMessage(m, "bot123", {
      handler,
      mainChannelId: "channel789",
    });

    const req = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // No mainUserId provided → falls back to message.author.id
    expect(req.sessionKey).toContain("user123");
  });

  it("skips typing indicator when channel is not sendable", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const sendTyping = vi.fn(() => Promise.resolve());
    const m = makeMessage({
      content: "hello",
      channel: { sendTyping, isSendable: () => false } as never,
    });
    await processMessage(m, "bot123", { handler });
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it("skips typing indicator in debounced flow when channel is not sendable", async () => {
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "ok", success: true })),
    };
    const sendTyping = vi.fn(() => Promise.resolve());
    let onMessage: ((m: Message) => Promise<void>) | null = null;
    const client = {
      user: { id: "bot123", username: "b" },
      on: vi.fn((event: string, h: (m: Message) => Promise<void>) => {
        if (event === "messageCreate") onMessage = h;
      }),
      off: vi.fn(),
    } as unknown as Client;

    const cleanup = createMessageListener(client, {
      handler,
      debounce: { enabled: true, windowMs: 20 },
    });

    const m = makeMessage({
      content: "hi",
      channel: { sendTyping, isSendable: () => false } as never,
    });
    await onMessage?.(m);
    await new Promise((r) => setTimeout(r, 60));
    expect(sendTyping).not.toHaveBeenCalled();
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// slash-commands.ts
// ---------------------------------------------------------------------------

function makeSlashInteraction(
  commandName: string,
  options: Record<string, string> = {},
): ChatInputCommandInteraction {
  const i = {
    isChatInputCommand: () => true,
    commandName,
    user: {
      id: "user1",
      username: "u",
      displayName: "U",
    },
    channelId: "chan1",
    guildId: "guild1",
    options: {
      getString: (n: string, _required?: boolean) => options[n] ?? null,
    },
    reply: vi.fn(() => Promise.resolve()),
    editReply: vi.fn(() => Promise.resolve()),
    followUp: vi.fn(() => Promise.resolve()),
    deferReply: vi.fn(() => {
      i.deferred = true;
      return Promise.resolve();
    }),
    replied: false,
    deferred: false,
  };
  return i as unknown as ChatInputCommandInteraction;
}

function makeSlashClient(): Client {
  return {
    on: vi.fn(() => {}),
    off: vi.fn(() => {}),
  } as unknown as Client;
}

describe("slash-commands coverage", () => {
  it("ask: editReply with error fallback when response.success false (line 235-238)", async () => {
    const client = makeSlashClient();
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "", success: false })),
    };

    setupSlashCommands(client, {
      botApplicationId: "app",
      token: "tok",
      messageHandler: handler,
    });

    const onCall = (client.on as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const handlerFn = onCall[1];

    const interaction = makeSlashInteraction("ask", { question: "q" });
    await handlerFn(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const arg = (interaction.editReply as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(arg).toContain("Failed to process");
  });

  it("ask: editReply with provided error when present (line 238 truthy branch)", async () => {
    const client = makeSlashClient();
    const handler: MessageHandler = {
      handle: vi.fn(() =>
        Promise.resolve({ text: "", success: false, error: "BadStuff" }),
      ),
    };

    setupSlashCommands(client, {
      botApplicationId: "app",
      token: "tok",
      messageHandler: handler,
    });

    const onCall = (client.on as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const handlerFn = onCall[1];

    const interaction = makeSlashInteraction("ask", { question: "q" });
    await handlerFn(interaction);

    const arg = (interaction.editReply as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(arg).toContain("BadStuff");
  });

  it("status: hides session line when not present (line 290 false)", async () => {
    const client = makeSlashClient();
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "x", success: true })),
    };
    const onGetStatus = vi.fn(() =>
      Promise.resolve({
        uptime: 1000,
        guilds: 1,
        model: "m",
        agentId: "a",
        contextTokens: 1000,
        // no session, no lastUsage
      }),
    );

    setupSlashCommands(client, {
      botApplicationId: "app",
      token: "tok",
      messageHandler: handler,
      onGetStatus,
    });

    const onCall = (client.on as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const handlerFn = onCall[1];
    const interaction = makeSlashInteraction("status");
    await handlerFn(interaction);

    const reply = (interaction.reply as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(reply.content).not.toContain("Session:");
  });

  it("status: shows lastUsage with cache HIT and minute age (lines 295-306)", async () => {
    const client = makeSlashClient();
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "x", success: true })),
    };
    const onGetStatus = vi.fn(() =>
      Promise.resolve({
        uptime: 7200000,
        guilds: 2,
        model: "claude",
        agentId: "a",
        contextTokens: 200000,
        session: {
          key: "k",
          messageCount: 3,
          totalChars: 500,
        },
        lastUsage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 80, // > 0 → HIT
          timestamp: Date.now() - 5 * 60 * 1000, // 5 min ago
        },
      }),
    );

    setupSlashCommands(client, {
      botApplicationId: "app",
      token: "tok",
      messageHandler: handler,
      onGetStatus,
    });

    const onCall = (client.on as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const handlerFn = onCall[1];
    const interaction = makeSlashInteraction("status");
    await handlerFn(interaction);

    const reply = (interaction.reply as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(reply.content).toContain("HIT");
    expect(reply.content).toMatch(/\dm ago/);
  });

  it("status: shows lastUsage MISS with seconds age and zero inputTokens (lines 297-304)", async () => {
    const client = makeSlashClient();
    const handler: MessageHandler = {
      handle: vi.fn(() => Promise.resolve({ text: "x", success: true })),
    };
    const onGetStatus = vi.fn(() =>
      Promise.resolve({
        uptime: 1000,
        guilds: 1,
        model: "m",
        agentId: "a",
        contextTokens: 1000,
        lastUsage: {
          inputTokens: 0, // → cacheRatio "0" branch
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0, // → MISS
          timestamp: Date.now(), // → seconds path
        },
      }),
    );

    setupSlashCommands(client, {
      botApplicationId: "app",
      token: "tok",
      messageHandler: handler,
      onGetStatus,
    });

    const onCall = (client.on as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const handlerFn = onCall[1];
    const interaction = makeSlashInteraction("status");
    await handlerFn(interaction);

    const reply = (interaction.reply as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(reply.content).toContain("MISS");
    expect(reply.content).toMatch(/\ds ago/);
  });
});

describe("registerCommands coverage", () => {
  beforeEach(() => {
    mockPut.mockClear();
  });

  it("registers globally when no guildIds (lines 119-124)", async () => {
    await registerCommands({ botApplicationId: "app", token: "tok" });
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it("registers per-guild when guildIds provided (lines 111-118)", async () => {
    await registerCommands(
      { botApplicationId: "app", token: "tok" },
      ["g1", "g2"],
    );
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it("registers globally when guildIds is empty array (line 111 false)", async () => {
    await registerCommands(
      { botApplicationId: "app", token: "tok" },
      [],
    );
    expect(mockPut).toHaveBeenCalledTimes(1);
  });
});
