/**
 * HTTP Channel Types and Interfaces
 *
 * This module defines the core types for the HTTP API integration.
 * The HTTP module is intentionally decoupled from @deca/agent through
 * the MessageHandler interface.
 */

// ============================================================================
// Message Handler Interface (Core Abstraction)
// ============================================================================

/**
 * Message handler interface - the only external dependency point for HTTP module.
 * Implementations can be:
 * - EchoHandler (for testing)
 * - AgentAdapter (bridges to @deca/agent)
 * - Any custom handler
 */
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Incoming message request from HTTP
 */
export interface MessageRequest {
  /** Session identifier for conversation tracking */
  sessionKey: string;

  /** Message content */
  content: string;

  /** Sender information */
  sender: {
    id: string;
    username?: string;
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
// Server Configuration
// ============================================================================

/**
 * HTTP server configuration
 */
export interface HttpServerConfig {
  /** Message handler (required) */
  handler: MessageHandler;

  /** Port to listen on (default: 3000) */
  port?: number;

  /** Hostname to bind to (default: "127.0.0.1") */
  hostname?: string;

  /** API key for authentication (optional) */
  apiKey?: string;

  /** CORS allowed origins (default: none) */
  corsOrigins?: string[];

  /** Event callbacks */
  events?: HttpEventCallbacks;
}

/**
 * HTTP event callbacks
 */
export interface HttpEventCallbacks {
  /** Called when server starts */
  onStart?: (info: { hostname: string; port: number }) => void;
  /** Called when server stops */
  onStop?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Called when request is received */
  onRequest?: (path: string, method: string) => void;
}

// ============================================================================
// Server Instance
// ============================================================================

/**
 * HTTP server instance
 */
export interface HttpServer {
  /** Start the server */
  start(): Promise<void>;

  /** Stop the server */
  stop(): void;

  /** Whether server is running */
  readonly isRunning: boolean;

  /** Current port */
  readonly port: number;

  /** Get the Hono app instance (for testing) */
  readonly app: unknown;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Chat message request body
 */
export interface ChatRequestBody {
  /** Message content */
  message: string;

  /** Session ID (optional, will be generated if not provided) */
  sessionId?: string;

  /** Sender ID (optional) */
  senderId?: string;
}

/**
 * Chat response body
 */
export interface ChatResponseBody {
  /** Response text */
  response: string;

  /** Session ID used */
  sessionId: string;

  /** Whether successful */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default port */
export const DEFAULT_PORT = 3000;

/** Default hostname */
export const DEFAULT_HOSTNAME = "127.0.0.1";

/** Session key prefix for HTTP */
export const HTTP_SESSION_PREFIX = "http";

/** API key header name */
export const API_KEY_HEADER = "x-api-key";
