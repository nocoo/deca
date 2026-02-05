import { describe, expect, it } from "bun:test";
import { isAllowed } from "./allowlist";
import type { AllowlistConfig } from "./types";

// Helper to create test context
interface TestContext {
  userId: string;
  guildId?: string;
  channelId: string;
  parentChannelId?: string;
}

function createContext(overrides: Partial<TestContext> = {}): TestContext {
  return {
    userId: "user123",
    channelId: "channel456",
    ...overrides,
  };
}

describe("isAllowed", () => {
  describe("empty config", () => {
    it("allows all messages with empty config", () => {
      const config: AllowlistConfig = {};
      const ctx = createContext();
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("allows all messages with undefined config", () => {
      const ctx = createContext();
      expect(isAllowed(ctx, undefined)).toBe(true);
    });

    it("allows all messages with null-like values", () => {
      const config: AllowlistConfig = {
        guilds: [],
        channels: [],
        users: [],
        denyUsers: [],
      };
      const ctx = createContext();
      expect(isAllowed(ctx, config)).toBe(true);
    });
  });

  describe("deny list", () => {
    it("blocks denied users first", () => {
      const config: AllowlistConfig = {
        denyUsers: ["user123"],
      };
      const ctx = createContext({ userId: "user123" });
      expect(isAllowed(ctx, config)).toBe(false);
    });

    it("blocks denied users even if in allow list", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
        denyUsers: ["user123"],
      };
      const ctx = createContext({ userId: "user123" });
      expect(isAllowed(ctx, config)).toBe(false);
    });

    it("allows users not in deny list", () => {
      const config: AllowlistConfig = {
        denyUsers: ["user999"],
      };
      const ctx = createContext({ userId: "user123" });
      expect(isAllowed(ctx, config)).toBe(true);
    });
  });

  describe("user allowlist", () => {
    it("allows all when users list empty", () => {
      const config: AllowlistConfig = {
        users: [],
      };
      const ctx = createContext({ userId: "anyuser" });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("allows only listed users", () => {
      const config: AllowlistConfig = {
        users: ["user123", "user456"],
      };
      expect(isAllowed(createContext({ userId: "user123" }), config)).toBe(
        true,
      );
      expect(isAllowed(createContext({ userId: "user456" }), config)).toBe(
        true,
      );
    });

    it("blocks unlisted users", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
      };
      const ctx = createContext({ userId: "user999" });
      expect(isAllowed(ctx, config)).toBe(false);
    });
  });

  describe("guild allowlist", () => {
    it("allows all when guilds list empty", () => {
      const config: AllowlistConfig = {
        guilds: [],
      };
      const ctx = createContext({ guildId: "anyguild" });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("allows DMs regardless of guild list", () => {
      const config: AllowlistConfig = {
        guilds: ["guild123"],
      };
      // DM has no guildId
      const ctx = createContext({ guildId: undefined });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("allows only listed guilds", () => {
      const config: AllowlistConfig = {
        guilds: ["guild123", "guild456"],
      };
      expect(isAllowed(createContext({ guildId: "guild123" }), config)).toBe(
        true,
      );
      expect(isAllowed(createContext({ guildId: "guild456" }), config)).toBe(
        true,
      );
    });

    it("blocks unlisted guilds", () => {
      const config: AllowlistConfig = {
        guilds: ["guild123"],
      };
      const ctx = createContext({ guildId: "guild999" });
      expect(isAllowed(ctx, config)).toBe(false);
    });
  });

  describe("channel allowlist", () => {
    it("allows all when channels list empty", () => {
      const config: AllowlistConfig = {
        channels: [],
      };
      const ctx = createContext({ channelId: "anychannel" });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("allows only listed channels", () => {
      const config: AllowlistConfig = {
        channels: ["channel123", "channel456"],
      };
      expect(
        isAllowed(createContext({ channelId: "channel123" }), config),
      ).toBe(true);
      expect(
        isAllowed(createContext({ channelId: "channel456" }), config),
      ).toBe(true);
    });

    it("blocks unlisted channels", () => {
      const config: AllowlistConfig = {
        channels: ["channel123"],
      };
      const ctx = createContext({ channelId: "channel999" });
      expect(isAllowed(ctx, config)).toBe(false);
    });
  });

  describe("combined rules", () => {
    it("requires user AND guild AND channel", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
        guilds: ["guild123"],
        channels: ["channel123"],
      };
      const ctx = createContext({
        userId: "user123",
        guildId: "guild123",
        channelId: "channel123",
      });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("blocks if user check fails", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
        guilds: ["guild123"],
        channels: ["channel123"],
      };
      const ctx = createContext({
        userId: "wronguser",
        guildId: "guild123",
        channelId: "channel123",
      });
      expect(isAllowed(ctx, config)).toBe(false);
    });

    it("blocks if guild check fails", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
        guilds: ["guild123"],
        channels: ["channel123"],
      };
      const ctx = createContext({
        userId: "user123",
        guildId: "wrongguild",
        channelId: "channel123",
      });
      expect(isAllowed(ctx, config)).toBe(false);
    });

    it("blocks if channel check fails", () => {
      const config: AllowlistConfig = {
        users: ["user123"],
        guilds: ["guild123"],
        channels: ["channel123"],
      };
      const ctx = createContext({
        userId: "user123",
        guildId: "guild123",
        channelId: "wrongchannel",
      });
      expect(isAllowed(ctx, config)).toBe(false);
    });
  });

  describe("thread handling", () => {
    it("checks thread channel ID", () => {
      const config: AllowlistConfig = {
        channels: ["thread789"],
      };
      // Thread uses its own ID as channelId
      const ctx = createContext({ channelId: "thread789" });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("checks parent channel ID for threads", () => {
      const config: AllowlistConfig = {
        channels: ["parent123"],
      };
      // Thread with parent channel
      const ctx = createContext({
        channelId: "thread789",
        parentChannelId: "parent123",
      });
      expect(isAllowed(ctx, config)).toBe(true);
    });

    it("blocks if neither thread nor parent matches", () => {
      const config: AllowlistConfig = {
        channels: ["channel123"],
      };
      const ctx = createContext({
        channelId: "thread789",
        parentChannelId: "parent456",
      });
      expect(isAllowed(ctx, config)).toBe(false);
    });
  });
});
