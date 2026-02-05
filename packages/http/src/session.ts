/**
 * HTTP Session Key Management
 *
 * Generates and parses session keys for HTTP conversations.
 */

import { HTTP_SESSION_PREFIX } from "./types";

/**
 * Session key parameters
 */
export interface SessionKeyParams {
  /** Session ID */
  sessionId?: string;

  /** Agent ID (default: "deca") */
  agentId?: string;
}

/**
 * Parsed session key info
 */
export interface HttpSessionInfo {
  /** Agent ID */
  agentId: string;

  /** Session ID */
  sessionId: string;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate a session key for HTTP
 *
 * Format: http:agentId:sessionId
 *
 * @example
 * generateSessionKey({ sessionId: "abc123" })
 * // => "http:deca:abc123"
 */
export function generateSessionKey(params: SessionKeyParams = {}): string {
  const { sessionId = generateSessionId(), agentId = "deca" } = params;
  return `${HTTP_SESSION_PREFIX}:${agentId}:${sessionId}`;
}

/**
 * Parse an HTTP session key
 *
 * @returns Parsed info or null if invalid
 */
export function parseSessionKey(key: string): HttpSessionInfo | null {
  const parts = key.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [prefix, agentId, sessionId] = parts;

  if (prefix !== HTTP_SESSION_PREFIX) {
    return null;
  }

  if (!agentId || !sessionId) {
    return null;
  }

  return {
    agentId,
    sessionId,
  };
}

/**
 * Extract session ID from session key
 */
export function extractSessionId(sessionKey: string): string | null {
  const parsed = parseSessionKey(sessionKey);
  return parsed?.sessionId ?? null;
}
