/**
 * Credentials Loader for E2E Testing
 *
 * Loads API credentials from ~/.deca/credentials/ for real LLM and Discord integration.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AnthropicCredentials {
  /** API key for Anthropic */
  apiKey: string;
  /** Base URL (optional, for proxy) */
  baseUrl?: string;
  /** Model configuration */
  models?: {
    default?: string;
  };
}

/**
 * Per-server configuration within Discord credentials.
 */
export interface DiscordServerConfig {
  /** Guild ID for this server */
  guildId: string;
  /** Test channel ID for fetching messages (test server only) */
  testChannelId?: string;
  /** Test channel webhook URL for sending test messages (test server only) */
  testChannelWebhookUrl?: string;
  /** Main channel ID - messages here route to user session (test server only) */
  mainChannelId?: string;
  /** Main channel webhook URL for debugging (test server only) */
  mainChannelWebhookUrl?: string;
  /** User ID for unified session key across all channels (test server only) */
  mainUserId?: string;
}

export interface DiscordCredentials {
  /** Bot token for Discord API */
  botToken: string;
  /**
   * Discord Application ID (from Developer Portal -> General Information).
   * Used for slash command registration.
   * Note: For bots, this equals the bot's user ID in Discord.
   */
  botApplicationId?: string;
  /** Per-server configurations keyed by environment name */
  servers?: {
    production?: DiscordServerConfig;
    test?: DiscordServerConfig;
  };
}

const CREDENTIALS_DIR = join(homedir(), ".deca", "credentials");

/**
 * Load Anthropic credentials from ~/.deca/credentials/anthropic.json
 *
 * @returns Anthropic credentials or null if not found
 */
export function loadAnthropicCredentials(): AnthropicCredentials | null {
  const path = join(CREDENTIALS_DIR, "anthropic.json");

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as AnthropicCredentials;
  } catch {
    return null;
  }
}

/**
 * Load Discord credentials from ~/.deca/credentials/discord.json
 *
 * @returns Discord credentials or null if not found
 */
export function loadDiscordCredentials(): DiscordCredentials | null {
  const path = join(CREDENTIALS_DIR, "discord.json");

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as DiscordCredentials;
  } catch {
    return null;
  }
}

/**
 * Check if Anthropic credentials are available.
 */
export function hasAnthropicCredentials(): boolean {
  return loadAnthropicCredentials() !== null;
}

/**
 * Check if Discord credentials are available.
 */
export function hasDiscordCredentials(): boolean {
  return loadDiscordCredentials() !== null;
}

/**
 * Get Anthropic credentials or throw if not found.
 */
export function requireAnthropicCredentials(): AnthropicCredentials {
  const creds = loadAnthropicCredentials();
  if (!creds) {
    throw new Error(
      "Anthropic credentials not found. Create ~/.deca/credentials/anthropic.json",
    );
  }
  return creds;
}

/**
 * Get Discord credentials or throw if not found.
 */
export function requireDiscordCredentials(): DiscordCredentials {
  const creds = loadDiscordCredentials();
  if (!creds) {
    throw new Error(
      "Discord credentials not found. Create ~/.deca/credentials/discord.json",
    );
  }
  return creds;
}

export interface TavilyCredentials {
  /** API key for Tavily Search/Research */
  apiKey: string;
}

/**
 * Load Tavily credentials from ~/.deca/credentials/tavily.json
 *
 * @returns Tavily credentials or null if not found
 */
export function loadTavilyCredentials(): TavilyCredentials | null {
  const path = join(CREDENTIALS_DIR, "tavily.json");

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as TavilyCredentials;
  } catch {
    return null;
  }
}
