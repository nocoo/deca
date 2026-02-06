/**
 * HTTP Session Key Management
 *
 * Uses unified format: agent:{agentId}:user:{userId}
 * Requires userId parameter for user identification.
 */

import { HTTP_SESSION_PREFIX } from "./types";

const DEFAULT_AGENT_ID = "deca";

export interface SessionKeyParams {
  userId: string;
  agentId?: string;
}

export interface HttpSessionInfo {
  agentId: string;
  userId: string;
}

function normalizeAgentId(agentId: string | undefined): string {
  if (!agentId || agentId.trim() === "") {
    return DEFAULT_AGENT_ID;
  }
  return agentId.trim().toLowerCase();
}

function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

export function generateSessionKey(params: SessionKeyParams): string {
  const agentId = normalizeAgentId(params.agentId);
  const userId = normalizeUserId(params.userId);
  if (!userId) {
    throw new Error("userId is required for HTTP session");
  }
  return `agent:${agentId}:user:${userId}`;
}

export function parseSessionKey(key: string): HttpSessionInfo | null {
  const parts = key.split(":");

  // New unified format: agent:{agentId}:user:{userId}
  if (parts.length === 4 && parts[0] === "agent" && parts[2] === "user") {
    return {
      agentId: parts[1],
      userId: parts[3],
    };
  }

  // Legacy format: http:{agentId}:{sessionId}
  if (parts.length === 3 && parts[0] === HTTP_SESSION_PREFIX) {
    const [, agentId, sessionId] = parts;
    if (!agentId || !sessionId) {
      return null;
    }
    return { agentId, userId: sessionId };
  }

  return null;
}

export function extractUserId(sessionKey: string): string | null {
  const parsed = parseSessionKey(sessionKey);
  return parsed?.userId ?? null;
}

/** @deprecated Use extractUserId instead */
export function extractSessionId(sessionKey: string): string | null {
  return extractUserId(sessionKey);
}
