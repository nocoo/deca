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

// Handlers
export { createEchoHandler } from "./echo-handler";
