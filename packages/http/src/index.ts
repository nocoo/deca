/**
 * HTTP Channel Module
 *
 * This module provides HTTP API integration for the Deca platform.
 * It is intentionally decoupled from @deca/agent through the MessageHandler interface.
 */

// Types and interfaces
export type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
  HttpServerConfig,
  HttpEventCallbacks,
  HttpServer,
  ChatRequestBody,
  ChatResponseBody,
} from "./types";

// Constants
export {
  DEFAULT_PORT,
  DEFAULT_HOSTNAME,
  HTTP_SESSION_PREFIX,
  API_KEY_HEADER,
} from "./types";

// Session
export {
  generateSessionKey,
  parseSessionKey,
  generateSessionId,
  extractSessionId,
  type SessionKeyParams,
  type HttpSessionInfo,
} from "./session";

// Core
export { createHttpServer } from "./server";

// Handlers
export { createEchoHandler, type EchoHandlerConfig } from "./echo-handler";
