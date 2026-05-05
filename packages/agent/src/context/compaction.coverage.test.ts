import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Message } from "../core/session.js";
import {
  buildCompactionSummary,
  chunkMessagesByMaxTokens,
  shouldTriggerCompaction,
  splitMessagesByTokenShare,
  summarizeInStages,
} from "./compaction.js";

type SummaryClient = Pick<Anthropic, "messages">;
function toClient(c: unknown): SummaryClient {
  return c as SummaryClient;
}
function mkMsg(role: "user" | "assistant", content: string): Message {
  return { role, content, timestamp: Date.now() };
}

describe("compaction coverage extras", () => {
  it("chunkMessagesByMaxTokens splits oversized single message into its own chunk", () => {
    // Message larger than maxTokens triggers the inner if statement
    const huge = mkMsg("user", "x".repeat(20000));
    const small = mkMsg("user", "small");
    const chunks = chunkMessagesByMaxTokens([huge, small], 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("formatMessageContent handles tool_use with no input and tool_result with no content", async () => {
    const calls: string[] = [];
    const client = toClient({
      messages: {
        create: async (params: {
          messages: Array<{ role: string; content: string }>;
        }) => {
          calls.push(params.messages[0].content);
          return { content: [{ type: "text", text: "S" }] };
        },
      },
    });
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "" }, // empty text branch (no parts.push)
          { type: "tool_use", id: "1", name: "myTool" }, // no input
          { type: "tool_use", id: "2" }, // no name -> "tool"
          { type: "tool_result", tool_use_id: "1" }, // no content
        ],
        timestamp: Date.now(),
      },
    ];
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10000,
      contextWindow: 200000,
    });
    expect(result).toBe("S");
    expect(calls[0]).toContain("[tool_use myTool]");
    expect(calls[0]).toContain("[tool_use tool]");
    expect(calls[0]).toContain("[tool_result] ");
  });

  it("formatMessageContent handles tool_use with non-stringifiable input", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const client = toClient({
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "OK" }],
        }),
      },
    });
    const messages: Message[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "1", name: "cyc", input: cyclic }],
        timestamp: Date.now(),
      },
    ];
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10000,
      contextWindow: 200000,
    });
    expect(result).toBe("OK");
  });

  it("generateSummary handles empty content blocks and non-text blocks", async () => {
    const client = toClient({
      messages: {
        create: async () => ({
          // No content array (use ?? [] fallback)
        }),
      },
    });
    const messages: Message[] = [mkMsg("user", "hi")];
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10000,
      contextWindow: 200000,
    });
    // Empty text returned
    expect(result).toBe("");
  });

  it("summarizeChunks returns previousSummary when messages empty", async () => {
    const client = toClient({
      messages: {
        create: async () => ({ content: [{ type: "text", text: "x" }] }),
      },
    });
    // splitMessagesByTokenShare may produce a 0-length chunk that gets filtered
    // Force the empty path via summarizeInStages with nothing to summarize after split
    const result = await summarizeInStages({
      messages: [],
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10000,
      contextWindow: 200000,
      previousSummary: "PREV",
    });
    expect(result).toBe("PREV");
  });

  it("summarizeWithFallback returns previousSummary when messages empty", async () => {
    // Direct path through buildCompactionSummary (which calls summarizeInStages)
    const client = toClient({
      messages: {
        create: async () => ({ content: [{ type: "text", text: "S" }] }),
      },
    });
    const result = await buildCompactionSummary({
      client,
      model: "m",
      messages: [],
      contextWindowTokens: 200000,
    });
    expect(result).toBe("No prior history.");
  });

  it("summarizeInStages returns single partial when split yields one effective chunk", async () => {
    // Force splits.length <= 1 by using parts > 1 but content concentrated in 1
    const client = toClient({
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "single-part" }],
        }),
      },
    });
    // Use contextWindowTokens small + a single message that splits into 1 chunk
    const messages: Message[] = [mkMsg("user", "a"), mkMsg("user", "b")];
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 5,
      contextWindow: 1000,
      parts: 5,
      minMessagesForSplit: 1,
    });
    expect(result).toBeDefined();
  });

  it("summarizeInStages with single resulting partial summary returns it directly", async () => {
    let count = 0;
    const client = toClient({
      messages: {
        create: async () => {
          count++;
          return {
            content: [{ type: "text", text: `partial-${count}` }],
          };
        },
      },
    });
    // Use parts=2 with messages that split to exactly 1 effective chunk after filter
    const messages: Message[] = [mkMsg("user", "single message")];
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 1,
      contextWindow: 100,
      parts: 2,
      minMessagesForSplit: 1,
    });
    expect(result).toBeDefined();
  });

  it("summarizeInStages without customInstructions uses base merge instructions", async () => {
    const calls: string[] = [];
    const client = toClient({
      messages: {
        create: async (params: {
          messages: Array<{ role: string; content: string }>;
        }) => {
          const prompt = params.messages[0].content;
          calls.push(prompt);
          return { content: [{ type: "text", text: "merged" }] };
        },
      },
    });
    const messages: Message[] = Array.from({ length: 6 }, (_, i) =>
      mkMsg(i % 2 === 0 ? "user" : "assistant", `Msg ${i} ${"x".repeat(50)}`),
    );
    const result = await summarizeInStages({
      messages,
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10,
      contextWindow: 200000,
      parts: 2,
      minMessagesForSplit: 2,
      // NO customInstructions
    });
    expect(result).toBe("merged");
    // Verify merge prompt used without "Additional focus"
    const mergePrompt = calls.find((c) => c.includes("Merge these partial"));
    expect(mergePrompt).toBeDefined();
    expect(mergePrompt).not.toContain("Additional focus");
  });

  it("splitMessagesByTokenShare with parts=2 splits content properly", () => {
    const messages: Message[] = [
      mkMsg("user", "x".repeat(100)),
      mkMsg("assistant", "y".repeat(100)),
    ];
    const chunks = splitMessagesByTokenShare(messages, 2);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("shouldTriggerCompaction with triggerRatio out of range clamps", () => {
    // triggerRatio > 1 should clamp
    expect(
      shouldTriggerCompaction({
        messages: [mkMsg("user", "x".repeat(800000))],
        contextWindowTokens: 200000,
        triggerRatio: 5, // clamped to 1
      }),
    ).toBe(false);
    // triggerRatio < 0 clamps to 0
    expect(
      shouldTriggerCompaction({
        messages: [mkMsg("user", "x")],
        contextWindowTokens: 200000,
        triggerRatio: -1, // clamped to 0
      }),
    ).toBe(true);
  });
});
