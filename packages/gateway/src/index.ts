/**
 * Gateway Module
 *
 * This module provides the gateway assembly layer for the Deca platform.
 * It composes @deca/agent with channel modules (discord, terminal, http).
 */

// Types
export type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
  GatewayConfig,
  AgentAdapterConfig,
  DiscordChannelConfig,
  TerminalChannelConfig,
  HttpChannelConfig,
  GatewayEventCallbacks,
  Gateway,
} from "./types";

// Adapter
export {
  createAgentAdapter,
  createEchoAdapter,
  type AgentAdapter,
} from "./adapter";

// Gateway
export { createGateway, createEchoGateway } from "./gateway";

// Re-export channel modules for convenience
export * as discord from "@deca/discord";
export * as terminal from "@deca/terminal";
export * as http from "@deca/http";
