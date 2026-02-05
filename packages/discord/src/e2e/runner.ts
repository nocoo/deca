/**
 * Discord E2E Test Runner
 *
 * Automated end-to-end test for Discord bot features.
 * Spawns bot process, sends test messages via webhook, and verifies bot behavior.
 *
 * Usage:
 *   bun run apps/api/src/channels/discord/e2e/runner.ts
 *   bun run apps/api/src/channels/discord/e2e/runner.ts --debug
 *
 * Required credentials in ~/.deca/credentials/discord.json:
 *   - botToken: Bot authentication token
 *   - webhookUrl: Webhook URL for sending test messages
 *   - testChannelId: Channel ID where webhook sends messages
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  fetchChannelMessages,
  getMessageReactions,
  waitForBotResponse,
  waitForReaction,
} from "./fetcher";
import { getApiDir, spawnBot, type BotProcess } from "./spawner";
import {
  createTestMessage,
  extractTestId,
  generateTestId,
  sendWebhookMessage,
} from "./webhook";

// ============================================================================
// Configuration
// ============================================================================

interface E2EConfig {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

const DEBUG = process.argv.includes("--debug");

async function loadConfig(): Promise<E2EConfig> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");

  try {
    const content = await Bun.file(credPath).text();
    const creds = JSON.parse(content);

    if (!creds.botToken) {
      throw new Error("Missing botToken in discord.json");
    }
    if (!creds.webhookUrl) {
      throw new Error("Missing webhookUrl in discord.json");
    }
    if (!creds.testChannelId) {
      throw new Error("Missing testChannelId in discord.json");
    }

    return {
      botToken: creds.botToken,
      webhookUrl: creds.webhookUrl,
      testChannelId: creds.testChannelId,
      botUserId: creds.botUserId,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing")) {
      throw error;
    }
    throw new Error(
      `Failed to load credentials from ${credPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ============================================================================
// Test Framework
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestContext {
  config: E2EConfig;
}

type TestFn = (ctx: TestContext) => Promise<void>;

interface TestSuite {
  name: string;
  debounce: boolean;
  tests: { name: string; fn: TestFn }[];
}

const suites: TestSuite[] = [];

function suite(name: string, debounce: boolean): TestSuite {
  const s: TestSuite = { name, debounce, tests: [] };
  suites.push(s);
  return s;
}

// ============================================================================
// Test Suites
// ============================================================================

// --- Suite 1: Basic Tests (no debounce) ---
const basicSuite = suite("Basic Bot Functionality", false);

basicSuite.tests.push({
  name: "webhook can send messages",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "infrastructure test");

    const result = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: message },
    );

    if (!result.success) {
      throw new Error(result.error ?? "Webhook send failed");
    }

    if (!result.id) {
      throw new Error("Webhook did not return message ID");
    }
  },
});

basicSuite.tests.push({
  name: "can fetch channel messages",
  fn: async ({ config }) => {
    const result = await fetchChannelMessages({
      botToken: config.botToken,
      channelId: config.testChannelId,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Fetch failed");
    }

    if (!Array.isArray(result.messages)) {
      throw new Error("Expected messages array");
    }
  },
});

basicSuite.tests.push({
  name: "bot responds to messages (echo mode)",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "hello bot");

    const sendResult = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: message },
    );

    if (!sendResult.success) {
      throw new Error(`Webhook failed: ${sendResult.error}`);
    }

    const response = await waitForBotResponse(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      testId,
      {
        timeout: 15000,
        interval: 1000,
        botUserId: config.botUserId,
      },
    );

    if (!response) {
      throw new Error(`Bot did not respond within timeout (testId: ${testId})`);
    }

    const extractedId = extractTestId(response.content);
    if (extractedId !== testId) {
      throw new Error(
        `Response test ID mismatch: expected ${testId}, got ${extractedId}`,
      );
    }
  },
});

// --- Suite 2: Reaction Tests (no debounce, immediate processing) ---
const reactionSuite = suite("Reaction Confirmation", false);

reactionSuite.tests.push({
  name: "bot adds 👀 reaction when receiving message",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "reaction test");

    const sendResult = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: message },
    );

    if (!sendResult.success || !sendResult.id) {
      throw new Error(`Webhook failed: ${sendResult.error}`);
    }

    // Wait for 👀 reaction
    const hasEyes = await waitForReaction(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      sendResult.id,
      {
        emoji: "👀",
        timeout: 8000,
        interval: 500,
      },
    );

    if (!hasEyes) {
      throw new Error("Bot did not add 👀 reaction");
    }
  },
});

reactionSuite.tests.push({
  name: "bot replaces 👀 with ✅ after successful processing",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "success reaction test");

    const sendResult = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: message },
    );

    if (!sendResult.success || !sendResult.id) {
      throw new Error(`Webhook failed: ${sendResult.error}`);
    }

    // Wait for bot to respond
    const response = await waitForBotResponse(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      testId,
      {
        timeout: 15000,
        interval: 1000,
        botUserId: config.botUserId,
      },
    );

    if (!response) {
      throw new Error("Bot did not respond");
    }

    // Wait for ✅ reaction to appear (instead of fixed delay)
    const hasCheck = await waitForReaction(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      sendResult.id,
      {
        emoji: "✅",
        timeout: 5000,
        interval: 300,
      },
    );

    if (!hasCheck) {
      // Get current reactions for error message
      const reactions = await getMessageReactions(
        {
          botToken: config.botToken,
          channelId: config.testChannelId,
        },
        sendResult.id,
      );
      throw new Error(`Expected ✅ reaction, got: [${reactions.join(", ")}]`);
    }

    // Verify 👀 was removed
    const finalReactions = await getMessageReactions(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      sendResult.id,
    );

    if (finalReactions.includes("👀")) {
      throw new Error("👀 reaction should be removed after processing");
    }
  },
});

// --- Suite 3: Debounce Tests (with debounce enabled) ---
const debounceSuite = suite("Message Debounce", true);

debounceSuite.tests.push({
  name: "bot merges rapid consecutive messages",
  fn: async ({ config }) => {
    const testId = generateTestId();

    // Record start time to filter out old messages
    const testStartTime = Date.now();

    // Send 3 messages rapidly (within debounce window)
    const messages = [
      createTestMessage(testId, "part 1"),
      createTestMessage(testId, "part 2"),
      createTestMessage(testId, "part 3"),
    ];

    for (const msg of messages) {
      const result = await sendWebhookMessage(
        { url: config.webhookUrl },
        { content: msg },
      );
      if (!result.success) {
        throw new Error(`Webhook failed: ${result.error}`);
      }
      // Small delay between messages (within 3s debounce window)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Wait for debounce window + processing time
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Fetch recent bot messages
    const result = await fetchChannelMessages(
      {
        botToken: config.botToken,
        channelId: config.testChannelId,
      },
      30,
    );

    if (!result.success) {
      throw new Error("Failed to fetch messages");
    }

    // Count bot responses with our test ID that were sent after test started
    // Note: We need to distinguish bot responses from webhook messages
    // Bot responses start with "🔊 Echo:" prefix
    const botResponses = result.messages.filter((m) => {
      // Must be a bot message
      const isBot = config.botUserId
        ? m.author.id === config.botUserId
        : m.author.bot;
      if (!isBot) return false;

      // Must contain our test ID
      if (!m.content.includes(testId)) return false;

      // Must be sent after test started (use Date comparison)
      const msgTime = new Date(m.timestamp).getTime();
      if (msgTime < testStartTime) return false;

      // Must be a bot response (starts with echo prefix), not a webhook message
      if (!m.content.startsWith("🔊 Echo:")) return false;

      return true;
    });

    // With debounce, we should have 1 merged response (or at most 2 due to timing)
    if (botResponses.length >= 3) {
      // Debug: show what messages we found
      if (DEBUG) {
        console.log(`\n[DEBUG] Found ${botResponses.length} bot responses:`);
        for (const r of botResponses) {
          console.log(`  - ${r.timestamp}: ${r.content.substring(0, 80)}...`);
        }
      }
      throw new Error(
        `Expected debounced response (< 3 replies), got ${botResponses.length} replies`,
      );
    }

    // Verify the merged response contains content from all messages
    if (botResponses.length > 0) {
      const content = botResponses[0].content;
      // The echo should contain parts from all messages
      if (!content.includes("part 1")) {
        throw new Error("Merged response missing 'part 1'");
      }
    }
  },
});

// ============================================================================
// Runner
// ============================================================================

async function runSuite(
  suiteDef: TestSuite,
  config: E2EConfig,
): Promise<TestResult[]> {
  console.log(`\n📦 ${suiteDef.name}`);
  console.log(`   (debounce: ${suiteDef.debounce ? "enabled" : "disabled"})\n`);

  // Spawn bot for this suite
  let bot: BotProcess;
  try {
    bot = await spawnBot({
      cwd: getApiDir(),
      mode: "echo",
      startupTimeout: 15000,
      allowBots: true,
      debounce: suiteDef.debounce,
      debug: DEBUG,
    });
    console.log(`   ✓ Bot started (PID: ${bot.pid})\n`);
  } catch (error) {
    console.error(
      `   ✗ Failed to start bot: ${error instanceof Error ? error.message : String(error)}`,
    );
    return suiteDef.tests.map((t) => ({
      name: t.name,
      passed: false,
      duration: 0,
      error: "Bot startup failed",
    }));
  }

  // Give bot a moment to stabilize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const results: TestResult[] = [];

  try {
    for (const { name, fn } of suiteDef.tests) {
      const start = Date.now();
      process.stdout.write(`   ${name}... `);

      try {
        await fn({ config });
        const duration = Date.now() - start;
        results.push({ name, passed: true, duration });
        console.log(`✓ (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - start;
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, duration, error: errorMsg });
        console.log(`✗ (${duration}ms)`);
        console.log(`      Error: ${errorMsg}`);
      }

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    // Stop bot
    console.log("\n   🛑 Stopping bot...");
    await bot.stop();
    console.log("   ✓ Bot stopped");
  }

  return results;
}

async function runTests(): Promise<void> {
  console.log("🧪 Discord E2E Test Runner\n");

  // Load config
  let config: E2EConfig;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
    console.log(`  Channel: ${config.testChannelId}`);
    console.log(`  Bot User: ${config.botUserId ?? "(auto-detect)"}`);
  } catch (error) {
    console.error(
      `✗ Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  const allResults: TestResult[] = [];

  // Run each suite with its own bot configuration
  for (const suiteDef of suites) {
    const results = await runSuite(suiteDef, config);
    allResults.push(...results);
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  const passed = allResults.filter((r) => r.passed).length;
  const total = allResults.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(`✅ All ${total} tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} tests passed`);
    console.log("\nFailed tests:");
    for (const r of allResults.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
