import type { ContentBlock, Message } from "../core/session.js";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  estimateMessageChars,
  estimateMessagesChars,
} from "./tokens.js";

export type ContextPruningSettings = {
  maxHistoryShare: number;
  keepLastAssistants: number;
  softTrim: {
    maxChars: number;
    headChars: number;
    tailChars: number;
  };
};

export const DEFAULT_CONTEXT_PRUNING_SETTINGS: ContextPruningSettings = {
  maxHistoryShare: 0.5,
  keepLastAssistants: 3,
  softTrim: {
    maxChars: 4_000,
    headChars: 1_500,
    tailChars: 1_500,
  },
};

export type PruneResult = {
  messages: Message[];
  droppedMessages: Message[];
  trimmedToolResults: number;
  totalChars: number;
  keptChars: number;
  droppedChars: number;
  budgetChars: number;
};

function clampShare(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function resolvePruningSettings(
  raw?: Partial<ContextPruningSettings>,
): ContextPruningSettings {
  if (!raw) {
    return DEFAULT_CONTEXT_PRUNING_SETTINGS;
  }
  const settings: ContextPruningSettings = {
    maxHistoryShare: clampShare(
      raw.maxHistoryShare ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.maxHistoryShare,
      DEFAULT_CONTEXT_PRUNING_SETTINGS.maxHistoryShare,
    ),
    keepLastAssistants:
      typeof raw.keepLastAssistants === "number" &&
      Number.isFinite(raw.keepLastAssistants)
        ? Math.max(0, Math.floor(raw.keepLastAssistants))
        : DEFAULT_CONTEXT_PRUNING_SETTINGS.keepLastAssistants,
    softTrim: {
      maxChars:
        typeof raw.softTrim?.maxChars === "number" &&
        Number.isFinite(raw.softTrim.maxChars)
          ? Math.max(0, Math.floor(raw.softTrim.maxChars))
          : DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.maxChars,
      headChars:
        typeof raw.softTrim?.headChars === "number" &&
        Number.isFinite(raw.softTrim.headChars)
          ? Math.max(0, Math.floor(raw.softTrim.headChars))
          : DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.headChars,
      tailChars:
        typeof raw.softTrim?.tailChars === "number" &&
        Number.isFinite(raw.softTrim.tailChars)
          ? Math.max(0, Math.floor(raw.softTrim.tailChars))
          : DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.tailChars,
    },
  };
  return settings;
}

function cloneMessage(message: Message, content: Message["content"]): Message {
  return { ...message, content };
}

function softTrimToolResultBlock(
  block: ContentBlock,
  settings: ContextPruningSettings["softTrim"],
): { block: ContentBlock; trimmed: boolean } {
  if (block.type !== "tool_result") {
    return { block, trimmed: false };
  }
  const raw = typeof block.content === "string" ? block.content : "";
  const rawLen = raw.length;
  if (rawLen <= settings.maxChars) {
    return { block, trimmed: false };
  }
  const headChars = Math.max(0, settings.headChars);
  const tailChars = Math.max(0, settings.tailChars);
  if (headChars + tailChars >= rawLen) {
    return { block, trimmed: false };
  }
  const head = raw.slice(0, headChars);
  const tail = raw.slice(rawLen - tailChars);
  const trimmedText = `${head}\n...\n${tail}\n\n[Tool result trimmed: kept first ${headChars} chars and last ${tailChars} chars of ${rawLen} chars.]`;
  return {
    block: { ...block, content: trimmedText },
    trimmed: true,
  };
}

function applySoftTrim(
  messages: Message[],
  settings: ContextPruningSettings,
): { messages: Message[]; trimmedToolResults: number } {
  let trimmedToolResults = 0;
  const output: Message[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      output.push(msg);
      continue;
    }

    let didChange = false;
    const nextBlocks: ContentBlock[] = [];
    for (const block of msg.content) {
      const result = softTrimToolResultBlock(block, settings.softTrim);
      if (result.trimmed) {
        trimmedToolResults += 1;
        didChange = true;
      }
      nextBlocks.push(result.block);
    }

    if (didChange) {
      output.push(cloneMessage(msg, nextBlocks));
    } else {
      output.push(msg);
    }
  }

  return { messages: output, trimmedToolResults };
}

function findAssistantCutoffIndex(
  messages: Message[],
  keepLastAssistants: number,
): number | null {
  if (keepLastAssistants <= 0) {
    return messages.length;
  }
  let remaining = keepLastAssistants;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "assistant") {
      continue;
    }
    remaining -= 1;
    if (remaining === 0) {
      return i;
    }
  }
  return null;
}

function sliceWithinBudget(
  messages: Message[],
  budgetChars: number,
): Message[] {
  const kept: Message[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const chars = estimateMessageChars(msg);
    if (used + chars > budgetChars && kept.length > 0) {
      break;
    }
    kept.push(msg);
    used += chars;
  }
  kept.reverse();
  return kept;
}

export function pruneContextMessages(params: {
  messages: Message[];
  contextWindowTokens: number;
  settings?: Partial<ContextPruningSettings>;
}): PruneResult {
  const settings = resolvePruningSettings(params.settings);
  const contextTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const budgetChars = Math.max(
    1,
    Math.floor(
      contextTokens * CHARS_PER_TOKEN_ESTIMATE * settings.maxHistoryShare,
    ),
  );

  const trimmed = applySoftTrim(params.messages, settings);
  const totalChars = estimateMessagesChars(trimmed.messages);

  if (totalChars <= budgetChars) {
    return {
      messages: trimmed.messages,
      droppedMessages: [],
      trimmedToolResults: trimmed.trimmedToolResults,
      totalChars,
      keptChars: totalChars,
      droppedChars: 0,
      budgetChars,
    };
  }

  const cutoffIndex = findAssistantCutoffIndex(
    trimmed.messages,
    settings.keepLastAssistants,
  );
  const protectedIndex = cutoffIndex ?? 0;
  const protectedMessages = trimmed.messages.slice(protectedIndex);
  const protectedChars = estimateMessagesChars(protectedMessages);

  let kept: Message[] = [];
  if (protectedChars > budgetChars) {
    kept = sliceWithinBudget(trimmed.messages, budgetChars);
  } else {
    kept = [...protectedMessages];
    let remaining = budgetChars - protectedChars;
    for (let i = protectedIndex - 1; i >= 0; i--) {
      const msg = trimmed.messages[i];
      const msgChars = estimateMessageChars(msg);
      if (msgChars > remaining) {
        break;
      }
      kept.unshift(msg);
      remaining -= msgChars;
    }
  }

  const keptSet = new Set(kept);
  const droppedMessages = trimmed.messages.filter((msg) => !keptSet.has(msg));
  const keptChars = estimateMessagesChars(kept);
  const droppedChars = Math.max(0, totalChars - keptChars);

  return {
    messages: kept,
    droppedMessages,
    trimmedToolResults: trimmed.trimmedToolResults,
    totalChars,
    keptChars,
    droppedChars,
    budgetChars,
  };
}
