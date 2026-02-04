/**
 * Discord Gateway Assembly
 *
 * Combines all Discord components into a unified gateway interface.
 */

import { type Client, Events } from "discord.js";
import {
  connectDiscord,
  createDiscordClient,
  disconnectDiscord,
  isClientConnected,
} from "./client";
import { createMessageListener } from "./listener";
import { type ReconnectManager, createReconnectManager } from "./reconnect";
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

  const token = config.token;
  const hasInjectedClient = !!internalConfig._client;

  // Create or use injected client
  let client = internalConfig._client ?? createDiscordClient();

  // Track listener cleanup
  let cleanupListener: (() => void) | null = null;
  let reconnectManager: ReconnectManager | null = null;
  let isShuttingDown = false;

  // Check if reconnect is enabled (default: true)
  const reconnectEnabled = config.reconnect?.enabled !== false;

  /**
   * Set up message listener on connected client
   */
  function setupListener(): void {
    cleanupListener = createMessageListener(client, {
      handler: config.handler,
      allowlist: config.allowlist,
      requireMention: config.requireMention,
      requireMentionByGuild: config.requireMentionByGuild,
      requireMentionByChannel: config.requireMentionByChannel,
      agentId: config.agentId,
      ignoreBots: config.ignoreBots,
    });
  }

  /**
   * Clean up current connection
   */
  function cleanup(): void {
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }
  }

  /**
   * Handle disconnect event
   */
  function onClientDisconnect(): void {
    if (isShuttingDown) {
      return;
    }

    cleanup();
    config.events?.onDisconnect?.("Connection lost");

    // Schedule reconnect if enabled
    if (reconnectEnabled && reconnectManager) {
      reconnectManager.schedule();
    }
  }

  /**
   * Set up event handlers on client
   */
  function setupEventHandlers(): void {
    client.on(Events.ShardDisconnect, onClientDisconnect);
    client.on(Events.Error, (error) => {
      config.events?.onError?.(error);
    });
  }

  /**
   * Perform connection
   */
  async function doConnect(): Promise<void> {
    // Create a fresh client for reconnection (unless using injected client)
    if (!isClientConnected(client) && !hasInjectedClient) {
      client = createDiscordClient();
      setupEventHandlers();
    }

    await connectDiscord(client, token, {
      timeout: config.connectionTimeout,
    });

    setupListener();
    config.events?.onConnect?.();
  }

  // Set up initial event handlers for injected client
  if (hasInjectedClient) {
    setupEventHandlers();
  }

  // Create reconnect manager if enabled
  if (reconnectEnabled) {
    reconnectManager = createReconnectManager(doConnect, {
      maxRetries: config.reconnect?.maxRetries ?? 5,
      baseDelayMs: config.reconnect?.baseDelayMs ?? 1000,
      maxDelayMs: config.reconnect?.maxDelayMs ?? 60000,
      onReconnect: (attempts) => {
        config.events?.onReconnect?.(attempts);
      },
      onMaxRetries: (error) => {
        config.events?.onReconnectFailed?.(error);
      },
    });
  }

  return {
    async connect(): Promise<void> {
      isShuttingDown = false;
      await doConnect();
    },

    disconnect(): void {
      isShuttingDown = true;

      // Stop reconnection attempts
      if (reconnectManager) {
        reconnectManager.stop();
      }

      // Clean up listener
      cleanup();

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
