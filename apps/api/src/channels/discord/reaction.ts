/**
 * Discord Reaction Management
 *
 * Adds reaction confirmations to messages to show processing status.
 */

import type { Message } from "discord.js";

/** Reaction emojis for different states */
export const REACTIONS = {
  /** Message received, processing */
  RECEIVED: "👀",
  /** Processing completed successfully */
  SUCCESS: "✅",
  /** Processing failed */
  ERROR: "❌",
} as const;

export type ReactionType = keyof typeof REACTIONS;

/**
 * Add a reaction to a message.
 * Fails silently if reaction cannot be added.
 *
 * @param message - Discord message
 * @param type - Reaction type
 */
export async function addReaction(
  message: Message,
  type: ReactionType,
): Promise<void> {
  try {
    await message.react(REACTIONS[type]);
  } catch {
    // Ignore reaction errors - non-critical
  }
}

/**
 * Remove a reaction from a message.
 * Fails silently if reaction cannot be removed.
 *
 * @param message - Discord message
 * @param type - Reaction type
 * @param botUserId - Bot's user ID (to remove only bot's reaction)
 */
export async function removeReaction(
  message: Message,
  type: ReactionType,
  botUserId: string,
): Promise<void> {
  try {
    const reaction = message.reactions.cache.get(REACTIONS[type]);
    if (reaction) {
      await reaction.users.remove(botUserId);
    }
  } catch {
    // Ignore reaction errors - non-critical
  }
}

/**
 * Mark message as received (add 👀).
 *
 * @param message - Discord message
 */
export async function markReceived(message: Message): Promise<void> {
  await addReaction(message, "RECEIVED");
}

/**
 * Mark message as completed (remove 👀, add ✅).
 *
 * @param message - Discord message
 * @param botUserId - Bot's user ID
 */
export async function markSuccess(
  message: Message,
  botUserId: string,
): Promise<void> {
  await removeReaction(message, "RECEIVED", botUserId);
  await addReaction(message, "SUCCESS");
}

/**
 * Mark message as failed (remove 👀, add ❌).
 *
 * @param message - Discord message
 * @param botUserId - Bot's user ID
 */
export async function markError(
  message: Message,
  botUserId: string,
): Promise<void> {
  await removeReaction(message, "RECEIVED", botUserId);
  await addReaction(message, "ERROR");
}
