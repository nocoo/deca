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
 * Reply metadata for multi-reply support
 */
export interface ReplyMeta {
  /** Type of reply */
  kind: "ack" | "progress" | "final";
  /** Run ID for correlation */
  runId?: string;
  /** Tool name (for progress replies) */
  toolName?: string;
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
    /** Stream text deltas */
    onTextDelta?: (delta: string) => void;
    /** Send intermediate replies (ack, progress, final) */
    onReply?: (text: string, meta: ReplyMeta) => Promise<void>;
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

  /** Dispatcher configuration (optional) */
  dispatcher?: GatewayDispatcherConfig;

  /** Event callbacks */
  events?: GatewayEventCallbacks;
}

/**
 * Dispatcher configuration for gateway
 */
export interface GatewayDispatcherConfig {
  /** Maximum concurrent requests (default: 1, serial execution) */
  concurrency?: number;

  /** Per-request timeout in milliseconds (default: no limit) */
  timeout?: number;
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

  /** Workspace directory for agent file operations and personality files (AGENTS.md, SOUL.md, etc.) */
  workspaceDir?: string;

  /** Enable memory (default: false) */
  enableMemory?: boolean;

  /** Memory storage directory */
  memoryDir?: string;

  /** Heartbeat interval in milliseconds (default: 30 minutes, 0 to disable) */
  heartbeatIntervalMs?: number;

  /** Enable cron scheduler (default: false) */
  enableCron?: boolean;

  /** Cron storage path (default: ~/.deca/cron.json) */
  cronStoragePath?: string;
}

/**
 * Discord channel configuration
 */
export interface DiscordChannelConfig {
  /** Discord bot token */
  token: string;

  /**
   * Discord Application ID (from Developer Portal -> General Information).
   * Used for slash command registration.
   * Note: For bots, this equals the bot's user ID in Discord.
   */
  botApplicationId?: string;

  /** Guild IDs for guild-specific command registration (instant, recommended for dev) */
  guildIds?: string[];

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

  /** Debug mode - show session ID and timing info before processing (default: false) */
  debugMode?: boolean;

  /** Enable slash commands (default: true if botApplicationId is provided) */
  enableSlashCommands?: boolean;

  /** Main channel ID - messages in this channel route to main session for debugging */
  mainChannelId?: string;

  /** User ID for unified session - used when routing mainChannel to user session */
  mainUserId?: string;
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

export interface Gateway {
  start(): Promise<void>;

  stop(): Promise<void>;

  readonly isRunning: boolean;

  readonly handler: MessageHandler | null;

  readonly channels: string[];
}
