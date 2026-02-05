/**
 * Terminal Channel Module
 *
 * This module provides Terminal REPL integration for the Deca platform.
 * It is intentionally decoupled from @deca/agent through the MessageHandler interface.
 */

// Types and interfaces
export type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
  TerminalConfig,
  TerminalEventCallbacks,
  Terminal,
} from "./types";

// Constants
export {
  DEFAULT_PROMPT,
  DEFAULT_USER_ID,
  DEFAULT_USERNAME,
  TERMINAL_SESSION_PREFIX,
  EXIT_COMMANDS,
  HELP_COMMANDS,
} from "./types";

// Session
export {
  generateSessionKey,
  parseSessionKey,
  type SessionKeyParams,
  type TerminalSessionInfo,
} from "./session";

// Core
export { createTerminal } from "./repl";

// Handlers
export { createEchoHandler, type EchoHandlerConfig } from "./echo-handler";
