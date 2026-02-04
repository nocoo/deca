/**
 * Discord Client Management
 *
 * Handles discord.js client creation, connection, and lifecycle.
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  type IntentsBitField,
  Partials,
} from "discord.js";
import { DEFAULT_CONNECTION_TIMEOUT } from "./types";

/**
 * Configuration for Discord client creation
 */
export interface DiscordClientConfig {
  /** Gateway intents (default: all required for message handling) */
  intents?: GatewayIntentBits[];
  /** Channel partials (default: Channel, Message for DM support) */
  partials?: Partials[];
}

/**
 * Connection options
 */
export interface ConnectOptions {
  /** Connection timeout in milliseconds */
  timeout?: number;
}

/**
 * Default intents required for message handling
 */
const DEFAULT_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.MessageContent,
];

/**
 * Default partials required for DM support
 */
const DEFAULT_PARTIALS = [Partials.Channel, Partials.Message];

/**
 * Create a new Discord client with appropriate configuration.
 *
 * @param config - Optional client configuration
 * @returns Configured Discord client
 */
export function createDiscordClient(config?: DiscordClientConfig): Client {
  return new Client({
    intents: config?.intents ?? DEFAULT_INTENTS,
    partials: config?.partials ?? DEFAULT_PARTIALS,
  });
}

/**
 * Connect a Discord client to the gateway.
 *
 * @param client - Discord client instance
 * @param token - Bot token
 * @param options - Connection options
 * @returns Promise that resolves when connected
 */
export function connectDiscord(
  client: Client,
  token: string,
  options?: ConnectOptions,
): Promise<void> {
  const timeout = options?.timeout ?? DEFAULT_CONNECTION_TIMEOUT;

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error("Connection timeout"));
      }
    }, timeout);

    // Ready handler
    const onReady = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve();
      }
    };

    // Error handler
    const onError = (error: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(error);
      }
    };

    // Cleanup function
    const cleanup = () => {
      clearTimeout(timeoutId);
      client.off(Events.ClientReady, onReady);
      client.off(Events.Error, onError);
    };

    // Register handlers
    client.once(Events.ClientReady, onReady);
    client.once(Events.Error, onError);

    // Initiate login
    client.login(token).catch((error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(error);
      }
    });
  });
}

/**
 * Disconnect a Discord client from the gateway.
 *
 * @param client - Discord client instance
 */
export function disconnectDiscord(client: Client): void {
  try {
    client.destroy();
  } catch {
    // Ignore errors when destroying already destroyed client
  }
}

/**
 * Check if a Discord client is connected.
 *
 * @param client - Discord client instance
 * @returns true if connected
 */
export function isClientConnected(client: Client): boolean {
  return client.isReady();
}

/**
 * Get client intents as a readable format for debugging.
 *
 * @param client - Discord client instance
 * @returns Array of intent names
 */
export function getClientIntents(client: Client): string[] {
  const intents = client.options.intents as IntentsBitField;
  const names: string[] = [];

  for (const [name, value] of Object.entries(GatewayIntentBits)) {
    if (typeof value === "number" && intents.has(value)) {
      names.push(name);
    }
  }

  return names;
}
