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
  getMessageReactions,
  waitForBotResponse,
  waitForReaction,
  type DiscordMessageData,
  type DiscordReaction,
  type FetcherConfig,
  type FetchResult,
  type ReactionWaitOptions,
  type WaitOptions,
} from "./fetcher";

export {
  getApiDir,
  getGatewayDir,
  spawnBot,
  type BotProcess,
  type SpawnerConfig,
} from "./spawner";
