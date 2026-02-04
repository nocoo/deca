import { describe, expect, it } from "bun:test";
import type { Message } from "../core/session.js";
import {
  BASE_CHUNK_RATIO,
  DEFAULT_COMPACTION_TRIGGER_RATIO,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  MIN_CHUNK_RATIO,
  buildCompactionSummary,
  chunkMessagesByMaxTokens,
  compactHistoryIfNeeded,
  computeAdaptiveChunkRatio,
  shouldTriggerCompaction,
  splitMessagesByTokenShare,
  summarizeInStages,
} from "./compaction.js";

// Mock Anthropic client for testing
function createMockClient(summaryText = "Test summary") {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text" as const, text: summaryText }],
      }),
    },
  };
}

function createMessage(role: "user" | "assistant", content: string): Message {
  return { role, content, timestamp: Date.now() };
}

describe("compaction", () => {
  describe("computeAdaptiveChunkRatio", () => {
    it("should return base ratio for empty messages", () => {
      expect(computeAdaptiveChunkRatio([], 200000)).toBe(BASE_CHUNK_RATIO);
    });

    it("should return base ratio for small messages", () => {
      const messages: Message[] = [
        createMessage("user", "short"),
        createMessage("assistant", "short"),
      ];

      const ratio = computeAdaptiveChunkRatio(messages, 200000);
      expect(ratio).toBe(BASE_CHUNK_RATIO);
    });

    it("should reduce ratio for large average message size", () => {
      // Create messages with very large content
      // Need avgRatio > 0.1, so avgTokens * 1.2 / contextWindow > 0.1
      // With contextWindow = 200000, avgTokens needs to be > 16666
      // With 4 chars/token, that's ~66666 chars per message average
      const largeContent = "x".repeat(100000); // ~25000 tokens per message
      const messages: Message[] = [
        createMessage("user", largeContent),
        createMessage("assistant", largeContent),
      ];

      const ratio = computeAdaptiveChunkRatio(messages, 200000);
      expect(ratio).toBeLessThan(BASE_CHUNK_RATIO);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
    });
  });

  describe("splitMessagesByTokenShare", () => {
    it("should return empty array for empty messages", () => {
      expect(splitMessagesByTokenShare([])).toEqual([]);
    });

    it("should return single chunk for single message", () => {
      const messages: Message[] = [createMessage("user", "hello")];
      const chunks = splitMessagesByTokenShare(messages);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(messages);
    });

    it("should split messages into parts", () => {
      const messages: Message[] = [
        createMessage("user", "message 1"),
        createMessage("assistant", "message 2"),
        createMessage("user", "message 3"),
        createMessage("assistant", "message 4"),
      ];

      const chunks = splitMessagesByTokenShare(messages, 2);

      expect(chunks.length).toBe(2);
      expect(chunks[0].length + chunks[1].length).toBe(4);
    });

    it("should handle parts=1", () => {
      const messages: Message[] = [
        createMessage("user", "a"),
        createMessage("assistant", "b"),
      ];

      const chunks = splitMessagesByTokenShare(messages, 1);
      expect(chunks.length).toBe(1);
    });

    it("should handle invalid parts", () => {
      const messages: Message[] = [createMessage("user", "a")];

      expect(splitMessagesByTokenShare(messages, 0)).toEqual([messages]);
      expect(splitMessagesByTokenShare(messages, -1)).toEqual([messages]);
    });
  });

  describe("chunkMessagesByMaxTokens", () => {
    it("should return empty array for empty messages", () => {
      expect(chunkMessagesByMaxTokens([], 1000)).toEqual([]);
    });

    it("should put all messages in one chunk if under limit", () => {
      const messages: Message[] = [
        createMessage("user", "short"),
        createMessage("assistant", "short"),
      ];

      const chunks = chunkMessagesByMaxTokens(messages, 10000);
      expect(chunks.length).toBe(1);
    });

    it("should split when exceeding max tokens", () => {
      const longContent = "x".repeat(1000);
      const messages: Message[] = [
        createMessage("user", longContent),
        createMessage("assistant", longContent),
        createMessage("user", longContent),
      ];

      const chunks = chunkMessagesByMaxTokens(messages, 500);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should handle oversized single message", () => {
      const hugeContent = "x".repeat(5000);
      const messages: Message[] = [createMessage("user", hugeContent)];

      const chunks = chunkMessagesByMaxTokens(messages, 100);
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(1);
    });
  });

  describe("shouldTriggerCompaction", () => {
    it("should return false for empty messages", () => {
      expect(
        shouldTriggerCompaction({
          messages: [],
          contextWindowTokens: 200000,
        }),
      ).toBe(false);
    });

    it("should return false when under trigger ratio", () => {
      const messages: Message[] = [createMessage("user", "short message")];

      expect(
        shouldTriggerCompaction({
          messages,
          contextWindowTokens: 200000,
        }),
      ).toBe(false);
    });

    it("should return true when over trigger ratio", () => {
      // Create enough content to exceed 75% of context window
      // 75% of 200000 = 150000 tokens = 600000 chars
      const hugeContent = "x".repeat(700000); // ~175K tokens
      const messages: Message[] = [createMessage("user", hugeContent)];

      expect(
        shouldTriggerCompaction({
          messages,
          contextWindowTokens: 200000,
        }),
      ).toBe(true);
    });

    it("should use custom trigger ratio", () => {
      const content = "x".repeat(100000); // ~25K tokens
      const messages: Message[] = [createMessage("user", content)];

      // With 0.1 trigger ratio, should trigger
      expect(
        shouldTriggerCompaction({
          messages,
          contextWindowTokens: 200000,
          triggerRatio: 0.1,
        }),
      ).toBe(true);
    });

    it("should handle invalid trigger ratio", () => {
      const messages: Message[] = [createMessage("user", "test")];

      // Should use default ratio for invalid values
      expect(
        shouldTriggerCompaction({
          messages,
          contextWindowTokens: 200000,
          triggerRatio: Number.NaN,
        }),
      ).toBe(false);
    });
  });

  describe("summarizeInStages", () => {
    it("should return fallback for empty messages", async () => {
      const result = await summarizeInStages({
        messages: [],
        client: createMockClient(),
        model: "claude-3-haiku-20240307",
        maxTokens: 500,
        maxChunkTokens: 10000,
        contextWindow: 200000,
      });

      expect(result).toBe("No prior history.");
    });

    it("should return previous summary when provided and no messages", async () => {
      const result = await summarizeInStages({
        messages: [],
        client: createMockClient(),
        model: "claude-3-haiku-20240307",
        maxTokens: 500,
        maxChunkTokens: 10000,
        contextWindow: 200000,
        previousSummary: "Previous context summary",
      });

      expect(result).toBe("Previous context summary");
    });

    it("should generate summary for messages", async () => {
      const messages: Message[] = [
        createMessage("user", "Hello"),
        createMessage("assistant", "Hi there!"),
      ];

      const result = await summarizeInStages({
        messages,
        client: createMockClient("Generated summary"),
        model: "claude-3-haiku-20240307",
        maxTokens: 500,
        maxChunkTokens: 10000,
        contextWindow: 200000,
      });

      expect(result).toBe("Generated summary");
    });

    it("should handle multi-part summarization", async () => {
      const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
        createMessage(i % 2 === 0 ? "user" : "assistant", `Message ${i}`),
      );

      const result = await summarizeInStages({
        messages,
        client: createMockClient("Merged summary"),
        model: "claude-3-haiku-20240307",
        maxTokens: 500,
        maxChunkTokens: 100,
        contextWindow: 200000,
        parts: 3,
      });

      expect(result).toBeDefined();
    });
  });

  describe("buildCompactionSummary", () => {
    it("should return fallback for empty messages", async () => {
      const result = await buildCompactionSummary({
        client: createMockClient(),
        model: "claude-3-haiku-20240307",
        messages: [],
        contextWindowTokens: 200000,
      });

      expect(result).toBe("No prior history.");
    });

    it("should build summary for messages", async () => {
      const messages: Message[] = [
        createMessage("user", "Test message"),
        createMessage("assistant", "Test response"),
      ];

      const result = await buildCompactionSummary({
        client: createMockClient("Compaction summary"),
        model: "claude-3-haiku-20240307",
        messages,
        contextWindowTokens: 200000,
      });

      expect(result).toBe("Compaction summary");
    });
  });

  describe("compactHistoryIfNeeded", () => {
    it("should not compact when under threshold", async () => {
      const messages: Message[] = [createMessage("user", "Short message")];

      const result = await compactHistoryIfNeeded({
        client: createMockClient(),
        model: "claude-3-haiku-20240307",
        messages,
        contextWindowTokens: 200000,
      });

      expect(result.summary).toBeUndefined();
      expect(result.summaryMessage).toBeUndefined();
      expect(result.pruneResult).toBeDefined();
    });

    it("should compact when over threshold", async () => {
      // Create enough messages to trigger compaction
      const hugeContent = "x".repeat(600000);
      const messages: Message[] = [
        createMessage("user", hugeContent),
        createMessage("assistant", "response"),
      ];

      const result = await compactHistoryIfNeeded({
        client: createMockClient("Compacted summary"),
        model: "claude-3-haiku-20240307",
        messages,
        contextWindowTokens: 200000,
        triggerRatio: 0.1, // Low threshold to ensure triggering
      });

      // If pruning drops messages and compaction triggers
      if (result.pruneResult.droppedMessages.length > 0) {
        expect(result.summary).toBeDefined();
        expect(result.summaryMessage).toBeDefined();
        expect(result.summaryMessage?.content).toContain("历史摘要");
      }
    });
  });

  describe("constants", () => {
    it("should export expected constants", () => {
      expect(BASE_CHUNK_RATIO).toBe(0.4);
      expect(MIN_CHUNK_RATIO).toBe(0.15);
      expect(DEFAULT_COMPACTION_TRIGGER_RATIO).toBe(0.75);
      expect(DEFAULT_CONTEXT_WINDOW_TOKENS).toBe(200000);
    });
  });
});
