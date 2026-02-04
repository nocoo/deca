/**
 * Discord Gateway Assembly
 *
 * Combines all Discord components into a unified gateway interface.
 */

import type { Client } from "discord.js";
import {
  connectDiscord,
  createDiscordClient,
  disconnectDiscord,
  isClientConnected,
} from "./client";
import { createMessageListener } from "./listener";
import type {
  DiscordGateway,
  DiscordGatewayConfig,
  DiscordGuild,
  DiscordUser,
} from "./types";

/**
 * Extended config that allows injecting a client for testing
 */
interface InternalGatewayConfig extends DiscordGatewayConfig {
  /** Internal: injected client for testing */
  _client?: Client;
}

/**
 * Gateway instance with full interface
 */
export interface DiscordGatewayInstance extends DiscordGateway {
  /** Get underlying client (for advanced usage) */
  readonly client: Client;
}

/**
 * Create a Discord gateway.
 *
 * @param config - Gateway configuration
 * @returns Discord gateway instance
 */
export function createDiscordGateway(
  config: DiscordGatewayConfig | InternalGatewayConfig,
): DiscordGatewayInstance {
  const internalConfig = config as InternalGatewayConfig;

  if (!config.token) {
    throw new Error("Discord bot token is required");
  }

  // Create or use injected client
  const client = internalConfig._client ?? createDiscordClient();

  // Track listener cleanup
  let cleanupListener: (() => void) | null = null;

  return {
    async connect(): Promise<void> {
      // Connect to Discord
      // Token is validated in createDiscordGateway
      const token = config.token as string;
      await connectDiscord(client, token, {
        timeout: config.connectionTimeout,
      });

      // Set up message listener
      cleanupListener = createMessageListener(client, {
        handler: config.handler,
        allowlist: config.allowlist,
        requireMention: config.requireMention,
        requireMentionByGuild: config.requireMentionByGuild,
        requireMentionByChannel: config.requireMentionByChannel,
        agentId: config.agentId,
        ignoreBots: config.ignoreBots,
      });
    },

    disconnect(): void {
      // Clean up listener
      if (cleanupListener) {
        cleanupListener();
        cleanupListener = null;
      }

      // Disconnect client
      disconnectDiscord(client);
    },

    get isConnected(): boolean {
      return isClientConnected(client);
    },

    get user(): DiscordUser | null {
      const user = client.user;
      if (!user) return null;

      return {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        tag: user.tag,
      };
    },

    get guilds(): DiscordGuild[] {
      return Array.from(client.guilds.cache.values()).map((guild) => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
      }));
    },

    get client(): Client {
      return client;
    },
  };
}
