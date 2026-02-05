/**
 * Terminal Channel Types and Interfaces
 *
 * This module defines the core types for the Terminal REPL integration.
 * The Terminal module is intentionally decoupled from @deca/agent through
 * the MessageHandler interface.
 */

// ============================================================================
// Message Handler Interface (Core Abstraction)
// ============================================================================

/**
 * Message handler interface - the only external dependency point for Terminal module.
 * Implementations can be:
 * - EchoHandler (for testing)
 * - AgentAdapter (bridges to @deca/agent)
 * - Any custom handler
 */
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Incoming message request from Terminal
 */
export interface MessageRequest {
  /** Session identifier for conversation tracking */
  sessionKey: string;

  /** Message content */
  content: string;

  /** Sender information */
  sender: {
    id: string;
    username: string;
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
// REPL Configuration
// ============================================================================

/**
 * Terminal REPL configuration
 */
export interface TerminalConfig {
  /** Message handler (required) */
  handler: MessageHandler;

  /** Session key for conversation tracking (default: auto-generated) */
  sessionKey?: string;

  /** User ID for session (default: "terminal-user") */
  userId?: string;

  /** Username for display (default: "user") */
  username?: string;

  /** Prompt string (default: "> ") */
  prompt?: string;

  /** Welcome message (default: shows help) */
  welcomeMessage?: string;

  /** Enable streaming output (default: true) */
  streaming?: boolean;

  /** Input stream (default: process.stdin) */
  input?: NodeJS.ReadableStream;

  /** Output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;

  /** Event callbacks */
  events?: TerminalEventCallbacks;
}

/**
 * Terminal event callbacks
 */
export interface TerminalEventCallbacks {
  /** Called when REPL starts */
  onStart?: () => void;
  /** Called when REPL exits */
  onExit?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Called when message is received */
  onMessage?: (content: string) => void;
  /** Called when response is sent */
  onResponse?: (response: MessageResponse) => void;
}

// ============================================================================
// Terminal Instance
// ============================================================================

/**
 * Terminal REPL instance
 */
export interface Terminal {
  /** Start the REPL */
  start(): Promise<void>;

  /** Stop the REPL */
  stop(): void;

  /** Send a message programmatically (for testing) */
  send(content: string): Promise<MessageResponse>;

  /** Whether REPL is running */
  readonly isRunning: boolean;

  /** Current session key */
  readonly sessionKey: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default prompt */
export const DEFAULT_PROMPT = "> ";

/** Default user ID */
export const DEFAULT_USER_ID = "terminal-user";

/** Default username */
export const DEFAULT_USERNAME = "user";

/** Session key prefix for Terminal */
export const TERMINAL_SESSION_PREFIX = "terminal";

/** Exit commands */
export const EXIT_COMMANDS = ["exit", "quit", ".exit", ".quit"] as const;

/** Help command */
export const HELP_COMMANDS = ["help", ".help", "?"] as const;
