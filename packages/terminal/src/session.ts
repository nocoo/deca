/**
 * Terminal Session Key Management
 *
 * Generates and parses session keys for terminal conversations.
 */

import {
  TERMINAL_SESSION_PREFIX,
  DEFAULT_USER_ID,
} from "./types";

/**
 * Session key parameters
 */
export interface SessionKeyParams {
  /** User ID */
  userId?: string;

  /** Agent ID (default: "deca") */
  agentId?: string;
}

/**
 * Parsed session key info
 */
export interface TerminalSessionInfo {
  /** Agent ID */
  agentId: string;

  /** User ID */
  userId: string;
}

/**
 * Generate a session key for terminal
 *
 * Format: terminal:agentId:userId
 *
 * @example
 * generateSessionKey({ userId: "user123" })
 * // => "terminal:deca:user123"
 */
export function generateSessionKey(params: SessionKeyParams = {}): string {
  const { userId = DEFAULT_USER_ID, agentId = "deca" } = params;
  return `${TERMINAL_SESSION_PREFIX}:${agentId}:${userId}`;
}

/**
 * Parse a terminal session key
 *
 * @returns Parsed info or null if invalid
 */
export function parseSessionKey(key: string): TerminalSessionInfo | null {
  const parts = key.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [prefix, agentId, userId] = parts;

  if (prefix !== TERMINAL_SESSION_PREFIX) {
    return null;
  }

  if (!agentId || !userId) {
    return null;
  }

  return {
    agentId,
    userId,
  };
}
