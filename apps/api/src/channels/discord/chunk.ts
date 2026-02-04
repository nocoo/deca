/**
 * Discord Message Chunking
 *
 * Splits long messages into chunks that fit within Discord's 2000 character limit.
 * Attempts to break at natural boundaries (newlines, spaces) when possible.
 */

import { DISCORD_MAX_MESSAGE_LENGTH } from "./types";

export { DISCORD_MAX_MESSAGE_LENGTH };

/**
 * Split a message into chunks that fit within Discord's character limit.
 *
 * Breaking priority:
 * 1. Newlines (preserves paragraph structure)
 * 2. Spaces (preserves word boundaries)
 * 3. Hard break (last resort for very long words)
 *
 * @param message - The message to chunk
 * @param maxLength - Maximum chunk length (default: 2000)
 * @returns Array of message chunks
 */
export function chunkMessage(
  message: string,
  maxLength: number = DISCORD_MAX_MESSAGE_LENGTH,
): string[] {
  // Handle empty or short messages
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find the best break point within maxLength
    const breakPoint = findBreakPoint(remaining, maxLength);

    // Extract chunk and trim leading whitespace from next chunk
    const chunk = remaining.slice(0, breakPoint);
    chunks.push(chunk);

    // Remove the chunk and trim leading whitespace from remaining
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/**
 * Find the best break point within the given limit.
 *
 * @param text - Text to find break point in
 * @param maxLength - Maximum position for break point
 * @returns Position to break at
 */
function findBreakPoint(text: string, maxLength: number): number {
  // Look for the last newline within limit
  const lastNewline = text.lastIndexOf("\n", maxLength);
  if (lastNewline > 0) {
    return lastNewline + 1; // Include the newline in current chunk
  }

  // Look for the last space within limit
  const lastSpace = text.lastIndexOf(" ", maxLength);
  if (lastSpace > 0) {
    return lastSpace + 1; // Include the space in current chunk
  }

  // No good break point found, hard break at limit
  return maxLength;
}
