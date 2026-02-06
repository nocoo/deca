#!/usr/bin/env bun

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  fetchChannelMessages,
  sendWebhookMessage,
  waitForReaction,
} from "@deca/discord/e2e";
import {
  type BotProcess,
  getGatewayDir,
  spawnBot,
} from "@deca/discord/e2e/spawner";

const DEBUG = process.argv.includes("--debug");

interface Config {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

interface MemoryTestCase {
  name: string;
  prompt: string;
  validate: (response: string) => { passed: boolean; error?: string };
}

const TEST_DIR = join(process.cwd(), "tmp", "memory-tests");
const MEMORY_DIR = join(TEST_DIR, ".memory");

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  if (!creds.botToken || !creds.webhookUrl || !creds.testChannelId) {
    throw new Error("Missing required credentials");
  }

  return {
    botToken: creds.botToken,
    webhookUrl: creds.webhookUrl,
    testChannelId: creds.testChannelId,
    botUserId: creds.botUserId,
  };
}

const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();
  return PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

async function waitForAgentResponse(
  config: Config,
  afterTimestamp: number,
  timeout = 60000,
  stabilityWindow = 3000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 2000;

  let lastResponseCount = 0;
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      20,
    );

    if (!result.success || !result.messages) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    const botResponses = result.messages
      .filter((msg) => {
        const msgTime = new Date(msg.timestamp).getTime();
        const isBotUser = config.botUserId
          ? msg.author.id === config.botUserId
          : msg.author.bot;
        return msgTime > afterTimestamp && isBotUser;
      })
      .filter((msg) => !isProcessingMessage(msg.content))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (botResponses.length === 0) {
      lastResponseCount = 0;
      stableAt = null;
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    if (botResponses.length !== lastResponseCount) {
      lastResponseCount = botResponses.length;
      stableAt = Date.now();
      if (DEBUG) {
        console.log(`   [DEBUG] Found ${botResponses.length} bot responses`);
      }
    }

    if (stableAt && Date.now() - stableAt >= stabilityWindow) {
      return botResponses.map((msg) => msg.content.trim()).join("\n\n");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}

function createMemoryTests(): MemoryTestCase[] {
  const testMarker = `MEMTEST_${Date.now()}`;

  return [
    {
      name: "memory_search: search returns no results when empty",
      prompt: `Use memory_search tool to search for "${testMarker}_NONEXISTENT". Tell me what result you got.`,
      validate: (response) => {
        const hasNoResult =
          response.includes("未找到") ||
          response.includes("no") ||
          response.includes("No") ||
          response.includes("not found") ||
          response.includes("没有");
        if (!hasNoResult) {
          return {
            passed: false,
            error: `Expected "no results" message, got: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "memory_get: get returns error for non-existent id",
      prompt: `Use memory_get tool to get memory with id "mem_fake_${testMarker}". Tell me the exact result.`,
      validate: (response) => {
        const hasNotFound =
          response.includes("未找到") ||
          response.includes("not found") ||
          response.includes("Not found") ||
          response.includes("未找到记忆") ||
          response.includes("error");
        if (!hasNotFound) {
          return {
            passed: false,
            error: `Expected "not found" error, got: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },
  ];
}

async function runMemoryTest(
  config: Config,
  test: MemoryTestCase,
): Promise<{ passed: boolean; error?: string; duration: number }> {
  const startTime = Date.now();

  try {
    if (DEBUG) console.log(`   [DEBUG] Prompt: ${test.prompt.slice(0, 80)}...`);

    const beforeSend = Date.now();

    const sendResult = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: test.prompt },
    );

    if (!sendResult.success) {
      return {
        passed: false,
        error: `Webhook failed: ${sendResult.error}`,
        duration: Date.now() - startTime,
      };
    }

    const messageId = sendResult.id ?? "";

    const hasEyes = await waitForReaction(
      { botToken: config.botToken, channelId: config.testChannelId },
      messageId,
      { emoji: "👀", timeout: 15000, interval: 500 },
    );

    if (!hasEyes) {
      return {
        passed: false,
        error: "Bot did not acknowledge (no 👀 reaction)",
        duration: Date.now() - startTime,
      };
    }

    const response = await waitForAgentResponse(config, beforeSend, 90000);

    if (!response) {
      return {
        passed: false,
        error: "No response from agent",
        duration: Date.now() - startTime,
      };
    }

    if (DEBUG) console.log(`   [DEBUG] Response: ${response.slice(0, 150)}...`);

    const validation = test.validate(response);

    return {
      ...validation,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Memory Tools\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(MEMORY_DIR, { recursive: true });
  console.log(`✓ Test directory: ${TEST_DIR}`);
  console.log(`✓ Memory directory: ${MEMORY_DIR}`);

  let bot: BotProcess;
  try {
    console.log("\n📡 Starting Agent Bot with Memory enabled...");
    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      debounce: false,
      startupTimeout: 30000,
      workspaceDir: process.cwd(),
      enableMemory: true,
      memoryDir: MEMORY_DIR,
      debug: DEBUG,
    });
    console.log(`✓ Bot started (PID: ${bot.pid})`);
  } catch (error) {
    console.error(`✗ Bot error: ${(error as Error).message}`);
    process.exit(1);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const memoryTests = createMemoryTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running Memory Tool Tests\n");

  const results: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }[] = [];

  for (const test of memoryTests) {
    process.stdout.write(`  ${test.name}... `);

    const result = await runMemoryTest(config, test);
    results.push({ name: test.name, ...result });

    if (result.passed) {
      console.log(`✓ (${result.duration}ms)`);
    } else {
      console.log(`✗ (${result.duration}ms)`);
      console.log(`    Error: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log("\n🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} memory behavioral tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} memory behavioral tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n📁 Test files: ${TEST_DIR}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
