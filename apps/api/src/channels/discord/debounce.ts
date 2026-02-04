/**
 * Message Debounce
 *
 * Merges rapid consecutive messages from the same user in the same channel.
 * This prevents multiple handler calls when users send messages in quick succession.
 */

import type { Message } from "discord.js";

/**
 * Debounce configuration
 */
export interface DebounceConfig {
  /** Debounce window in milliseconds (default: 3000) */
  windowMs?: number;
}

/**
 * Pending message group
 */
interface PendingGroup {
  /** First message in the group (used for reactions/replies) */
  firstMessage: Message;
  /** All messages in the group */
  messages: Message[];
  /** Combined content */
  content: string;
  /** Timer handle */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Debounce key for grouping messages
 */
function getDebounceKey(message: Message): string {
  const channelId = message.channel.id;
  const userId = message.author.id;
  return `${channelId}:${userId}`;
}

/**
 * Message handler callback for debounced messages
 */
export type DebouncedHandler = (
  firstMessage: Message,
  combinedContent: string,
  allMessages: Message[],
) => Promise<void>;

/**
 * Debounce manager interface
 */
export interface DebounceManager {
  /** Add a message to debounce. Returns true if message was queued, false if should process immediately. */
  add(message: Message): boolean;
  /** Cancel all pending debounces */
  clear(): void;
  /** Number of pending groups */
  readonly pendingCount: number;
}

/**
 * Create a debounce manager for messages.
 *
 * @param handler - Called when debounce window expires with merged messages
 * @param config - Debounce configuration
 * @returns Debounce manager
 */
export function createDebounceManager(
  handler: DebouncedHandler,
  config: DebounceConfig = {},
): DebounceManager {
  const windowMs = config.windowMs ?? 3000;
  const pending = new Map<string, PendingGroup>();

  function add(message: Message): boolean {
    const key = getDebounceKey(message);
    const existing = pending.get(key);

    if (existing) {
      // Add to existing group
      existing.messages.push(message);
      existing.content = `${existing.content}\n${message.content}`;

      // Reset the timer
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => flush(key), windowMs);

      return true; // Message was queued
    }

    // Create new group
    const group: PendingGroup = {
      firstMessage: message,
      messages: [message],
      content: message.content,
      timer: setTimeout(() => flush(key), windowMs),
    };
    pending.set(key, group);

    return true; // Message was queued
  }

  async function flush(key: string): Promise<void> {
    const group = pending.get(key);
    if (!group) return;

    pending.delete(key);

    try {
      await handler(group.firstMessage, group.content, group.messages);
    } catch {
      // Handler errors are handled by the handler itself
    }
  }

  function clear(): void {
    for (const group of pending.values()) {
      clearTimeout(group.timer);
    }
    pending.clear();
  }

  return {
    add,
    clear,
    get pendingCount() {
      return pending.size;
    },
  };
}

/**
 * Default debounce window in milliseconds
 */
export const DEFAULT_DEBOUNCE_WINDOW_MS = 3000;
