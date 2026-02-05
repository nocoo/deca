/**
 * Discord Allowlist Filtering
 *
 * Provides message filtering based on user, guild, and channel allowlists.
 * Uses AND logic - a message must pass all configured filters.
 */

import type { AllowlistConfig } from "./types";

/**
 * Context required for allowlist checking
 */
export interface AllowlistContext {
  /** User ID */
  userId: string;
  /** Guild ID (undefined for DMs) */
  guildId?: string;
  /** Channel or thread ID */
  channelId: string;
  /** Parent channel ID (for threads) */
  parentChannelId?: string;
}

/**
 * Check if a message is allowed based on allowlist configuration.
 *
 * Rules:
 * 1. Deny list is checked first - blocked users are always blocked
 * 2. Empty/undefined lists mean "allow all" for that category
 * 3. All configured filters must pass (AND logic)
 * 4. DMs bypass guild checks
 * 5. Threads can match either their own ID or parent channel ID
 *
 * @param context - Message context
 * @param config - Allowlist configuration
 * @returns true if message is allowed
 */
export function isAllowed(
  context: AllowlistContext,
  config: AllowlistConfig | undefined,
): boolean {
  // No config means allow all
  if (!config) {
    return true;
  }

  // Check deny list first (highest priority)
  if (isDenied(context.userId, config.denyUsers)) {
    return false;
  }

  // Check user allowlist
  if (!isInList(context.userId, config.users)) {
    return false;
  }

  // Check guild allowlist (DMs bypass this check)
  if (context.guildId !== undefined) {
    if (!isInList(context.guildId, config.guilds)) {
      return false;
    }
  }

  // Check channel allowlist (threads can match parent)
  if (!isChannelAllowed(context, config.channels)) {
    return false;
  }

  return true;
}

/**
 * Check if a user is in the deny list
 */
function isDenied(userId: string, denyList: string[] | undefined): boolean {
  if (!denyList || denyList.length === 0) {
    return false;
  }
  return denyList.includes(userId);
}

/**
 * Check if an ID is in a list.
 * Empty or undefined list means "allow all".
 */
function isInList(id: string, list: string[] | undefined): boolean {
  if (!list || list.length === 0) {
    return true; // Empty list = allow all
  }
  return list.includes(id);
}

/**
 * Check if a channel is allowed.
 * Threads can match either their own ID or their parent channel ID.
 */
function isChannelAllowed(
  context: AllowlistContext,
  channels: string[] | undefined,
): boolean {
  if (!channels || channels.length === 0) {
    return true; // Empty list = allow all
  }

  // Check direct channel match
  if (channels.includes(context.channelId)) {
    return true;
  }

  // Check parent channel match (for threads)
  if (context.parentChannelId && channels.includes(context.parentChannelId)) {
    return true;
  }

  return false;
}
