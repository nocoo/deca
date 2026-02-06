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

async function sendAndWait(
  config: Config,
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const beforeSend = Date.now();

  const sendResult = await sendWebhookMessage(
    { url: config.webhookUrl },
    { content: prompt },
  );

  if (!sendResult.success) {
    return { success: false, error: `Webhook failed: ${sendResult.error}` };
  }

  const messageId = sendResult.id ?? "";

  const hasEyes = await waitForReaction(
    { botToken: config.botToken, channelId: config.testChannelId },
    messageId,
    { emoji: "👀", timeout: 15000, interval: 500 },
  );

  if (!hasEyes) {
    return {
      success: false,
      error: "Bot did not acknowledge (no 👀 reaction)",
    };
  }

  const response = await waitForAgentResponse(config, beforeSend, 90000);

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  return { success: true, response };
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

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running Memory Tool Tests\n");

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `MEMKEY_${Date.now()}`;

  // Test 1: memory_search returns no results when empty
  {
    const testName = "memory_search: empty search returns no results";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use memory_search tool to search for "${testMarker}_NONEXISTENT". Tell me the exact result from the tool.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const hasNoResult =
        response.includes("未找到") ||
        response.includes("no ") ||
        response.includes("No ") ||
        response.includes("not found") ||
        response.includes("没有") ||
        response.includes("empty") ||
        response.includes("0 result");

      if (hasNoResult) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Expected "no results", got: ${response.slice(0, 150)}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Unexpected response: ${response.slice(0, 150)}`,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 2: memory_get returns error for non-existent id
  {
    const testName = "memory_get: non-existent id returns error";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use memory_get tool to get memory with id "mem_fake_123456". Tell me the exact result from the tool.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const hasNotFound =
        response.includes("未找到") ||
        response.includes("not found") ||
        response.includes("Not found") ||
        response.includes("error") ||
        response.includes("Error") ||
        response.includes("doesn't exist") ||
        response.includes("does not exist");

      if (hasNotFound) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Expected "not found", got: ${response.slice(0, 150)}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Unexpected response: ${response.slice(0, 150)}`,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 3: Full memory flow - auto-save then search
  {
    const testName = "memory flow: auto-save conversation then search";
    process.stdout.write(`  ${testName}... `);

    // Step 1: Send a message with unique content that will be auto-saved
    const uniqueSecret = `SECRET_${testMarker}_XYZZY`;
    const step1 = await sendAndWait(
      config,
      `Remember this important information: The secret code is "${uniqueSecret}". Just confirm you understood.`,
    );

    if (!step1.success) {
      console.log("✗");
      console.log(`    Error (step 1): ${step1.error}`);
      results.push({ name: testName, passed: false, error: step1.error });
    } else {
      if (DEBUG)
        console.log(
          `\n   [DEBUG] Step 1 response: ${step1.response?.slice(0, 100)}`,
        );

      // Wait for memory to be saved
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Step 2: Search for the saved content
      const step2 = await sendAndWait(
        config,
        `Use memory_search tool to search for "${uniqueSecret}". Tell me if you found any results and what they contain.`,
      );

      if (!step2.success) {
        console.log("✗");
        console.log(`    Error (step 2): ${step2.error}`);
        results.push({ name: testName, passed: false, error: step2.error });
      } else {
        const response = step2.response ?? "";
        if (DEBUG)
          console.log(`   [DEBUG] Step 2 response: ${response.slice(0, 200)}`);

        // Check if we found the memory
        const foundMemory =
          response.includes(uniqueSecret) ||
          response.includes("secret") ||
          response.includes("found") ||
          response.includes("result") ||
          response.includes("mem_");

        const noResults =
          response.includes("未找到") ||
          response.includes("no result") ||
          response.includes("No result") ||
          response.includes("没有");

        if (foundMemory && !noResults) {
          console.log("✓");
          results.push({ name: testName, passed: true });
        } else {
          console.log("✗");
          console.log(
            "    Error: Memory search should find saved conversation",
          );
          console.log(`    Response: ${response.slice(0, 200)}`);
          results.push({
            name: testName,
            passed: false,
            error: `Memory not found after auto-save: ${response.slice(0, 150)}`,
          });
        }
      }
    }
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
