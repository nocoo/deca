/**
 * Discord Channel Types and Interfaces
 *
 * This module defines the core types for the Discord gateway integration.
 * The Discord module is intentionally decoupled from @deca/agent through
 * the MessageHandler interface.
 */

// ============================================================================
// Message Handler Interface (Core Abstraction)
// ============================================================================

/**
 * Message handler interface - the only external dependency point for Discord module.
 * Implementations can be:
 * - EchoHandler (for testing)
 * - AgentAdapter (bridges to @deca/agent)
 * - Any custom handler
 */
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Incoming message request from Discord
 */
export interface MessageRequest {
  /** Session identifier for conversation tracking */
  sessionKey: string;

  /** Message content (with mentions removed if requireMention is set) */
  content: string;

  /** Sender information */
  sender: {
    id: string;
    username: string;
    displayName?: string;
  };

  /** Channel information */
  channel: {
    id: string;
    name?: string;
    type: ChannelType;
    guildId?: string;
    guildName?: string;
    threadId?: string;
  };

  /** Optional streaming callbacks */
  callbacks?: {
    onTextDelta?: (delta: string) => void;
  };
}

/**
 * Response from message handler
 */
export interface MessageResponse {
  /** Response text to send */
  text: string;

  /** Whether the operation succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Discord channel type
 */
export type ChannelType = "dm" | "guild" | "thread";

// ============================================================================
// Gateway Configuration
// ============================================================================

/**
 * Discord gateway configuration
 */
export interface DiscordGatewayConfig {
  /** Bot token (required if client not injected) */
  token?: string;

  /** Message handler (required) */
  handler: MessageHandler;

  /** Allowlist configuration for filtering */
  allowlist?: AllowlistConfig;

  /** Require bot mention to respond (global default) */
  requireMention?: boolean;

  /** Override require mention per guild */
  requireMentionByGuild?: Record<string, boolean>;

  /** Override require mention per channel */
  requireMentionByChannel?: Record<string, boolean>;

  /** Ignore messages from other bots (default: true) */
  ignoreBots?: boolean;

  /** Agent ID for session key generation (default: "deca") */
  agentId?: string;

  /** Connection timeout in milliseconds (default: 30000) */
  connectionTimeout?: number;

  /** Auto reconnect configuration */
  reconnect?: ReconnectOptions;

  /** Event callbacks */
  events?: GatewayEventCallbacks;

  /** Debounce configuration for merging rapid messages */
  debounce?: {
    /** Enable debounce (default: false) */
    enabled: boolean;
    /** Debounce window in milliseconds (default: 3000) */
    windowMs?: number;
  };
}

/**
 * Reconnect options
 */
export interface ReconnectOptions {
  /** Enable auto reconnect (default: true) */
  enabled?: boolean;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs?: number;
}

/**
 * Gateway event callbacks
 */
export interface GatewayEventCallbacks {
  /** Called when connection is established */
  onConnect?: () => void;
  /** Called when connection is lost */
  onDisconnect?: (reason: string) => void;
  /** Called when reconnection succeeds */
  onReconnect?: (attempts: number) => void;
  /** Called when max retries exceeded */
  onReconnectFailed?: (error: Error) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Gateway configuration with injected dependencies (for testing)
 */
export interface DiscordGatewayConfigWithDeps extends DiscordGatewayConfig {
  /** Injected discord.js Client instance (for testing) */
  // Note: Type is 'unknown' to avoid discord.js dependency in types
  // Actual implementation will cast to discord.js Client
  client?: unknown;
}

// ============================================================================
// Allowlist Configuration
// ============================================================================

/**
 * Allowlist configuration for filtering messages
 *
 * All lists use AND logic - a message must pass all configured filters.
 * Empty or undefined lists mean "allow all" for that category.
 */
export interface AllowlistConfig {
  /** Allowed guild IDs (empty = all guilds allowed) */
  guilds?: string[];

  /** Allowed channel IDs (empty = all channels allowed) */
  channels?: string[];

  /** Allowed user IDs (empty = all users allowed) */
  users?: string[];

  /** Denied user IDs (checked first, overrides allow list) */
  denyUsers?: string[];
}

// ============================================================================
// Session Key Types
// ============================================================================

/**
 * Parsed Discord session key information
 */
export interface DiscordSessionInfo {
  /** Agent ID */
  agentId: string;

  /** Channel type */
  type: ChannelType;

  /** User ID (for DM) or combination of guild+channel+user */
  userId: string;

  /** Guild ID (for guild/thread) */
  guildId?: string;

  /** Channel ID (for guild/thread) */
  channelId?: string;

  /** Thread ID (for thread) */
  threadId?: string;
}

// ============================================================================
// Message Context (Internal)
// ============================================================================

/**
 * Internal context passed through the message processing pipeline
 */
export interface MessageContext {
  /** Original message ID */
  messageId: string;

  /** Processed content (mentions removed, trimmed) */
  content: string;

  /** Sender info */
  sender: {
    id: string;
    username: string;
    displayName?: string;
    isBot: boolean;
  };

  /** Channel info */
  channel: {
    id: string;
    name?: string;
    type: ChannelType;
    guildId?: string;
    guildName?: string;
    threadId?: string;
    parentId?: string;
  };

  /** Generated session key */
  sessionKey: string;

  /** Whether bot was mentioned */
  wasMentioned: boolean;
}

// ============================================================================
// Gateway Interface
// ============================================================================

/**
 * Discord gateway instance
 */
export interface DiscordGateway {
  /** Connect to Discord gateway */
  connect(): Promise<void>;

  /** Disconnect from Discord gateway (immediate) */
  disconnect(): void;

  /** Graceful shutdown - wait for pending messages */
  shutdown(): Promise<void>;

  /** Whether currently connected */
  readonly isConnected: boolean;

  /** Number of messages currently being processed */
  readonly pendingCount: number;

  /** Bot user info (null if not connected) */
  readonly user: DiscordUser | null;

  /** Connected guilds */
  readonly guilds: DiscordGuild[];
}

/**
 * Minimal Discord user info (to avoid discord.js type dependency)
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  tag: string;
}

/**
 * Minimal Discord guild info (to avoid discord.js type dependency)
 */
export interface DiscordGuild {
  id: string;
  name: string;
  memberCount: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Discord message character limit */
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/** Default agent ID for session keys */
export const DEFAULT_AGENT_ID = "deca";

/** Default connection timeout in milliseconds */
export const DEFAULT_CONNECTION_TIMEOUT = 30000;

/** Session key prefix for Discord */
export const DISCORD_SESSION_PREFIX = "discord";
