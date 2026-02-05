import { describe, expect, mock, test } from "bun:test";
import {
  REACTIONS,
  addReaction,
  markError,
  markReceived,
  markSuccess,
  removeReaction,
} from "./reaction";

// Mock message factory
function createMockMessage(options?: {
  reactError?: boolean;
  removeError?: boolean;
}) {
  const reactions = new Map<
    string,
    { users: { remove: ReturnType<typeof mock> } }
  >();

  return {
    react: mock(async (emoji: string) => {
      if (options?.reactError) {
        throw new Error("Cannot react");
      }
      reactions.set(emoji, {
        users: {
          remove: mock(async () => {
            if (options?.removeError) {
              throw new Error("Cannot remove");
            }
          }),
        },
      });
    }),
    reactions: {
      cache: {
        get: (emoji: string) => reactions.get(emoji),
      },
    },
  } as unknown as import("discord.js").Message;
}

describe("reaction", () => {
  describe("REACTIONS", () => {
    test("has correct emoji for RECEIVED", () => {
      expect(REACTIONS.RECEIVED).toBe("👀");
    });

    test("has correct emoji for SUCCESS", () => {
      expect(REACTIONS.SUCCESS).toBe("✅");
    });

    test("has correct emoji for ERROR", () => {
      expect(REACTIONS.ERROR).toBe("❌");
    });
  });

  describe("addReaction", () => {
    test("adds reaction to message", async () => {
      const message = createMockMessage();

      await addReaction(message, "RECEIVED");

      expect(message.react).toHaveBeenCalledWith("👀");
    });

    test("handles react error silently", async () => {
      const message = createMockMessage({ reactError: true });

      // Should not throw
      await addReaction(message, "RECEIVED");

      expect(message.react).toHaveBeenCalled();
    });
  });

  describe("removeReaction", () => {
    test("removes reaction from message", async () => {
      const message = createMockMessage();
      const botUserId = "bot123";

      // First add the reaction
      await addReaction(message, "RECEIVED");

      // Then remove it
      await removeReaction(message, "RECEIVED", botUserId);

      const reaction = message.reactions.cache.get("👀");
      expect(reaction?.users.remove).toHaveBeenCalledWith(botUserId);
    });

    test("handles missing reaction silently", async () => {
      const message = createMockMessage();
      const botUserId = "bot123";

      // Should not throw when reaction doesn't exist
      await removeReaction(message, "RECEIVED", botUserId);
    });

    test("handles remove error silently", async () => {
      const message = createMockMessage({ removeError: true });
      const botUserId = "bot123";

      await addReaction(message, "RECEIVED");

      // Should not throw
      await removeReaction(message, "RECEIVED", botUserId);
    });
  });

  describe("markReceived", () => {
    test("adds 👀 reaction", async () => {
      const message = createMockMessage();

      await markReceived(message);

      expect(message.react).toHaveBeenCalledWith("👀");
    });
  });

  describe("markSuccess", () => {
    test("removes 👀 and adds ✅", async () => {
      const message = createMockMessage();
      const botUserId = "bot123";

      await markReceived(message);
      await markSuccess(message, botUserId);

      expect(message.react).toHaveBeenCalledWith("✅");
      const receivedReaction = message.reactions.cache.get("👀");
      expect(receivedReaction?.users.remove).toHaveBeenCalledWith(botUserId);
    });
  });

  describe("markError", () => {
    test("removes 👀 and adds ❌", async () => {
      const message = createMockMessage();
      const botUserId = "bot123";

      await markReceived(message);
      await markError(message, botUserId);

      expect(message.react).toHaveBeenCalledWith("❌");
      const receivedReaction = message.reactions.cache.get("👀");
      expect(receivedReaction?.users.remove).toHaveBeenCalledWith(botUserId);
    });
  });
});
