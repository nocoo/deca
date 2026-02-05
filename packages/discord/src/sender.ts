/**
 * Discord Message Sender
 *
 * Handles sending messages to Discord, including chunking long messages.
 */

import type { Message, TextBasedChannel } from "discord.js";
import { chunkMessage } from "./chunk";

/**
 * Send a reply to a message, chunking if necessary.
 *
 * The first chunk is sent as a reply to maintain conversation context.
 * Subsequent chunks are sent as regular messages to the channel.
 *
 * @param message - Original message to reply to
 * @param content - Reply content
 * @returns Array of sent messages
 */
export async function sendReply(
  message: Message,
  content: string,
): Promise<Message[]> {
  const chunks = chunkMessage(content);
  const sentMessages: Message[] = [];

  // Send first chunk as reply
  if (chunks.length > 0) {
    const reply = await message.reply(chunks[0]);
    sentMessages.push(reply);
  }

  // Send remaining chunks to channel
  for (let i = 1; i < chunks.length; i++) {
    const sent = await message.channel.send(chunks[i]);
    sentMessages.push(sent);
  }

  return sentMessages;
}

/**
 * Send a message to a channel, chunking if necessary.
 *
 * @param channel - Target channel
 * @param content - Message content
 * @returns Array of sent messages
 */
export async function sendToChannel(
  channel: TextBasedChannel,
  content: string,
): Promise<Message[]> {
  const chunks = chunkMessage(content);
  const sentMessages: Message[] = [];

  for (const chunk of chunks) {
    const sent = await channel.send(chunk);
    sentMessages.push(sent);
  }

  return sentMessages;
}

/**
 * Show typing indicator in a channel.
 * Errors are silently ignored as typing indicators are non-critical.
 *
 * @param channel - Target channel
 */
export async function showTyping(channel: TextBasedChannel): Promise<void> {
  try {
    await channel.sendTyping();
  } catch {
    // Ignore typing indicator errors - they're non-critical
  }
}
