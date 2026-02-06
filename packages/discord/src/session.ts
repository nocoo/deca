/**
 * Discord Session Key Management
 *
 * Generates and parses session keys for Discord conversations.
 * Uses unified session key format for cross-channel sharing.
 */

import {
  type ChannelType,
  DEFAULT_AGENT_ID,
  type DiscordSessionInfo,
} from "./types";

export { DEFAULT_AGENT_ID };

export interface SessionKeyParams {
  type: ChannelType;
  userId: string;
  agentId?: string;
  guildId?: string;
  channelId?: string;
  threadId?: string;
}

function normalizeAgentId(agentId: string | undefined): string {
  if (!agentId || agentId.trim() === "") {
    return DEFAULT_AGENT_ID;
  }
  return agentId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Generate a Discord session key using unified format.
 *
 * Key formats:
 * - DM: agent:{agentId}:user:{userId}
 * - Guild: agent:{agentId}:channel:{guildId}:{channelId}
 * - Thread: agent:{agentId}:thread:{guildId}:{threadId}
 */
export function resolveDiscordSessionKey(params: SessionKeyParams): string {
  const agentId = normalizeAgentId(params.agentId);

  switch (params.type) {
    case "dm":
      return `agent:${agentId}:user:${params.userId}`;

    case "guild":
      return `agent:${agentId}:channel:${params.guildId}:${params.channelId}`;

    case "thread":
      return `agent:${agentId}:thread:${params.guildId}:${params.threadId}`;
  }
}

export type UnifiedSessionType = "user" | "channel" | "thread";

export interface UnifiedSessionInfo {
  agentId: string;
  type: UnifiedSessionType;
  userId?: string;
  guildId?: string;
  channelId?: string;
  threadId?: string;
}

export function parseUnifiedSessionKey(key: string): UnifiedSessionInfo | null {
  if (!key.startsWith("agent:")) {
    return null;
  }

  const parts = key.split(":");
  if (parts.length < 4) {
    return null;
  }

  const [, agentId, type, ...rest] = parts;

  switch (type) {
    case "user": {
      if (rest.length !== 1) return null;
      return { agentId, type: "user", userId: rest[0] };
    }
    case "channel": {
      if (rest.length !== 2) return null;
      return { agentId, type: "channel", guildId: rest[0], channelId: rest[1] };
    }
    case "thread": {
      if (rest.length !== 2) return null;
      return { agentId, type: "thread", guildId: rest[0], threadId: rest[1] };
    }
    default:
      return null;
  }
}

/**
 * Parse a Discord session key (supports both old and new formats).
 * @deprecated Use parseUnifiedSessionKey for new unified format
 */
export function parseDiscordSessionKey(key: string): DiscordSessionInfo | null {
  const unified = parseUnifiedSessionKey(key);
  if (unified) {
    switch (unified.type) {
      case "user":
        return {
          agentId: unified.agentId,
          type: "dm",
          userId: unified.userId ?? "",
        };
      case "channel":
        return {
          agentId: unified.agentId,
          type: "guild",
          userId: "",
          guildId: unified.guildId,
          channelId: unified.channelId,
        };
      case "thread":
        return {
          agentId: unified.agentId,
          type: "thread",
          userId: "",
          guildId: unified.guildId,
          threadId: unified.threadId,
        };
    }
  }

  if (!key.startsWith("discord:")) {
    return null;
  }

  const parts = key.split(":");
  if (parts.length < 4) {
    return null;
  }

  const [, agentId, type, ...rest] = parts;

  switch (type) {
    case "dm": {
      if (rest.length !== 1) return null;
      return { agentId, type: "dm", userId: rest[0] };
    }
    case "guild": {
      if (rest.length !== 3) return null;
      const [guildId, channelId, userId] = rest;
      return { agentId, type: "guild", userId, guildId, channelId };
    }
    case "thread": {
      if (rest.length !== 3) return null;
      const [guildId, threadId, userId] = rest;
      return { agentId, type: "thread", userId, guildId, threadId };
    }
    default:
      return null;
  }
}
