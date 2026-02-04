/**
 * Discord Channel Message Fetcher for E2E Testing
 *
 * Fetches recent messages from a channel to verify bot responses.
 */

export interface FetcherConfig {
  /** Bot token for API authentication */
  botToken: string;
  /** Channel ID to fetch messages from */
  channelId: string;
}

export interface DiscordMessageData {
  /** Message ID */
  id: string;
  /** Message content */
  content: string;
  /** Author info */
  author: {
    id: string;
    username: string;
    bot: boolean;
  };
  /** ISO timestamp */
  timestamp: string;
}

export interface FetchResult {
  /** Fetched messages */
  messages: DiscordMessageData[];
  /** Whether fetch succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Fetch recent messages from a Discord channel.
 *
 * @param config - Fetcher configuration
 * @param limit - Maximum messages to fetch (default: 10)
 * @returns Fetched messages
 */
export async function fetchChannelMessages(
  config: FetcherConfig,
  limit = 10,
): Promise<FetchResult> {
  const url = `${DISCORD_API}/channels/${config.channelId}/messages?limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${config.botToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        messages: [],
        success: false,
        error: `Fetch failed: ${response.status} ${text}`,
      };
    }

    const data = (await response.json()) as DiscordMessageData[];
    return {
      messages: data,
      success: true,
    };
  } catch (error) {
    return {
      messages: [],
      success: false,
      error: `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Find a bot response that matches the test ID.
 *
 * @param messages - Messages to search
 * @param testId - Test ID to match
 * @param botUserId - Bot's user ID (only look at bot messages)
 * @returns Matching message or null
 */
export function findBotResponse(
  messages: DiscordMessageData[],
  testId: string,
  botUserId?: string,
): DiscordMessageData | null {
  return (
    messages.find((msg) => {
      // If bot user ID provided, only look at bot messages
      if (botUserId && msg.author.id !== botUserId) {
        return false;
      }
      // Otherwise, look at any bot message
      if (!botUserId && !msg.author.bot) {
        return false;
      }
      // Check if message contains the test ID
      return msg.content.includes(testId);
    }) ?? null
  );
}

export interface WaitOptions {
  /** Maximum time to wait in ms (default: 10000) */
  timeout?: number;
  /** Poll interval in ms (default: 500) */
  interval?: number;
  /** Bot's user ID (optional, filters to only this bot's messages) */
  botUserId?: string;
}

/**
 * Wait for a bot response matching the test ID.
 *
 * @param config - Fetcher configuration
 * @param testId - Test ID to match
 * @param options - Wait options
 * @returns Matching message or null if timeout
 */
export async function waitForBotResponse(
  config: FetcherConfig,
  testId: string,
  options: WaitOptions = {},
): Promise<DiscordMessageData | null> {
  const timeout = options.timeout ?? 10000;
  const interval = options.interval ?? 500;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(config, 20);

    if (result.success) {
      const response = findBotResponse(
        result.messages,
        testId,
        options.botUserId,
      );
      if (response) {
        return response;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}
