/**
 * Discord E2E Test Module
 *
 * Tools for automated end-to-end testing of Discord bot connectivity.
 */

export {
  createTestMessage,
  extractTestId,
  generateTestId,
  sendWebhookMessage,
  type WebhookConfig,
  type WebhookMessage,
  type WebhookResponse,
} from "./webhook";

export {
  fetchChannelMessages,
  findBotResponse,
  waitForBotResponse,
  type DiscordMessageData,
  type FetcherConfig,
  type FetchResult,
  type WaitOptions,
} from "./fetcher";
