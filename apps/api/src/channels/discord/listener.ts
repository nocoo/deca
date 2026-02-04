/**
 * Discord Message Listener
 *
 * Handles incoming Discord messages, filtering, and routing to handler.
 */

import {
  type Client,
  ChannelType as DJSChannelType,
  Events,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { isAllowed } from "./allowlist";
import {
  type GracefulShutdown,
  createGracefulShutdown,
} from "./graceful-shutdown";
import { markError, markReceived, markSuccess } from "./reaction";
import { sendReply, showTyping } from "./sender";
import { resolveDiscordSessionKey } from "./session";
import type {
  AllowlistConfig,
  ChannelType,
  MessageHandler,
  MessageRequest,
} from "./types";

/**
 * Configuration for message listener
 */
export interface ListenerConfig {
  /** Message handler */
  handler: MessageHandler;

  /** Allowlist configuration */
  allowlist?: AllowlistConfig;

  /** Require bot mention to respond (global default) */
  requireMention?: boolean;

  /** Override require mention per guild */
  requireMentionByGuild?: Record<string, boolean>;

  /** Override require mention per channel */
  requireMentionByChannel?: Record<string, boolean>;

  /** Agent ID for session keys */
  agentId?: string;

  /** Ignore bot messages (default: true) */
  ignoreBots?: boolean;

  /** Graceful shutdown timeout in milliseconds (default: 30000) */
  shutdownTimeoutMs?: number;
}

/**
 * Listener cleanup interface with graceful shutdown
 */
export interface ListenerCleanup {
  /** Remove listener immediately */
  (): void;
  /** Graceful shutdown - wait for pending messages */
  shutdown(): Promise<void>;
  /** Number of messages currently being processed */
  readonly pendingCount: number;
}

/**
 * Create a message listener for a Discord client.
 *
 * @param client - Discord client
 * @param config - Listener configuration
 * @returns Cleanup function with graceful shutdown support
 */
export function createMessageListener(
  client: Client,
  config: ListenerConfig,
): ListenerCleanup {
  const botUserId = client.user?.id ?? "";

  // Create graceful shutdown manager
  const shutdown = createGracefulShutdown({
    timeoutMs: config.shutdownTimeoutMs ?? 30000,
  });

  const onMessage = async (message: Message) => {
    if (!shouldProcessMessage(message, botUserId, config)) {
      return;
    }

    // Wrap message processing with graceful shutdown tracking
    await shutdown.wrapTask(async () => {
      await processMessage(message, botUserId, config);
    });
  };

  client.on(Events.MessageCreate, onMessage);

  // Create cleanup function with shutdown support
  const cleanup = (() => {
    client.off(Events.MessageCreate, onMessage);
    shutdown.reset();
  }) as ListenerCleanup;

  cleanup.shutdown = async () => {
    // Stop accepting new messages
    client.off(Events.MessageCreate, onMessage);
    // Wait for pending messages
    await shutdown.initiateShutdown();
  };

  Object.defineProperty(cleanup, "pendingCount", {
    get: () => shutdown.pendingCount,
  });

  return cleanup;
}

/**
 * Check if a message should be processed.
 *
 * @param message - Discord message
 * @param botUserId - Bot's user ID
 * @param config - Listener configuration
 * @returns true if message should be processed
 */
export function shouldProcessMessage(
  message: Message,
  botUserId: string,
  config: ListenerConfig,
): boolean {
  // Ignore own messages
  if (message.author.id === botUserId) {
    return false;
  }

  // Ignore bot messages (default: true)
  const ignoreBots = config.ignoreBots ?? true;
  if (ignoreBots && message.author.bot) {
    return false;
  }

  // Check allowlist
  if (
    !isAllowed(
      {
        userId: message.author.id,
        guildId: message.guild?.id,
        channelId: message.channel.id,
        parentChannelId: getParentChannelId(message),
      },
      config.allowlist,
    )
  ) {
    return false;
  }

  // Check mention requirement
  if (isMentionRequired(message, config)) {
    if (!isBotMentioned(message, botUserId)) {
      return false;
    }
  }

  return true;
}

/**
 * Process a message and send response.
 *
 * @param message - Discord message
 * @param botUserId - Bot's user ID
 * @param config - Listener configuration
 */
export async function processMessage(
  message: Message,
  botUserId: string,
  config: ListenerConfig,
): Promise<void> {
  // Mark message as received
  await markReceived(message);

  // Show typing indicator
  await showTyping(message.channel);

  // Extract and clean content
  const content = extractContent(message.content, botUserId);

  // Skip empty messages
  if (!content) {
    return;
  }

  // Build request
  const request = buildMessageRequest(message, content, config.agentId);

  try {
    // Call handler
    const response = await config.handler.handle(request);

    // Send response
    if (response.success && response.text) {
      await sendReply(message, response.text);
      await markSuccess(message, botUserId);
    } else if (!response.success) {
      const errorMsg = response.error || "An error occurred";
      await sendReply(message, `⚠️ ${errorMsg}`);
      await markError(message, botUserId);
    }
  } catch (error) {
    // Handle exceptions
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    try {
      await sendReply(message, `⚠️ An error occurred: ${errorMsg}`);
    } catch {
      // Ignore reply errors
    }
    await markError(message, botUserId);
  }
}

/**
 * Extract and clean message content.
 *
 * @param content - Raw message content
 * @param botUserId - Bot's user ID
 * @returns Cleaned content
 */
export function extractContent(content: string, botUserId: string): string {
  // Remove bot mentions
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  return content.replace(mentionPattern, "").trim();
}

/**
 * Build a MessageRequest from a Discord message.
 */
function buildMessageRequest(
  message: Message,
  content: string,
  agentId?: string,
): MessageRequest {
  const channelType = resolveChannelType(message);
  const sessionKey = resolveDiscordSessionKey({
    type: channelType,
    userId: message.author.id,
    agentId,
    guildId: message.guild?.id,
    channelId: message.channel.id,
    threadId: isThread(message) ? message.channel.id : undefined,
  });

  return {
    sessionKey,
    content,
    sender: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
    },
    channel: {
      id: message.channel.id,
      name: getChannelName(message),
      type: channelType,
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      threadId: isThread(message) ? message.channel.id : undefined,
    },
  };
}

/**
 * Resolve the channel type from a message.
 */
function resolveChannelType(message: Message): ChannelType {
  if (!message.guild) {
    return "dm";
  }

  if (isThread(message)) {
    return "thread";
  }

  return "guild";
}

/**
 * Check if message is in a thread.
 */
function isThread(message: Message): boolean {
  return (
    message.channel.type === DJSChannelType.PublicThread ||
    message.channel.type === DJSChannelType.PrivateThread
  );
}

/**
 * Get parent channel ID for threads.
 */
function getParentChannelId(message: Message): string | undefined {
  if (isThread(message)) {
    return (message.channel as ThreadChannel).parentId ?? undefined;
  }
  return undefined;
}

/**
 * Get channel name.
 */
function getChannelName(message: Message): string | undefined {
  if ("name" in message.channel) {
    return message.channel.name ?? undefined;
  }
  return undefined;
}

/**
 * Check if mention is required for this message.
 */
function isMentionRequired(message: Message, config: ListenerConfig): boolean {
  // Check channel-specific override first
  if (config.requireMentionByChannel?.[message.channel.id] !== undefined) {
    return config.requireMentionByChannel[message.channel.id];
  }

  // Check guild-specific override
  if (
    message.guild &&
    config.requireMentionByGuild?.[message.guild.id] !== undefined
  ) {
    return config.requireMentionByGuild[message.guild.id];
  }

  // Fall back to global setting
  return config.requireMention ?? false;
}

/**
 * Check if bot is mentioned in message.
 */
function isBotMentioned(message: Message, botUserId: string): boolean {
  // Check if bot user is in mentions
  return message.mentions.users.has(botUserId);
}
