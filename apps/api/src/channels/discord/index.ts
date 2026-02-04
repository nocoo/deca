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
export { createAllowlistFilter, isAllowed } from "./allowlist";
export { generateSessionKey, parseSessionKey } from "./session";
export { createDiscordClient } from "./client";
export { createMessageSender } from "./sender";
export { createMessageListener } from "./listener";
export { createDiscordGateway } from "./gateway";
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
