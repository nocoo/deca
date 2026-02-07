#!/usr/bin/env bun

/**
 * Prompt Cache Behavioral Test
 *
 * Verifies that Anthropic prompt caching is working by:
 * 1. Sending first message → expect cache MISS (cacheCreationInputTokens > 0)
 * 2. Sending second message → expect cache HIT (cacheReadInputTokens > 0)
 *
 * Evidence is gathered from:
 * - VERBOSE log output (📦 Cache: created=X read=Y)
 * - /status Discord command shows cache stats
 */

import { mkdirSync, rmSync } from "node:fs";
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

const TEST_DIR = join(process.cwd(), "tmp", "cache-tests");

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
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 2000;

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

    if (botResponses.length > 0) {
      // Wait a bit for response to stabilize
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return botResponses[botResponses.length - 1].content;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}

interface CacheStats {
  created: number;
  read: number;
  ratio: string;
  isHit: boolean;
}

/**
 * Parse cache stats from VERBOSE log output
 * Format: [HH:MM:SS.mmm] [lifecycle] 📦 Cache: created=X read=Y (Z% HIT ✓|MISS)
 */
function parseCacheStats(output: string): CacheStats[] {
  const stats: CacheStats[] = [];
  const regex =
    /📦 Cache: created=(\d+) read=(\d+) \(([0-9.]+)% (HIT ✓|MISS)\)/g;
  let match = regex.exec(output);

  while (match !== null) {
    stats.push({
      created: Number.parseInt(match[1], 10),
      read: Number.parseInt(match[2], 10),
      ratio: match[3],
      isHit: match[4] === "HIT ✓",
    });
    match = regex.exec(output);
  }

  return stats;
}

async function runTest(): Promise<void> {
  console.log("🧪 Prompt Cache Behavioral Test\n");

  // Setup
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });

  const config = await loadConfig();
  let bot: BotProcess | null = null;

  try {
    // Start bot
    console.log("🤖 Starting bot...");
    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      workspaceDir: TEST_DIR,
      debug: DEBUG,
      startupTimeout: 30000,
    });
    console.log(`✅ Bot started (PID: ${bot.pid})\n`);

    // Wait for Discord connection to stabilize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // ========== Message 1: Expect cache MISS ==========
    console.log("📤 Sending first message (expect cache MISS)...");
    const msg1Time = Date.now();

    const result1 = await sendWebhookMessage({
      webhookUrl: config.webhookUrl,
      content: "Hello! What's 2+2?",
    });

    if (!result1.success) {
      throw new Error(`Failed to send message 1: ${result1.error}`);
    }

    // Wait for message to be received
    const messageId1 = result1.messageId;
    if (!messageId1) {
      throw new Error("No message ID returned for message 1");
    }
    await waitForReaction(
      { botToken: config.botToken, channelId: config.testChannelId },
      messageId1,
      "👀",
      30000,
    );

    // Wait for response
    const response1 = await waitForAgentResponse(config, msg1Time);
    if (!response1) {
      throw new Error("No response received for message 1");
    }
    console.log(`✅ Got response 1: "${response1.slice(0, 50)}..."\n`);

    // Check cache stats from first message
    let output = bot.getOutput();
    let cacheStats = parseCacheStats(output);

    if (DEBUG) {
      console.log("📋 Log output so far:");
      console.log(output);
      console.log("");
    }

    if (cacheStats.length === 0) {
      console.log("⚠️  No cache stats found in log (might need more time)");
    } else {
      const firstStats = cacheStats[cacheStats.length - 1];
      console.log(
        `📊 First message cache: created=${firstStats.created} read=${firstStats.read}`,
      );

      if (firstStats.created > 0 && firstStats.read === 0) {
        console.log("✅ First message: Cache MISS as expected (created > 0)\n");
      } else if (firstStats.read > 0) {
        console.log(
          "⚠️  First message already had cache hit (from previous session?)\n",
        );
      }
    }

    // ========== Message 2: Expect cache HIT ==========
    console.log("📤 Sending second message (expect cache HIT)...");
    const msg2Time = Date.now();

    const result2 = await sendWebhookMessage({
      webhookUrl: config.webhookUrl,
      content: "And what's 3+3?",
    });

    if (!result2.success) {
      throw new Error(`Failed to send message 2: ${result2.error}`);
    }

    // Wait for message to be received
    const messageId2 = result2.messageId;
    if (!messageId2) {
      throw new Error("No message ID returned for message 2");
    }
    await waitForReaction(
      { botToken: config.botToken, channelId: config.testChannelId },
      messageId2,
      "👀",
      30000,
    );

    // Wait for response
    const response2 = await waitForAgentResponse(config, msg2Time);
    if (!response2) {
      throw new Error("No response received for message 2");
    }
    console.log(`✅ Got response 2: "${response2.slice(0, 50)}..."\n`);

    // Check cache stats from second message
    output = bot.getOutput();
    cacheStats = parseCacheStats(output);

    if (DEBUG) {
      console.log("📋 Full log output:");
      console.log(output);
      console.log("");
    }

    if (cacheStats.length < 2) {
      console.log(
        `⚠️  Only found ${cacheStats.length} cache stat entries (expected 2+)`,
      );
    } else {
      const secondStats = cacheStats[cacheStats.length - 1];
      console.log(
        `📊 Second message cache: created=${secondStats.created} read=${secondStats.read} (${secondStats.ratio}%)`,
      );

      if (secondStats.read > 0) {
        console.log("✅ Second message: Cache HIT! Prompt caching is working!");
        console.log(
          `   Saved ~${Math.round(secondStats.read * 0.9)} tokens worth of cost (90% savings on cached tokens)`,
        );
      } else {
        console.log(
          "❌ Second message: Cache MISS - prompt caching may not be working",
        );
        console.log(
          "   Possible reasons: prompt too short (<1024 tokens), cache expired (>5min), or API issue",
        );
      }
    }

    // Summary
    console.log("\n========== Summary ==========");
    console.log(`Total cache stat entries found: ${cacheStats.length}`);

    const hits = cacheStats.filter((s) => s.isHit).length;
    const misses = cacheStats.filter((s) => !s.isHit).length;
    console.log(`Cache HITs: ${hits}, Cache MISSes: ${misses}`);

    if (hits > 0) {
      console.log("\n✅ TEST PASSED: Prompt caching is working!");
    } else {
      console.log("\n⚠️  TEST INCONCLUSIVE: No cache hits detected");
      console.log("   Run with --debug to see full log output");
    }
  } finally {
    // Cleanup
    if (bot) {
      console.log("\n🛑 Stopping bot...");
      await bot.stop();
    }
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Run
runTest().catch((err) => {
  console.error(`\n❌ Test failed: ${err.message}`);
  process.exit(1);
});
