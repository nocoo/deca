/**
 * Discord E2E Test Runner
 *
 * Automated end-to-end test for Discord bot connectivity.
 * Uses webhook to send test messages and verifies bot responses.
 *
 * Usage:
 *   bun run apps/api/src/channels/discord/e2e/runner.ts
 *
 * Required credentials in ~/.deca/credentials/discord.json:
 *   - botToken: Bot authentication token
 *   - webhookUrl: Webhook URL for sending test messages
 *   - testChannelId: Channel ID where webhook sends messages
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { fetchChannelMessages, waitForBotResponse } from "./fetcher";
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
// Test Cases
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

type TestFn = (config: E2EConfig) => Promise<void>;

const tests: { name: string; fn: TestFn }[] = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// --- Define Tests ---

test("send message via webhook", async (config) => {
  const testId = generateTestId();
  const message = createTestMessage(testId, "webhook test");

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
});

test("fetch messages from channel", async (config) => {
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
});

test("bot responds to webhook message", async (config) => {
  const testId = generateTestId();
  const message = createTestMessage(testId, "ping");

  // Send test message via webhook
  const sendResult = await sendWebhookMessage(
    { url: config.webhookUrl },
    { content: message },
  );

  if (!sendResult.success) {
    throw new Error(`Webhook failed: ${sendResult.error}`);
  }

  // Wait for bot response
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

  // Verify the response contains the test ID (echo handler)
  const extractedId = extractTestId(response.content);
  if (extractedId !== testId) {
    throw new Error(
      `Response test ID mismatch: expected ${testId}, got ${extractedId}`,
    );
  }
});

// ============================================================================
// Runner
// ============================================================================

async function runTests(): Promise<void> {
  console.log("🧪 Discord E2E Test Runner\n");

  // Load config
  let config: E2EConfig;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
    console.log(`  Channel: ${config.testChannelId}`);
    console.log(`  Bot User: ${config.botUserId ?? "(not specified)"}\n`);
  } catch (error) {
    console.error(
      `✗ Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  const results: TestResult[] = [];

  for (const { name, fn } of tests) {
    const start = Date.now();
    process.stdout.write(`  ${name}... `);

    try {
      await fn(config);
      const duration = Date.now() - start;
      results.push({ name, passed: true, duration });
      console.log(`✓ (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, duration, error: errorMsg });
      console.log(`✗ (${duration}ms)`);
      console.log(`    Error: ${errorMsg}`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(`✓ All ${total} tests passed`);
  } else {
    console.log(`✗ ${passed}/${total} tests passed`);
  }

  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
