/**
 * Discord Channel Module
 *
 * This module provides Discord gateway integration for the Deca platform.
 * It is intentionally decoupled from @deca/agent through the MessageHandler interface.
 */

// Types and interfaces
export type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
  ChannelType,
  DiscordGatewayConfig,
  DiscordGatewayConfigWithDeps,
  AllowlistConfig,
  DiscordSessionInfo,
  MessageContext,
  DiscordGateway,
  DiscordUser,
  DiscordGuild,
  ReconnectOptions,
  GatewayEventCallbacks,
  ReplyMeta,
} from "./types";

// Constants
export {
  DISCORD_MAX_MESSAGE_LENGTH,
  DEFAULT_AGENT_ID,
  DEFAULT_CONNECTION_TIMEOUT,
  DISCORD_SESSION_PREFIX,
} from "./types";

// Core modules
export { chunkMessage } from "./chunk";
export { isAllowed, type AllowlistContext } from "./allowlist";
export {
  resolveDiscordSessionKey,
  parseDiscordSessionKey,
  type SessionKeyParams,
} from "./session";
export {
  createDiscordClient,
  connectDiscord,
  disconnectDiscord,
  isClientConnected,
  type DiscordClientConfig,
  type ConnectOptions,
} from "./client";
export { sendReply, sendToChannel, showTyping } from "./sender";
export {
  createMessageListener,
  shouldProcessMessage,
  processMessage,
  extractContent,
  type ListenerConfig,
  type ListenerCleanup,
} from "./listener";
export {
  createDiscordGateway,
  type DiscordGatewayInstance,
} from "./gateway";
export {
  createReconnectManager,
  DEFAULT_RECONNECT_CONFIG,
  type ReconnectConfig,
  type ReconnectManager,
} from "./reconnect";
export {
  createGracefulShutdown,
  DEFAULT_SHUTDOWN_CONFIG,
  type GracefulShutdownConfig,
  type GracefulShutdown,
} from "./graceful-shutdown";

// Handlers
export { createEchoHandler } from "./echo-handler";

// Reactions
export {
  REACTIONS,
  addReaction,
  removeReaction,
  markReceived,
  markSuccess,
  markError,
  type ReactionType,
} from "./reaction";

// Debounce
export {
  createDebounceManager,
  DEFAULT_DEBOUNCE_WINDOW_MS,
  type DebounceConfig,
  type DebouncedHandler,
  type DebounceManager,
} from "./debounce";

// Reply Throttling
export { ReplyThrottler } from "./reply-throttler";

// Reply Queue (batched progress updates)
export { ReplyQueue } from "./reply-queue";

// Slash Commands
export {
  buildCommands,
  registerCommands,
  setupSlashCommands,
  type SlashCommandHandler,
  type CommandDefinition,
  type SlashCommandsConfig,
} from "./slash-commands";
