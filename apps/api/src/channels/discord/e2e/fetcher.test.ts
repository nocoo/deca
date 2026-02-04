import { describe, expect, test } from "bun:test";
import type { DiscordMessageData } from "./fetcher";
import { findBotResponse } from "./fetcher";

describe("fetcher", () => {
  describe("findBotResponse", () => {
    const createMessage = (
      id: string,
      content: string,
      isBot: boolean,
      authorId = "user123",
    ): DiscordMessageData => ({
      id,
      content,
      author: { id: authorId, username: "TestUser", bot: isBot },
      timestamp: new Date().toISOString(),
    });

    test("finds bot message containing test ID", () => {
      const testId = "e2e-abc123-def456";
      const messages: DiscordMessageData[] = [
        createMessage("1", "Hello there", false),
        createMessage("2", `You said: [${testId}] ping`, true, "bot123"),
        createMessage("3", "Another message", false),
      ];

      const result = findBotResponse(messages, testId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe("2");
    });

    test("ignores non-bot messages", () => {
      const testId = "e2e-abc123-def456";
      const messages: DiscordMessageData[] = [
        createMessage("1", `[${testId}] ping`, false),
      ];

      const result = findBotResponse(messages, testId);

      expect(result).toBeNull();
    });

    test("filters by bot user ID when provided", () => {
      const testId = "e2e-abc123-def456";
      const messages: DiscordMessageData[] = [
        createMessage("1", `Response: [${testId}]`, true, "other-bot"),
        createMessage("2", `You said: [${testId}] ping`, true, "my-bot"),
      ];

      const result = findBotResponse(messages, testId, "my-bot");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("2");
    });

    test("returns null when test ID not found", () => {
      const messages: DiscordMessageData[] = [
        createMessage("1", "You said: hello", true, "bot123"),
      ];

      const result = findBotResponse(messages, "e2e-notfound-000000");

      expect(result).toBeNull();
    });

    test("returns null for empty messages array", () => {
      const result = findBotResponse([], "e2e-abc123-def456");

      expect(result).toBeNull();
    });
  });
});
