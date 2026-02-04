import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "../session.js";
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  CHARS_PER_TOKEN_ESTIMATE,
} from "./tokens.js";
import {
  pruneContextMessages,
  type ContextPruningSettings,
  type PruneResult,
} from "./pruning.js";

export const BASE_CHUNK_RATIO = 0.4;
export const MIN_CHUNK_RATIO = 0.15;
export const SAFETY_MARGIN = 1.2;
export const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.75;
export const DEFAULT_SUMMARY_MAX_TOKENS = 900;
const DEFAULT_SUMMARY_FALLBACK = "No prior history.";
const DEFAULT_PARTS = 2;
const MERGE_SUMMARIES_INSTRUCTIONS =
  "Merge these partial summaries into a single cohesive summary. Preserve decisions," +
  " TODOs, open questions, and any constraints.";

const DEFAULT_SUMMARY_INSTRUCTIONS =
  "总结以下对话历史，保留关键决策、TODO、未解决的问题、约束条件。" +
  " 保持简洁但完整，避免无关细节。";

type SummaryClient = Pick<Anthropic, "messages">;

function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

export function computeAdaptiveChunkRatio(messages: Message[], contextWindow: number): number {
  if (messages.length === 0) {
    return BASE_CHUNK_RATIO;
  }
  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }
  return BASE_CHUNK_RATIO;
}

export function splitMessagesByTokenShare(messages: Message[], parts = DEFAULT_PARTS): Message[][] {
  if (messages.length === 0) {
    return [];
  }
  const normalizedParts = normalizeParts(parts, messages.length);
  if (normalizedParts <= 1) {
    return [messages];
  }

  const totalTokens = estimateMessagesTokens(messages);
  const targetTokens = totalTokens / normalizedParts;
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (
      chunks.length < normalizedParts - 1 &&
      current.length > 0 &&
      currentTokens + messageTokens > targetTokens
    ) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function chunkMessagesByMaxTokens(messages: Message[], maxTokens: number): Message[][] {
  if (messages.length === 0) {
    return [];
  }
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (current.length > 0 && currentTokens + messageTokens > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(message);
    currentTokens += messageTokens;

    if (messageTokens > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function isOversizedForSummary(msg: Message, contextWindow: number): boolean {
  const tokens = estimateMessageTokens(msg) * SAFETY_MARGIN;
  return tokens > contextWindow * 0.5;
}

function formatMessageContent(msg: Message): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      if (block.text) parts.push(block.text);
      continue;
    }
    if (block.type === "tool_use") {
      const name = block.name ?? "tool";
      const input = (() => {
        try {
          return block.input ? JSON.stringify(block.input) : "";
        } catch {
          return "";
        }
      })();
      parts.push(`[tool_use ${name}] ${input}`);
      continue;
    }
    if (block.type === "tool_result") {
      parts.push(`[tool_result] ${block.content ?? ""}`);
    }
  }
  return parts.join("\n");
}

function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role;
      const content = formatMessageContent(msg);
      return `${role}: ${content}`;
    })
    .join("\n");
}

async function generateSummary(params: {
  messages: Message[];
  client: SummaryClient;
  model: string;
  maxTokens: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  const baseInstructions = params.customInstructions ?? DEFAULT_SUMMARY_INSTRUCTIONS;
  const previous = params.previousSummary
    ? `已有摘要：\n${params.previousSummary}\n\n`
    : "";
  const transcript = formatMessagesForSummary(params.messages);
  const prompt = `${baseInstructions}\n\n${previous}对话片段：\n${transcript}\n\n输出：`;

  const response = await params.client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    system: "你是一个对话摘要器，输出简洁、准确的总结。",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const blocks = response.content ?? [];
  let text = "";
  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text.trim();
}

async function summarizeChunks(params: {
  messages: Message[];
  client: SummaryClient;
  model: string;
  maxTokens: number;
  maxChunkTokens: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }
  const chunks = chunkMessagesByMaxTokens(params.messages, params.maxChunkTokens);
  let summary = params.previousSummary;
  for (const chunk of chunks) {
    summary = await generateSummary({
      messages: chunk,
      client: params.client,
      model: params.model,
      maxTokens: params.maxTokens,
      customInstructions: params.customInstructions,
      previousSummary: summary,
    });
  }
  return summary ?? DEFAULT_SUMMARY_FALLBACK;
}

async function summarizeWithFallback(params: {
  messages: Message[];
  client: SummaryClient;
  model: string;
  maxTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  try {
    return await summarizeChunks(params);
  } catch {
    // fallback
  }

  const smallMessages: Message[] = [];
  const oversizedNotes: string[] = [];
  for (const msg of params.messages) {
    if (isOversizedForSummary(msg, params.contextWindow)) {
      const tokens = estimateMessageTokens(msg);
      oversizedNotes.push(`[Large ${msg.role} (~${Math.round(tokens / 1000)}K tokens) omitted]`);
    } else {
      smallMessages.push(msg);
    }
  }

  if (smallMessages.length > 0) {
    try {
      const partial = await summarizeChunks({
        ...params,
        messages: smallMessages,
      });
      const notes = oversizedNotes.length > 0 ? `\n\n${oversizedNotes.join("\n")}` : "";
      return partial + notes;
    } catch {
      // fall through
    }
  }

  return `Context contained ${params.messages.length} messages. Summary unavailable due to size limits.`;
}

export async function summarizeInStages(params: {
  messages: Message[];
  client: SummaryClient;
  model: string;
  maxTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
  parts?: number;
  minMessagesForSplit?: number;
}): Promise<string> {
  const { messages } = params;
  if (messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const minMessagesForSplit = Math.max(2, params.minMessagesForSplit ?? 4);
  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, messages.length);
  const totalTokens = estimateMessagesTokens(messages);

  if (parts <= 1 || messages.length < minMessagesForSplit || totalTokens <= params.maxChunkTokens) {
    return summarizeWithFallback(params);
  }

  const splits = splitMessagesByTokenShare(messages, parts).filter((chunk) => chunk.length > 0);
  if (splits.length <= 1) {
    return summarizeWithFallback(params);
  }

  const partialSummaries: string[] = [];
  for (const chunk of splits) {
    partialSummaries.push(
      await summarizeWithFallback({
        ...params,
        messages: chunk,
        previousSummary: undefined,
      }),
    );
  }

  if (partialSummaries.length === 1) {
    return partialSummaries[0];
  }

  const summaryMessages: Message[] = partialSummaries.map((summary) => ({
    role: "user",
    content: summary,
    timestamp: Date.now(),
  }));

  const mergeInstructions = params.customInstructions
    ? `${MERGE_SUMMARIES_INSTRUCTIONS}\n\nAdditional focus:\n${params.customInstructions}`
    : MERGE_SUMMARIES_INSTRUCTIONS;

  return summarizeWithFallback({
    ...params,
    messages: summaryMessages,
    customInstructions: mergeInstructions,
  });
}

export function shouldTriggerCompaction(params: {
  messages: Message[];
  contextWindowTokens: number;
  triggerRatio?: number;
}): boolean {
  const triggerRatio =
    typeof params.triggerRatio === "number" && Number.isFinite(params.triggerRatio)
      ? Math.min(1, Math.max(0, params.triggerRatio))
      : DEFAULT_COMPACTION_TRIGGER_RATIO;
  const totalTokens = estimateMessagesTokens(params.messages);
  return totalTokens > Math.floor(params.contextWindowTokens * triggerRatio);
}

export async function buildCompactionSummary(params: {
  client: SummaryClient;
  model: string;
  messages: Message[];
  contextWindowTokens: number;
  maxTokens?: number;
  customInstructions?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return DEFAULT_SUMMARY_FALLBACK;
  }
  const adaptiveRatio = computeAdaptiveChunkRatio(params.messages, params.contextWindowTokens);
  const maxChunkTokens = Math.max(1, Math.floor(params.contextWindowTokens * adaptiveRatio));
  const maxTokens = Math.max(64, Math.floor(params.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS));

  return summarizeInStages({
    messages: params.messages,
    client: params.client,
    model: params.model,
    maxTokens,
    maxChunkTokens,
    contextWindow: params.contextWindowTokens,
    customInstructions: params.customInstructions,
  });
}

export async function compactHistoryIfNeeded(params: {
  client: SummaryClient;
  model: string;
  messages: Message[];
  contextWindowTokens: number;
  pruningSettings?: Partial<ContextPruningSettings>;
  triggerRatio?: number;
  maxTokens?: number;
}): Promise<{
  summary?: string;
  summaryMessage?: Message;
  pruneResult: PruneResult;
}> {
  const pruneResult = pruneContextMessages({
    messages: params.messages,
    contextWindowTokens: params.contextWindowTokens,
    settings: params.pruningSettings,
  });

  const shouldCompact = shouldTriggerCompaction({
    messages: params.messages,
    contextWindowTokens: params.contextWindowTokens,
    triggerRatio: params.triggerRatio,
  });

  if (!shouldCompact || pruneResult.droppedMessages.length === 0) {
    return { pruneResult };
  }

  const summary = await buildCompactionSummary({
    client: params.client,
    model: params.model,
    messages: pruneResult.droppedMessages,
    contextWindowTokens: params.contextWindowTokens,
    maxTokens: params.maxTokens,
  });

  const summaryMessage: Message = {
    role: "assistant",
    content: `【历史摘要】\n${summary}`,
    timestamp: Date.now(),
  };

  return {
    summary,
    summaryMessage,
    pruneResult,
  };
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;
export const DEFAULT_HISTORY_SHARE = 0.5;
export const DEFAULT_CONTEXT_WINDOW_CHARS =
  DEFAULT_CONTEXT_WINDOW_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
