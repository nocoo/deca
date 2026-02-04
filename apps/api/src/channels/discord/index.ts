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
