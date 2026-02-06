/**
 * Gateway Types and Interfaces
 *
 * This module defines the core types for the Gateway assembly layer.
 * The Gateway is responsible for composing @deca/agent with channel modules.
 */

// Re-export channel types for convenience
export type { MessageHandler as DiscordHandler } from "@deca/discord";
export type { MessageHandler as TerminalHandler } from "@deca/terminal";
export type { MessageHandler as HttpHandler } from "@deca/http";

// ============================================================================
// Common Message Handler Interface
// ============================================================================

/**
 * Common message handler interface that all channels use
 */
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Common message request
 */
export interface MessageRequest {
  sessionKey: string;
  content: string;
  sender: {
    id: string;
    username?: string;
  };
  callbacks?: {
    onTextDelta?: (delta: string) => void;
  };
}

/**
 * Common message response
 */
export interface MessageResponse {
  text: string;
  success: boolean;
  error?: string;
}

// ============================================================================
// Gateway Configuration
// ============================================================================

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  /** Agent configuration */
  agent: AgentAdapterConfig;

  /** Discord channel configuration (optional) */
  discord?: DiscordChannelConfig;

  /** Terminal channel configuration (optional) */
  terminal?: TerminalChannelConfig;

  /** HTTP channel configuration (optional) */
  http?: HttpChannelConfig;

  /** Event callbacks */
  events?: GatewayEventCallbacks;
}

/**
 * Agent adapter configuration
 */
export interface AgentAdapterConfig {
  /** Anthropic API key */
  apiKey: string;

  /** Base URL for Anthropic API (optional) */
  baseUrl?: string;

  /** Model ID (optional) */
  model?: string;

  /** Agent ID (default: "deca") */
  agentId?: string;

  /** System prompt (optional) */
  systemPrompt?: string;

  /** Session storage directory */
  sessionDir?: string;

  /** Workspace directory for agent file operations */
  workspaceDir?: string;

  /** Prompt directory for identity/personality files (AGENTS.md, SOUL.md, etc.) */
  promptDir?: string;

  /** Enable memory (default: false) */
  enableMemory?: boolean;

  /** Memory storage directory */
  memoryDir?: string;

  /** Enable heartbeat (default: false) */
  enableHeartbeat?: boolean;

  /** Heartbeat interval in milliseconds (default: 30 minutes) */
  heartbeatIntervalMs?: number;
}

/**
 * Discord channel configuration
 */
export interface DiscordChannelConfig {
  /** Discord bot token */
  token: string;

  /** Require bot mention (default: false) */
  requireMention?: boolean;

  /** Ignore bot messages (default: true) */
  ignoreBots?: boolean;

  /** Allowlist configuration */
  allowlist?: {
    guilds?: string[];
    channels?: string[];
    users?: string[];
  };

  /** Debug mode - show session ID and timing info before processing (default: true) */
  debugMode?: boolean;

  /** Channel ID for heartbeat notifications (enables proactive messaging) */
  heartbeatChannelId?: string;
}

/**
 * Terminal channel configuration
 */
export interface TerminalChannelConfig {
  /** Enable terminal (default: true if config provided) */
  enabled?: boolean;

  /** User ID */
  userId?: string;

  /** Prompt string */
  prompt?: string;
}

/**
 * HTTP channel configuration
 */
export interface HttpChannelConfig {
  /** Port to listen on */
  port?: number;

  /** Hostname to bind */
  hostname?: string;

  /** API key for authentication */
  apiKey?: string;

  /** CORS origins */
  corsOrigins?: string[];
}

/**
 * Gateway event callbacks
 */
export interface GatewayEventCallbacks {
  /** Called when gateway starts */
  onStart?: () => void;

  /** Called when gateway stops */
  onStop?: () => void;

  /** Called on error */
  onError?: (error: Error, channel: string) => void;

  /** Called when message is processed */
  onMessage?: (channel: string, sessionKey: string) => void;

  /** Called when response is sent */
  onResponse?: (channel: string, sessionKey: string, success: boolean) => void;
}

// ============================================================================
// Gateway Instance
// ============================================================================

/**
 * Gateway instance
 */
export interface Gateway {
  /** Start the gateway */
  start(): Promise<void>;

  /** Stop the gateway */
  stop(): Promise<void>;

  /** Whether gateway is running */
  readonly isRunning: boolean;

  /** Get the agent adapter */
  readonly handler: MessageHandler;

  /** Active channels */
  readonly channels: string[];
}
