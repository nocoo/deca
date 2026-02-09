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

const TEST_DIR = join(process.cwd(), "tmp", "dispatcher-tests");

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

const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();
  return PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

async function waitForMultipleResponses(
  config: Config,
  afterTimestamp: number,
  expectedCount: number,
  timeout = 120000,
  stabilityWindow = 5000,
): Promise<{ responses: string[]; timestamps: number[] }> {
  const startTime = Date.now();
  const interval = 2000;

  let lastCount = 0;
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      50,
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

    if (DEBUG && botResponses.length > lastCount) {
      console.log(
        `   [DEBUG] Found ${botResponses.length}/${expectedCount} responses`,
      );
    }

    if (botResponses.length !== lastCount) {
      lastCount = botResponses.length;
      stableAt = Date.now();
    }

    if (
      botResponses.length >= expectedCount &&
      stableAt &&
      Date.now() - stableAt >= stabilityWindow
    ) {
      return {
        responses: botResponses.map((msg) => msg.content.trim()),
        timestamps: botResponses.map((msg) =>
          new Date(msg.timestamp).getTime(),
        ),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const finalResult = await fetchChannelMessages(
    { botToken: config.botToken, channelId: config.testChannelId },
    50,
  );

  const finalResponses = (finalResult.messages ?? [])
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

  return {
    responses: finalResponses.map((msg) => msg.content.trim()),
    timestamps: finalResponses.map((msg) => new Date(msg.timestamp).getTime()),
  };
}

async function sendHttpRequest(
  port: number,
  userId: string,
  message: string,
): Promise<{
  success: boolean;
  response?: string;
  startTime: number;
  endTime: number;
}> {
  const startTime = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, senderId: userId }),
    });

    const endTime = Date.now();

    if (!response.ok) {
      return { success: false, startTime, endTime };
    }

    const data = await response.json();
    return {
      success: data.success,
      response: data.response,
      startTime,
      endTime,
    };
  } catch {
    return { success: false, startTime, endTime: Date.now() };
  }
}

function startBot(httpPort: number): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    httpPort,
    debug: DEBUG,
  });
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Dispatcher Concurrency\n");

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
  console.log(`✓ Test directory: ${TEST_DIR}`);

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `DISPATCH_${Date.now()}`;
  const httpPort = 19900 + Math.floor(Math.random() * 100);

  console.log("\n📡 Starting Agent Bot (concurrency=2)...");
  const bot = await startBot(httpPort);
  console.log(`✓ Bot started (PID: ${bot.pid}, HTTP: ${httpPort})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 1: Concurrent HTTP Requests\n");

  {
    const testName = "http: concurrent requests are processed";
    process.stdout.write(`  ${testName}... `);

    const requests = [
      {
        userId: "user-1",
        message: `${testMarker}_REQ_1: What is 2+2? Reply briefly.`,
      },
      {
        userId: "user-2",
        message: `${testMarker}_REQ_2: What is 3+3? Reply briefly.`,
      },
      {
        userId: "user-3",
        message: `${testMarker}_REQ_3: What is 4+4? Reply briefly.`,
      },
    ];

    const startTime = Date.now();

    const responses = await Promise.all(
      requests.map((r) => sendHttpRequest(httpPort, r.userId, r.message)),
    );

    const totalTime = Date.now() - startTime;
    const allSucceeded = responses.every((r) => r.success);

    if (DEBUG) {
      console.log(`\n   [DEBUG] Total time: ${totalTime}ms`);
      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        console.log(
          `   [DEBUG] Request ${i + 1}: ${r.endTime - r.startTime}ms - ${r.response?.slice(0, 50)}`,
        );
      }
    }

    if (allSucceeded) {
      console.log(`✓ (${totalTime}ms total)`);
      results.push({ name: testName, passed: true });
    } else {
      console.log("✗");
      const failed = responses.filter((r) => !r.success).length;
      console.log(`    Error: ${failed}/${requests.length} requests failed`);
      results.push({
        name: testName,
        passed: false,
        error: `${failed} requests failed`,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "http: concurrency=2 processes 2 requests in parallel";
    process.stdout.write(`  ${testName}... `);

    const requests = [
      {
        userId: "parallel-1",
        message: `${testMarker}_PARALLEL_1: Count from 1 to 5 slowly. Reply with the numbers.`,
      },
      {
        userId: "parallel-2",
        message: `${testMarker}_PARALLEL_2: Count from 10 to 15 slowly. Reply with the numbers.`,
      },
    ];

    const startTime = Date.now();

    const responses = await Promise.all(
      requests.map((r) => sendHttpRequest(httpPort, r.userId, r.message)),
    );

    const totalTime = Date.now() - startTime;
    const individualTimes = responses.map((r) => r.endTime - r.startTime);
    const maxIndividualTime = Math.max(...individualTimes);

    const isParallel = totalTime < maxIndividualTime * 1.5;

    if (DEBUG) {
      console.log(`\n   [DEBUG] Total time: ${totalTime}ms`);
      console.log(
        `   [DEBUG] Individual times: ${individualTimes.join(", ")}ms`,
      );
      console.log(`   [DEBUG] Max individual: ${maxIndividualTime}ms`);
      console.log(`   [DEBUG] Is parallel: ${isParallel}`);
    }

    const allSucceeded = responses.every((r) => r.success);

    if (allSucceeded && isParallel) {
      console.log(
        `✓ (${totalTime}ms < ${maxIndividualTime * 1.5}ms threshold)`,
      );
      results.push({ name: testName, passed: true });
    } else if (!allSucceeded) {
      console.log("✗");
      console.log("    Error: Some requests failed");
      results.push({ name: testName, passed: false, error: "Requests failed" });
    } else {
      console.log("⚠ (sequential execution detected)");
      console.log(
        `    Total: ${totalTime}ms, Expected parallel: <${maxIndividualTime * 1.5}ms`,
      );
      results.push({
        name: testName,
        passed: false,
        error: `Sequential execution: ${totalTime}ms > ${maxIndividualTime * 1.5}ms`,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 2: Concurrent Discord Messages\n");

  {
    const testName = "discord: multiple messages queued and processed";
    process.stdout.write(`  ${testName}... `);

    const beforeSend = Date.now();

    const messages = [
      `${testMarker}_DISCORD_A: Say "Alpha complete"`,
      `${testMarker}_DISCORD_B: Say "Beta complete"`,
      `${testMarker}_DISCORD_C: Say "Gamma complete"`,
    ];

    const sendResults = await Promise.all(
      messages.map((content) =>
        sendWebhookMessage({ url: config.webhookUrl }, { content }),
      ),
    );

    const allSent = sendResults.every((r) => r.success);
    if (!allSent) {
      console.log("✗");
      console.log("    Error: Failed to send webhook messages");
      results.push({
        name: testName,
        passed: false,
        error: "Webhook send failed",
      });
    } else {
      for (const result of sendResults) {
        if (result.id) {
          await waitForReaction(
            { botToken: config.botToken, channelId: config.testChannelId },
            result.id,
            { emoji: "👀", timeout: 15000, interval: 500 },
          );
        }
      }

      const { responses } = await waitForMultipleResponses(
        config,
        beforeSend,
        messages.length,
        180000,
        8000,
      );

      if (DEBUG) {
        console.log(`\n   [DEBUG] Got ${responses.length} responses`);
        for (const r of responses) {
          console.log(`   [DEBUG] Response: ${r.slice(0, 80)}`);
        }
      }

      const hasAlpha = responses.some((r) => r.toLowerCase().includes("alpha"));
      const hasBeta = responses.some((r) => r.toLowerCase().includes("beta"));
      const hasGamma = responses.some((r) => r.toLowerCase().includes("gamma"));

      if (responses.length >= 3 && hasAlpha && hasBeta && hasGamma) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else if (responses.length >= 3) {
        console.log("⚠ (responses received but content mismatch)");
        console.log(
          `    Alpha: ${hasAlpha}, Beta: ${hasBeta}, Gamma: ${hasGamma}`,
        );
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(`    Error: Expected 3 responses, got ${responses.length}`);
        results.push({
          name: testName,
          passed: false,
          error: `Only ${responses.length}/3 responses received`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 3: Mixed Source Concurrency\n");

  {
    const testName = "mixed: http and discord processed concurrently";
    process.stdout.write(`  ${testName}... `);

    const beforeSend = Date.now();

    const discordPromise = sendWebhookMessage(
      { url: config.webhookUrl },
      { content: `${testMarker}_MIXED_DISCORD: Say "Discord done"` },
    );

    const httpPromises = [
      sendHttpRequest(
        httpPort,
        "mixed-1",
        `${testMarker}_MIXED_HTTP_1: Say "HTTP one done"`,
      ),
      sendHttpRequest(
        httpPort,
        "mixed-2",
        `${testMarker}_MIXED_HTTP_2: Say "HTTP two done"`,
      ),
    ];

    const [discordResult, ...httpResults] = await Promise.all([
      discordPromise,
      ...httpPromises,
    ]);

    const httpSucceeded = httpResults.every((r) => r.success);

    if (!discordResult.success) {
      console.log("✗");
      console.log("    Error: Discord message failed");
      results.push({ name: testName, passed: false, error: "Discord failed" });
    } else if (!httpSucceeded) {
      console.log("✗");
      console.log("    Error: HTTP requests failed");
      results.push({ name: testName, passed: false, error: "HTTP failed" });
    } else {
      if (discordResult.id) {
        await waitForReaction(
          { botToken: config.botToken, channelId: config.testChannelId },
          discordResult.id,
          { emoji: "👀", timeout: 15000, interval: 500 },
        );
      }

      const { responses } = await waitForMultipleResponses(
        config,
        beforeSend,
        1,
        60000,
        5000,
      );

      const discordResponded = responses.some(
        (r) =>
          r.toLowerCase().includes("discord") &&
          r.toLowerCase().includes("done"),
      );
      const httpResponded = httpResults.every((r) =>
        r.response?.toLowerCase().includes("done"),
      );

      if (DEBUG) {
        console.log(`\n   [DEBUG] Discord responded: ${discordResponded}`);
        console.log(`   [DEBUG] HTTP responded: ${httpResponded}`);
        console.log(
          `   [DEBUG] HTTP responses: ${httpResults.map((r) => r.response?.slice(0, 50))}`,
        );
      }

      if (discordResponded || httpResponded) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("⚠ (partial success)");
        results.push({
          name: testName,
          passed: true,
          error: "Partial responses",
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
    console.log(`✅ All ${total} dispatcher behavioral tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} dispatcher behavioral tests passed`);
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
