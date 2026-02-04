import { describe, expect, it } from "bun:test";
import type { ContentBlock, Message } from "../core/session.js";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  estimateMessageChars,
  estimateMessageTokens,
  estimateMessagesChars,
  estimateMessagesTokens,
} from "./tokens.js";

describe("tokens", () => {
  describe("CHARS_PER_TOKEN_ESTIMATE", () => {
    it("should be 4", () => {
      expect(CHARS_PER_TOKEN_ESTIMATE).toBe(4);
    });
  });

  describe("estimateMessageChars", () => {
    it("should count string content length", () => {
      const message: Message = {
        role: "user",
        content: "hello world",
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(11);
    });

    it("should count text block content", () => {
      const message: Message = {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(5);
    });

    it("should count multiple text blocks", () => {
      const message: Message = {
        role: "assistant",
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: "world" },
        ],
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(10);
    });

    it("should handle tool_use block", () => {
      const message: Message = {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "read",
            input: { file: "test.txt" },
          },
        ],
        timestamp: Date.now(),
      };
      // name length (4) + JSON.stringify input length + 16
      const expectedInput = JSON.stringify({ file: "test.txt" });
      expect(estimateMessageChars(message)).toBe(4 + expectedInput.length + 16);
    });

    it("should handle tool_result block", () => {
      const message: Message = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "file content here",
          },
        ],
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(17);
    });

    it("should handle missing text in text block", () => {
      const message: Message = {
        role: "assistant",
        content: [{ type: "text" } as ContentBlock],
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(0);
    });

    it("should handle missing content in tool_result", () => {
      const message: Message = {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1" } as ContentBlock,
        ],
        timestamp: Date.now(),
      };
      expect(estimateMessageChars(message)).toBe(0);
    });
  });

  describe("estimateMessagesChars", () => {
    it("should sum up all message chars", () => {
      const messages: Message[] = [
        { role: "user", content: "hello", timestamp: Date.now() },
        { role: "assistant", content: "world", timestamp: Date.now() },
      ];
      expect(estimateMessagesChars(messages)).toBe(10);
    });

    it("should return 0 for empty array", () => {
      expect(estimateMessagesChars([])).toBe(0);
    });
  });

  describe("estimateMessageTokens", () => {
    it("should divide chars by CHARS_PER_TOKEN_ESTIMATE and ceil", () => {
      const message: Message = {
        role: "user",
        content: "hello", // 5 chars / 4 = 1.25, ceil = 2
        timestamp: Date.now(),
      };
      expect(estimateMessageTokens(message)).toBe(2);
    });

    it("should return at least 1 token", () => {
      const message: Message = {
        role: "user",
        content: "",
        timestamp: Date.now(),
      };
      expect(estimateMessageTokens(message)).toBe(1);
    });

    it("should handle exact multiples", () => {
      const message: Message = {
        role: "user",
        content: "12345678", // 8 chars / 4 = 2
        timestamp: Date.now(),
      };
      expect(estimateMessageTokens(message)).toBe(2);
    });
  });

  describe("estimateMessagesTokens", () => {
    it("should sum up all message tokens", () => {
      const messages: Message[] = [
        { role: "user", content: "hello", timestamp: Date.now() }, // 2 tokens
        { role: "assistant", content: "world", timestamp: Date.now() }, // 2 tokens
      ];
      expect(estimateMessagesTokens(messages)).toBe(4);
    });

    it("should return 0 for empty array", () => {
      expect(estimateMessagesTokens([])).toBe(0);
    });
  });
});
