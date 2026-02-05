/**
 * Discord Session Key Management
 *
 * Generates and parses session keys for Discord conversations.
 * Session keys uniquely identify a conversation context.
 */

import {
  type ChannelType,
  DEFAULT_AGENT_ID,
  DISCORD_SESSION_PREFIX,
  type DiscordSessionInfo,
} from "./types";

export { DEFAULT_AGENT_ID, DISCORD_SESSION_PREFIX };

/**
 * Parameters for generating a Discord session key
 */
export interface SessionKeyParams {
  /** Channel type */
  type: ChannelType;
  /** User ID */
  userId: string;
  /** Agent ID (default: "deca") */
  agentId?: string;
  /** Guild ID (required for guild/thread) */
  guildId?: string;
  /** Channel ID (required for guild/thread) */
  channelId?: string;
  /** Thread ID (required for thread) */
  threadId?: string;
}

/**
 * Generate a Discord session key for conversation tracking.
 *
 * Key formats:
 * - DM: discord:{agentId}:dm:{userId}
 * - Guild: discord:{agentId}:guild:{guildId}:{channelId}:{userId}
 * - Thread: discord:{agentId}:thread:{guildId}:{threadId}:{userId}
 *
 * @param params - Session key parameters
 * @returns Session key string
 */
export function resolveDiscordSessionKey(params: SessionKeyParams): string {
  const agentId = normalizeAgentId(params.agentId);

  switch (params.type) {
    case "dm":
      return `${DISCORD_SESSION_PREFIX}:${agentId}:dm:${params.userId}`;

    case "guild":
      return `${DISCORD_SESSION_PREFIX}:${agentId}:guild:${params.guildId}:${params.channelId}:${params.userId}`;

    case "thread":
      return `${DISCORD_SESSION_PREFIX}:${agentId}:thread:${params.guildId}:${params.threadId}:${params.userId}`;
  }
}

/**
 * Parse a Discord session key back into its components.
 *
 * @param key - Session key string
 * @returns Parsed session info or null if not a valid Discord key
 */
export function parseDiscordSessionKey(key: string): DiscordSessionInfo | null {
  if (!key.startsWith(`${DISCORD_SESSION_PREFIX}:`)) {
    return null;
  }

  const parts = key.split(":");

  // Minimum: discord:agentId:type:userId (4 parts for DM)
  if (parts.length < 4) {
    return null;
  }

  const [, agentId, type, ...rest] = parts;

  switch (type) {
    case "dm": {
      if (rest.length !== 1) return null;
      return {
        agentId,
        type: "dm",
        userId: rest[0],
      };
    }

    case "guild": {
      if (rest.length !== 3) return null;
      const [guildId, channelId, userId] = rest;
      return {
        agentId,
        type: "guild",
        userId,
        guildId,
        channelId,
      };
    }

    case "thread": {
      if (rest.length !== 3) return null;
      const [guildId, threadId, userId] = rest;
      return {
        agentId,
        type: "thread",
        userId,
        guildId,
        threadId,
      };
    }

    default:
      return null;
  }
}

/**
 * Normalize agent ID for use in session keys.
 * - Converts to lowercase
 * - Replaces invalid characters with hyphens
 * - Falls back to default if empty
 */
function normalizeAgentId(agentId: string | undefined): string {
  if (!agentId || agentId.trim() === "") {
    return DEFAULT_AGENT_ID;
  }

  return agentId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
