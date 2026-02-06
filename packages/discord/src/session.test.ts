import { describe, expect, it } from "bun:test";
import {
  DEFAULT_AGENT_ID,
  parseDiscordSessionKey,
  parseUnifiedSessionKey,
  resolveDiscordSessionKey,
} from "./session";

describe("resolveDiscordSessionKey", () => {
  describe("DM mode", () => {
    it("generates user session key for DM", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
      });
      expect(key).toBe(`agent:${DEFAULT_AGENT_ID}:user:user123`);
    });

    it("uses default agent ID for DM", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
      });
      expect(key).toContain(`agent:${DEFAULT_AGENT_ID}:`);
    });

    it("uses custom agent ID for DM", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "mybot",
      });
      expect(key).toBe("agent:mybot:user:user123");
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
      expect(key).toBe(`agent:${DEFAULT_AGENT_ID}:channel:guild456:channel789`);
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
      expect(key).toContain(":channel789");
    });

    it("does NOT include user ID in key (channel-level session)", () => {
      const key = resolveDiscordSessionKey({
        type: "guild",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
      });
      expect(key).not.toContain(":user123");
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
      expect(key).toBe(`agent:${DEFAULT_AGENT_ID}:thread:guild456:thread999`);
    });

    it("uses thread ID instead of channel ID", () => {
      const key = resolveDiscordSessionKey({
        type: "thread",
        userId: "user123",
        guildId: "guild456",
        channelId: "channel789",
        threadId: "thread999",
      });
      expect(key).toContain(":thread999");
      expect(key).not.toContain(":channel789");
    });
  });

  describe("agent ID normalization", () => {
    it("normalizes agent ID to lowercase", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "MyBot",
      });
      expect(key).toBe("agent:mybot:user:user123");
    });

    it("replaces invalid characters", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "My Bot!@#$%",
      });
      expect(key).toBe("agent:my-bot-----:user:user123");
    });

    it("uses default for empty agent ID", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "",
      });
      expect(key).toBe(`agent:${DEFAULT_AGENT_ID}:user:user123`);
    });

    it("uses default for whitespace-only agent ID", () => {
      const key = resolveDiscordSessionKey({
        type: "dm",
        userId: "user123",
        agentId: "   ",
      });
      expect(key).toBe(`agent:${DEFAULT_AGENT_ID}:user:user123`);
    });
  });
});

describe("parseUnifiedSessionKey", () => {
  it("parses user session key", () => {
    const key = "agent:mybot:user:user123";
    const parsed = parseUnifiedSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("user");
    expect(parsed?.userId).toBe("user123");
  });

  it("parses channel session key", () => {
    const key = "agent:mybot:channel:guild456:channel789";
    const parsed = parseUnifiedSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("channel");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.channelId).toBe("channel789");
  });

  it("parses thread session key", () => {
    const key = "agent:mybot:thread:guild456:thread999";
    const parsed = parseUnifiedSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("thread");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.threadId).toBe("thread999");
  });

  it("returns null for non-agent keys", () => {
    expect(parseUnifiedSessionKey("other:key")).toBeNull();
    expect(parseUnifiedSessionKey("")).toBeNull();
    expect(parseUnifiedSessionKey("agent")).toBeNull();
  });

  it("returns null for malformed agent keys", () => {
    expect(parseUnifiedSessionKey("agent:")).toBeNull();
    expect(parseUnifiedSessionKey("agent:mybot")).toBeNull();
    expect(parseUnifiedSessionKey("agent:mybot:invalid")).toBeNull();
  });
});

describe("parseDiscordSessionKey (legacy compatibility)", () => {
  it("parses unified format and returns discord format", () => {
    const key = "agent:mybot:user:user123";
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("dm");
    expect(parsed?.userId).toBe("user123");
  });

  it("parses unified channel format and returns guild format", () => {
    const key = "agent:mybot:channel:guild456:channel789";
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("guild");
    expect(parsed?.userId).toBe("");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.channelId).toBe("channel789");
  });

  it("parses unified thread format and returns thread format", () => {
    const key = "agent:mybot:thread:guild456:thread999";
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("thread");
    expect(parsed?.userId).toBe("");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.threadId).toBe("thread999");
  });

  it("parses legacy DM session key", () => {
    const key = "discord:mybot:dm:user123";
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("dm");
    expect(parsed?.userId).toBe("user123");
  });

  it("parses legacy guild session key", () => {
    const key = "discord:mybot:guild:guild456:channel789:user123";
    const parsed = parseDiscordSessionKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe("mybot");
    expect(parsed?.type).toBe("guild");
    expect(parsed?.userId).toBe("user123");
    expect(parsed?.guildId).toBe("guild456");
    expect(parsed?.channelId).toBe("channel789");
  });

  it("parses legacy thread session key", () => {
    const key = "discord:mybot:thread:guild456:thread999:user123";
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
  });

  it("returns null for malformed discord keys", () => {
    expect(parseDiscordSessionKey("discord:")).toBeNull();
    expect(parseDiscordSessionKey("discord:agent")).toBeNull();
    expect(parseDiscordSessionKey("discord:agent:invalid")).toBeNull();
  });

  it("returns null for legacy dm key with wrong part count", () => {
    expect(parseDiscordSessionKey("discord:mybot:dm")).toBeNull();
    expect(parseDiscordSessionKey("discord:mybot:dm:user:extra")).toBeNull();
  });

  it("returns null for legacy guild key with wrong part count", () => {
    expect(parseDiscordSessionKey("discord:mybot:guild:guild")).toBeNull();
    expect(parseDiscordSessionKey("discord:mybot:guild:g:c")).toBeNull();
  });

  it("returns null for legacy thread key with wrong part count", () => {
    expect(parseDiscordSessionKey("discord:mybot:thread:guild")).toBeNull();
    expect(parseDiscordSessionKey("discord:mybot:thread:g:t")).toBeNull();
  });

  it("returns null for unknown legacy type", () => {
    expect(parseDiscordSessionKey("discord:mybot:unknown:data")).toBeNull();
  });
});
