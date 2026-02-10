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
  ReplyMeta,
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

// Scheduled dispatch (heartbeat + cron)
export {
  buildHeartbeatInstruction,
  buildCronInstruction,
  createHeartbeatCallback,
  createCronCallback,
  type ScheduledCallbackDeps,
  type HeartbeatCallbackDeps,
  type CronJobInfo,
} from "./scheduled";

// Lock
export {
  acquireGatewayLock,
  checkGatewayRunning,
  GatewayLockError,
  formatLockError,
  type GatewayLockHandle,
  type GatewayLockOptions,
  type LockPayload,
} from "./lock";

// Re-export channel modules for convenience
export * as discord from "@deca/discord";
export * as terminal from "@deca/terminal";
export * as http from "@deca/http";
