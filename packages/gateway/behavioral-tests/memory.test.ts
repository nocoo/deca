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
import { cleanupJudge, verify } from "./judge";
import { isProcessingMessage } from "./utils";

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
    botUserId: creds.clientId,
  };
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

function startBot(): Promise<BotProcess> {
  return spawnBot({
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
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Memory System\n");

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

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `MEMKEY_${Date.now()}`;

  console.log("\n📡 Starting Agent Bot (Phase 1: Accuracy)...");
  let bot = await startBot();
  console.log(`✓ Bot started (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 1: Accuracy Tests\n");

  {
    const testName = "accuracy: empty search returns 'no results'";
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
      const judgeResult = await verify(
        response,
        "Response should indicate that the memory search returned no results or found nothing.",
      );

      if (judgeResult.passed) {
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
          error: `Unexpected response: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "accuracy: memory_get with fake ID returns 'not found'";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      'Use memory_get tool to get memory with id "mem_fake_123456". Tell me the exact result from the tool.',
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const judgeResult = await verify(
        response,
        "Response should indicate that the memory with the given ID was not found, does not exist, or returned an error.",
      );

      if (judgeResult.passed) {
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
          error: `Unexpected response: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const uniqueSecret1 = `SECRET_${testMarker}_ALPHA`;
  {
    const testName = "accuracy: auto-saved conversation is searchable";
    process.stdout.write(`  ${testName}... `);

    const step1 = await sendAndWait(
      config,
      `Remember this important information: The secret code is "${uniqueSecret1}". Just confirm you understood.`,
    );

    if (!step1.success) {
      console.log("✗");
      console.log(`    Error (step 1): ${step1.error}`);
      results.push({ name: testName, passed: false, error: step1.error });
    } else {
      if (DEBUG) {
        console.log(
          `\n   [DEBUG] Step 1 response: ${step1.response?.slice(0, 100)}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));

      const step2 = await sendAndWait(
        config,
        `Use memory_search tool to search for "${uniqueSecret1}". Tell me if you found any results and what they contain.`,
      );

      if (!step2.success) {
        console.log("✗");
        console.log(`    Error (step 2): ${step2.error}`);
        results.push({ name: testName, passed: false, error: step2.error });
      } else {
        const response = step2.response ?? "";
        if (DEBUG) {
          console.log(`   [DEBUG] Step 2 response: ${response.slice(0, 200)}`);
        }

        const judgeResult = await verify(
          response,
          `Response should indicate that a memory search found results related to "${uniqueSecret1}". It should NOT say "no results" or "not found".`,
        );

        if (judgeResult.passed) {
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
            error: `Memory not found: ${judgeResult.reasoning}`,
          });
        }
      }
    }
  }

  {
    const testName = "accuracy: memory_get retrieves full content by ID";
    process.stdout.write(`  ${testName}... `);

    const searchResult = await sendAndWait(
      config,
      `Use memory_search tool to search for "${uniqueSecret1}". Return ONLY the memory ID (starts with mem_).`,
    );

    if (!searchResult.success) {
      console.log("✗");
      console.log(`    Error (search): ${searchResult.error}`);
      results.push({
        name: testName,
        passed: false,
        error: searchResult.error,
      });
    } else {
      const searchResponse = searchResult.response ?? "";
      const idMatch = searchResponse.match(/mem_\d+_\w+/);

      if (!idMatch) {
        console.log("✗");
        console.log("    Error: Could not extract memory ID from response");
        results.push({
          name: testName,
          passed: false,
          error: "No memory ID found in search response",
        });
      } else {
        const memoryId = idMatch[0];
        if (DEBUG) {
          console.log(`\n   [DEBUG] Found memory ID: ${memoryId}`);
        }

        const getResult = await sendAndWait(
          config,
          `Use memory_get tool to get the full content of memory with ID "${memoryId}". Show me the content.`,
        );

        if (!getResult.success) {
          console.log("✗");
          console.log(`    Error (get): ${getResult.error}`);
          results.push({
            name: testName,
            passed: false,
            error: getResult.error,
          });
        } else {
          const getResponse = getResult.response ?? "";

          if (
            getResponse.includes(uniqueSecret1) ||
            getResponse.includes("secret")
          ) {
            console.log("✓");
            results.push({ name: testName, passed: true });
          } else {
            console.log("✗");
            console.log("    Error: Full content should contain the secret");
            console.log(`    Response: ${getResponse.slice(0, 200)}`);
            results.push({
              name: testName,
              passed: false,
              error: `Content mismatch: ${getResponse.slice(0, 150)}`,
            });
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const uniqueSecret2 = `SECRET_${testMarker}_BETA`;
  {
    const testName = "accuracy: store second memory for persistence test";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Remember another important code: "${uniqueSecret2}". This is for testing persistence. Just confirm.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      console.log("✓");
      results.push({ name: testName, passed: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("\n🛑 Stopping bot for persistence test...");
  await bot.stop();
  console.log("✓ Bot stopped");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n📡 Restarting Agent Bot (Phase 2: Persistence)...");
  bot = await startBot();
  console.log(`✓ Bot restarted (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 2: Persistence Tests\n");

  {
    const testName = "persistence: first memory survives restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use memory_search tool to search for "${uniqueSecret1}". Tell me if you found it.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";

      const judgeResult = await verify(
        response,
        `Response should indicate that a memory search found results related to "${uniqueSecret1}". It should NOT say "no results" or "not found".`,
      );

      if (judgeResult.passed) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Memory should persist after restart");
        console.log(`    Response: ${response.slice(0, 200)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Memory lost after restart: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "persistence: second memory survives restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use memory_search tool to search for "${uniqueSecret2}". Tell me if you found it.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";

      const judgeResult = await verify(
        response,
        `Response should indicate that a memory search found results related to "${uniqueSecret2}". It should NOT say "no results" or "not found".`,
      );

      if (judgeResult.passed) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Memory should persist after restart");
        console.log(`    Response: ${response.slice(0, 200)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Memory lost after restart: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "persistence: can distinguish multiple memories";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use memory_search tool to search for "${testMarker}". How many different secrets do you find? List them.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";

      const judgeResult = await verify(
        response,
        "Response should indicate that the search found multiple (at least 2) distinct memories or secrets, ideally mentioning both ALPHA and BETA variants.",
      );

      if (judgeResult.passed) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Should find both ALPHA and BETA memories");
        console.log(`    Response: ${response.slice(0, 300)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Could not distinguish memories: ${judgeResult.reasoning}`,
        });
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
  console.log(`📁 Memory file: ${join(MEMORY_DIR, "index.json")}`);
  cleanupJudge();
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
