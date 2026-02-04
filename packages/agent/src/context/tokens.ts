import type { ContentBlock, Message } from "../session.js";

export const CHARS_PER_TOKEN_ESTIMATE = 4;

function estimateBlockChars(block: ContentBlock): number {
  if (block.type === "text") {
    return block.text?.length ?? 0;
  }
  if (block.type === "tool_use") {
    const base = block.name?.length ?? 0;
    try {
      const input = block.input ? JSON.stringify(block.input) : "";
      return base + input.length + 16;
    } catch {
      return base + 128;
    }
  }
  if (block.type === "tool_result") {
    return block.content?.length ?? 0;
  }
  return 0;
}

export function estimateMessageChars(message: Message): number {
  if (typeof message.content === "string") {
    return message.content.length;
  }
  let total = 0;
  for (const block of message.content) {
    total += estimateBlockChars(block);
  }
  return total;
}

export function estimateMessagesChars(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageChars(msg), 0);
}

export function estimateMessageTokens(message: Message): number {
  const chars = estimateMessageChars(message);
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE));
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}
