import { describe, expect, it } from "bun:test";
import {
  DEFAULT_AGENT_ID,
  DISCORD_SESSION_PREFIX,
  parseDiscordSessionKey,
  resolveDiscordSessionKey,
} from "./session";

describe("resolveDiscordSessionKey", () => {
  describe("DM mode", () => {
    it("generates DM session key", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
      });
      expect(key).toBe(
        `${DISCORD_SESSION_PREFIX}:${DEFAULT_AGENT_ID}:dm:user123`,
      );
    });

    it("uses default agent ID for DM", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
      });
      expect(key).toContain(`:${DEFAULT_AGENT_ID}:`);
    });

    it("uses custom agent ID for DM", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "mybot",
      });
      expect(key).toBe(`${DISCORD_SESSION_PREFIX}:mybot:dm:user123`);
    });
  });

  describe("guild mode", () => {
    it("generates channel session key", () => {
      const key = resolveDiscordSessionKey({
        type: "guild",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
      });
      expect(key).toBe(
        `${DISCORD_SESSION_PREFIX}:${DEFAULT_AGENT_ID}:guild:guild456:channel789:user123`,
      );
    });

    it("includes guild ID in key", () => {
      const key = resolveDiscordSessionKey({
        type: "guild",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
      });
      expect(key).toContain(":guild456:");
    });

    it("includes channel ID in key", () => {
      const key = resolveDiscordSessionKey({
        type: "guild",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
      });
      expect(key).toContain(":channel789:");
    });

    it("includes user ID in key", () => {
      const key = resolveDiscordSessionKey({
        type: "guild",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
      });
      expect(key).toContain(":user123");
    });
  });

  describe("thread mode", () => {
    it("generates thread session key", () => {
      const key = resolveDiscordSessionKey({
        type: "thread",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
        threadId: "thread999",
      });
      expect(key).toBe(
        `${DISCORD_SESSION_PREFIX}:${DEFAULT_AGENT_ID}:thread:guild456:thread999:user123`,
      );
    });

    it("uses thread ID instead of channel ID", () => {
      const key = resolveDiscordSessionKey({
        type: "thread",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
        threadId: "thread999",
      });
      expect(key).toContain(":thread999:");
      expect(key).not.toContain(":channel789:");
    });
  });

  describe("agent ID normalization", () => {
    it("normalizes agent ID to lowercase", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "MyBot",
      });
      expect(key).toBe(`${DISCORD_SESSION_PREFIX}:mybot:dm:user123`);
    });

    it("replaces invalid characters", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "My Bot!@#$%",
      });
      expect(key).toBe(`${DISCORD_SESSION_PREFIX}:my-bot-----:dm:user123`);
    });

    it("uses default for empty agent ID", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "",
      });
      expect(key).toBe(
        `${DISCORD_SESSION_PREFIX}:${DEFAULT_AGENT_ID}:dm:user123`,
      );
    });

    it("uses default for whitespace-only agent ID", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "   ",
      });
      expect(key).toBe(
        `${DISCORD_SESSION_PREFIX}:${DEFAULT_AGENT_ID}:dm:user123`,
      );
    });
  });
});

describe("parseDiscordSessionKey", () => {
  it("parses DM session key", () => {
    const key = `${DISCORD_SESSION_PREFIX}:mybot:dm:user123`;
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("dm");
    expect(parsed?.userId).toBe("user123");
    expect(parsed?.guildId).toBeUndefined();
    expect(parsed?.channelId).toBeUndefined();
    expect(parsed?.threadId).toBeUndefined();
  });

  it("parses guild session key", () => {
    const key = `${DISCORD_SESSION_PREFIX}:mybot:guild:guild456:channel789:user123`;
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("guild");
    expect(parsed?.userId).toBe("user123");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.channelId).toBe("channel789");
    expect(parsed?.threadId).toBeUndefined();
  });

  it("parses thread session key", () => {
    const key = `${DISCORD_SESSION_PREFIX}:mybot:thread:guild456:thread999:user123`;
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("thread");
    expect(parsed?.userId).toBe("user123");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.threadId).toBe("thread999");
  });

  it("returns null for non-discord keys", () => {
    expect(parseDiscordSessionKey("other:key")).toBeNull();
    expect(parseDiscordSessionKey("")).toBeNull();
    expect(parseDiscordSessionKey("discord")).toBeNull();
  });

  it("returns null for malformed discord keys", () => {
    expect(parseDiscordSessionKey(`${DISCORD_SESSION_PREFIX}:`)).toBeNull();
    expect(
      parseDiscordSessionKey(`${DISCORD_SESSION_PREFIX}:agent`),
    ).toBeNull();
    expect(
      parseDiscordSessionKey(`${DISCORD_SESSION_PREFIX}:agent:invalid`),
    ).toBeNull();
  });
});
