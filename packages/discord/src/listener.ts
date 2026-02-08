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
import { type DebounceManager, createDebounceManager } from "./debounce";
import {
  type GracefulShutdown,
  createGracefulShutdown,
} from "./graceful-shutdown";
import { markError, markReceived, markSuccess } from "./reaction";
import { ReplyQueue } from "./reply-queue";
import { sendReply, showTyping } from "./sender";
import { resolveDiscordSessionKey } from "./session";
import type {
  AllowlistConfig,
  ChannelType,
  MessageHandler,
  MessageRequest,
  ReplyMeta,
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

  /** Debounce configuration */
  debounce?: {
    /** Enable debounce (default: false) */
    enabled: boolean;
    /** Debounce window in milliseconds (default: 3000) */
    windowMs?: number;
  };

  /** Debug mode - show session ID and timing info before processing (default: true) */
  debugMode?: boolean;

  /** Main channel ID - messages in this channel route to user session for debugging */
  mainChannelId?: string;

  /** User ID for unified session - used when routing mainChannel to user session */
  mainUserId?: string;
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

  // Create debounce manager if enabled
  let debounce: DebounceManager | null = null;
  if (config.debounce?.enabled) {
    debounce = createDebounceManager(
      async (firstMessage, combinedContent, allMessages) => {
        await shutdown.wrapTask(async () => {
          await processDebouncedMessage(
            firstMessage,
            combinedContent,
            allMessages,
            botUserId,
            config,
          );
        });
      },
      { windowMs: config.debounce.windowMs ?? 3000 },
    );
  }

  const onMessage = async (message: Message) => {
    if (!shouldProcessMessage(message, botUserId, config)) {
      return;
    }

    // If debounce is enabled, queue the message
    if (debounce) {
      debounce.add(message);
      return;
    }

    // Otherwise, process immediately
    await shutdown.wrapTask(async () => {
      await processMessage(message, botUserId, config);
    });
  };

  client.on(Events.MessageCreate, onMessage);

  // Create cleanup function with shutdown support
  const cleanup = (() => {
    client.off(Events.MessageCreate, onMessage);
    debounce?.clear();
    shutdown.reset();
  }) as ListenerCleanup;

  cleanup.shutdown = async () => {
    // Stop accepting new messages
    client.off(Events.MessageCreate, onMessage);
    // Clear pending debounces (they won't be processed)
    debounce?.clear();
    // Wait for pending messages
    await shutdown.initiateShutdown();
  };

  Object.defineProperty(cleanup, "pendingCount", {
    get: () => shutdown.pendingCount + (debounce?.pendingCount ?? 0),
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
  const request = buildMessageRequest(
    message,
    content,
    config.agentId,
    config.mainChannelId,
    config.mainUserId,
  );

  await executeHandler(message, request, botUserId, config);
}

/**
 * Process debounced messages (multiple merged into one).
 *
 * @param firstMessage - First message in the group (for reactions/replies)
 * @param combinedContent - Merged content from all messages
 * @param allMessages - All messages in the group
 * @param botUserId - Bot's user ID
 * @param config - Listener configuration
 */
async function processDebouncedMessage(
  firstMessage: Message,
  combinedContent: string,
  allMessages: Message[],
  botUserId: string,
  config: ListenerConfig,
): Promise<void> {
  // Mark first message as received
  await markReceived(firstMessage);

  // Show typing indicator
  await showTyping(firstMessage.channel);

  // Clean combined content
  const content = extractContent(combinedContent, botUserId);

  // Skip empty messages
  if (!content) {
    return;
  }

  // Build request using first message for context
  const request = buildMessageRequest(
    firstMessage,
    content,
    config.agentId,
    config.mainChannelId,
    config.mainUserId,
  );

  await executeHandler(firstMessage, request, botUserId, config);
}

/**
 * Execute handler and manage response/reactions.
 */
async function executeHandler(
  message: Message,
  request: MessageRequest,
  botUserId: string,
  config: ListenerConfig,
): Promise<void> {
  const startTime = Date.now();
  const replyQueue = new ReplyQueue();

  const onReply = async (text: string, meta: ReplyMeta): Promise<void> => {
    await replyQueue.enqueue(message, text, meta);
  };

  try {
    if (config.debugMode !== false) {
      const debugInfo = formatDebugMessage(request.sessionKey, startTime);
      await onReply(debugInfo, { kind: "ack" });
    }

    const requestWithCallbacks: MessageRequest = {
      ...request,
      callbacks: {
        ...request.callbacks,
        onReply,
      },
    };

    const response = await config.handler.handle(requestWithCallbacks);

    await replyQueue.finish();

    if (response.success && response.text) {
      await sendReply(message, response.text);
      await markSuccess(message, botUserId);
    } else if (!response.success) {
      const errorMsg = response.error || "An error occurred";
      await sendReply(message, `⚠️ ${errorMsg}`);
      await markError(message, botUserId);
    }
  } catch (error) {
    replyQueue.reset();
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
 * Format debug message with session info.
 */
function formatDebugMessage(sessionKey: string, startTime: number): string {
  const timestamp = new Date(startTime).toISOString();
  // Use short session key (last 8 chars) for readability
  const shortSession =
    sessionKey.length > 20 ? `...${sessionKey.slice(-12)}` : sessionKey;

  return `\`\`\`\n⏳ Processing...\nSession: ${shortSession}\nTime: ${timestamp}\n\`\`\``;
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
  mainChannelId?: string,
  mainUserId?: string,
): MessageRequest {
  const channelType = resolveChannelType(message);

  // Check if this is the main channel - route to user session (DM-style)
  const isMainChannel = mainChannelId && message.channel.id === mainChannelId;

  // Use configured mainUserId if available, otherwise fall back to message author
  const effectiveUserId =
    isMainChannel && mainUserId ? mainUserId : message.author.id;

  const sessionKey = isMainChannel
    ? `agent:${agentId ?? "deca"}:user:${effectiveUserId}`
    : resolveDiscordSessionKey({
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
