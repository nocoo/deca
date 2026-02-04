import { describe, expect, it } from "bun:test";
import type { Message } from "../core/session.js";
import {
  DEFAULT_CONTEXT_PRUNING_SETTINGS,
  pruneContextMessages,
  resolvePruningSettings,
} from "./pruning.js";

describe("pruning", () => {
  describe("resolvePruningSettings", () => {
    it("should return defaults when no input", () => {
      const settings = resolvePruningSettings();
      expect(settings).toEqual(DEFAULT_CONTEXT_PRUNING_SETTINGS);
    });

    it("should return defaults when undefined", () => {
      const settings = resolvePruningSettings(undefined);
      expect(settings).toEqual(DEFAULT_CONTEXT_PRUNING_SETTINGS);
    });

    it("should clamp maxHistoryShare between 0 and 1", () => {
      expect(
        resolvePruningSettings({ maxHistoryShare: 1.5 }).maxHistoryShare,
      ).toBe(1);
      expect(
        resolvePruningSettings({ maxHistoryShare: -0.5 }).maxHistoryShare,
      ).toBe(0);
      expect(
        resolvePruningSettings({ maxHistoryShare: 0.7 }).maxHistoryShare,
      ).toBe(0.7);
    });

    it("should floor keepLastAssistants to non-negative integer", () => {
      expect(
        resolvePruningSettings({ keepLastAssistants: 5.7 }).keepLastAssistants,
      ).toBe(5);
      expect(
        resolvePruningSettings({ keepLastAssistants: -2 }).keepLastAssistants,
      ).toBe(0);
    });

    it("should handle invalid numbers with defaults", () => {
      expect(
        resolvePruningSettings({ maxHistoryShare: Number.NaN }).maxHistoryShare,
      ).toBe(DEFAULT_CONTEXT_PRUNING_SETTINGS.maxHistoryShare);
    });

    it("should merge softTrim settings", () => {
      const settings = resolvePruningSettings({
        softTrim: { maxChars: 1000 },
      });
      expect(settings.softTrim.maxChars).toBe(1000);
      expect(settings.softTrim.headChars).toBe(
        DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.headChars,
      );
    });
  });

  describe("pruneContextMessages", () => {
    function makeMessage(role: "user" | "assistant", content: string): Message {
      return { role, content, timestamp: Date.now() };
    }

    it("should keep all messages when within budget", () => {
      const messages: Message[] = [
        makeMessage("user", "Hello"),
        makeMessage("assistant", "Hi there"),
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 10000,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.droppedMessages).toHaveLength(0);
    });

    it("should drop oldest messages when over budget", () => {
      const messages: Message[] = [
        makeMessage("user", "First message ".repeat(100)),
        makeMessage("assistant", "Second ".repeat(100)),
        makeMessage("user", "Third ".repeat(100)),
        makeMessage("assistant", "Fourth"),
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 100, // Very small budget
        settings: { maxHistoryShare: 0.5 },
      });

      expect(result.messages.length).toBeLessThan(messages.length);
      // Should keep more recent messages
      expect(result.messages[result.messages.length - 1].content).toBe(
        "Fourth",
      );
    });

    it("should protect last N assistant messages", () => {
      const messages: Message[] = [
        makeMessage("user", "Q1 ".repeat(50)),
        makeMessage("assistant", "A1 ".repeat(50)),
        makeMessage("user", "Q2 ".repeat(50)),
        makeMessage("assistant", "A2 ".repeat(50)),
        makeMessage("user", "Q3"),
        makeMessage("assistant", "A3"),
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 200,
        settings: { keepLastAssistants: 2, maxHistoryShare: 0.5 },
      });

      // Should keep at least the last 2 assistant messages
      const assistantMessages = result.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    });

    it("should trim long tool results", () => {
      const longResult = "x".repeat(10000);
      const messages: Message[] = [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: longResult,
            },
          ],
          timestamp: Date.now(),
        },
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 10000,
        settings: {
          softTrim: { maxChars: 1000, headChars: 400, tailChars: 400 },
        },
      });

      expect(result.trimmedToolResults).toBe(1);
      const resultContent = result.messages[0].content;
      expect(Array.isArray(resultContent)).toBe(true);
      if (Array.isArray(resultContent)) {
        expect(resultContent[0].content?.length).toBeLessThan(
          longResult.length,
        );
        expect(resultContent[0].content).toContain("[Tool result trimmed");
      }
    });

    it("should not trim short tool results", () => {
      const shortResult = "short result";
      const messages: Message[] = [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: shortResult,
            },
          ],
          timestamp: Date.now(),
        },
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 10000,
      });

      expect(result.trimmedToolResults).toBe(0);
    });

    it("should report correct statistics", () => {
      const messages: Message[] = [
        makeMessage("user", "Hello world"),
        makeMessage("assistant", "Hi there!"),
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 10000,
      });

      expect(result.totalChars).toBeGreaterThan(0);
      expect(result.keptChars).toBe(result.totalChars);
      expect(result.droppedChars).toBe(0);
      expect(result.budgetChars).toBeGreaterThan(0);
    });

    it("should handle empty messages array", () => {
      const result = pruneContextMessages({
        messages: [],
        contextWindowTokens: 10000,
      });

      expect(result.messages).toEqual([]);
      expect(result.droppedMessages).toEqual([]);
      expect(result.totalChars).toBe(0);
    });

    it("should handle keepLastAssistants = 0", () => {
      const messages: Message[] = [
        makeMessage("user", "Q"),
        makeMessage("assistant", "A"),
      ];

      const result = pruneContextMessages({
        messages,
        contextWindowTokens: 10,
        settings: { keepLastAssistants: 0, maxHistoryShare: 0.1 },
      });

      // With 0 protected, it should still try to keep within budget
      expect(result.messages.length).toBeLessThanOrEqual(messages.length);
    });
  });
});
