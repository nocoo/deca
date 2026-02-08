/**
 * Terminal Session Key Management
 *
 * Generates and parses session keys for terminal conversations.
 * Uses unified session key format for cross-channel sharing.
 */

import { DEFAULT_USER_ID } from "./types";

const DEFAULT_AGENT_ID = "deca";

/**
 * Session key parameters
 */
export interface SessionKeyParams {
  /** User ID */
  userId?: string;

  /** Agent ID (default: "main") */
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

function normalizeAgentId(agentId: string | undefined): string {
  if (!agentId || agentId.trim() === "") {
    return DEFAULT_AGENT_ID;
  }
  return agentId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Generate a session key for terminal using unified format.
 *
 * Format: agent:{agentId}:user:{userId}
 *
 * @example
 * generateSessionKey({ userId: "user123" })
 * // => "agent:main:user:user123"
 *
 * generateSessionKey({ userId: "user123", agentId: "deca" })
 * // => "agent:deca:user:user123"
 */
export function generateSessionKey(params: SessionKeyParams = {}): string {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const agentId = normalizeAgentId(params.agentId);
  return `agent:${agentId}:user:${userId}`;
}

/**
 * Parse a terminal session key (supports unified format).
 *
 * @returns Parsed info or null if invalid
 */
export function parseSessionKey(key: string): TerminalSessionInfo | null {
  // Parse unified format: agent:{agentId}:user:{userId}
  if (key.startsWith("agent:")) {
    const parts = key.split(":");
    if (parts.length === 4 && parts[2] === "user") {
      const [, agentId, , userId] = parts;
      if (agentId && userId) {
        return { agentId, userId };
      }
    }
    return null;
  }

  // Legacy format: terminal:{agentId}:{userId}
  const parts = key.split(":");
  if (parts.length === 3 && parts[0] === "terminal") {
    const [, agentId, userId] = parts;
    if (agentId && userId) {
      return { agentId, userId };
    }
  }

  return null;
}
