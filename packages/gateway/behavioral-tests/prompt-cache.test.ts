#!/usr/bin/env bun

/**
 * Prompt Cache Behavioral Test
 *
 * Verifies that Anthropic prompt caching is working by:
 * 1. Sending first message → expect cache MISS (cacheCreationInputTokens > 0)
 * 2. Sending second message → expect cache HIT (cacheReadInputTokens > 0)
 *
 * Uses HTTP API for simplicity and reliability.
 * Evidence is gathered from captured stdout (VERBOSE logging).
 */

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  type BotProcess,
  getGatewayDir,
  spawnBot,
} from "@deca/discord/e2e/spawner";

const DEBUG = process.argv.includes("--debug");
const TEST_DIR = join(process.cwd(), "tmp", "cache-tests");
const HTTP_PORT = 7099; // Use unique port to avoid conflicts

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

async function sendHttpMessage(
  message: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${HTTP_PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, senderId: "cache-test" }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      success: boolean;
      response: string;
      error?: string;
    };

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return { success: true, response: data.response };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTest(): Promise<void> {
  console.log("🧪 Prompt Cache Behavioral Test\n");

  // Setup
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });

  let bot: BotProcess | null = null;

  try {
    // Start bot
    console.log("🤖 Starting bot...");
    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      workspaceDir: TEST_DIR,
      httpPort: HTTP_PORT,
      debug: DEBUG,
      startupTimeout: 30000,
    });
    console.log(`✅ Bot started (PID: ${bot.pid})\n`);

    // Wait for HTTP server to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ========== Message 1: Expect cache MISS ==========
    console.log("📤 Sending first message (expect cache MISS)...");

    const result1 = await sendHttpMessage("Hello! What's 2+2?");

    if (!result1.success) {
      throw new Error(`Failed to send message 1: ${result1.error}`);
    }
    console.log(`✅ Got response 1: "${result1.response?.slice(0, 50)}..."\n`);

    // Wait for logs to flush
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check cache stats
    let output = bot.getOutput();
    let cacheStats = parseCacheStats(output);

    if (DEBUG) {
      console.log("📋 Log output after msg 1:");
      console.log(output);
      console.log("");
    }

    if (cacheStats.length === 0) {
      console.log("⚠️  No cache stats found yet");
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

    const result2 = await sendHttpMessage("And what's 3+3?");

    if (!result2.success) {
      throw new Error(`Failed to send message 2: ${result2.error}`);
    }
    console.log(`✅ Got response 2: "${result2.response?.slice(0, 50)}..."\n`);

    // Wait for logs to flush
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check cache stats
    output = bot.getOutput();
    cacheStats = parseCacheStats(output);

    if (DEBUG) {
      console.log("📋 Full log output:");
      console.log(output);
      console.log("");
    }

    // Summary
    console.log("========== Summary ==========");
    console.log(`Total cache stat entries found: ${cacheStats.length}`);

    if (cacheStats.length >= 2) {
      const secondStats = cacheStats[cacheStats.length - 1];
      console.log(
        `📊 Second message: created=${secondStats.created} read=${secondStats.read} (${secondStats.ratio}%)`,
      );

      if (secondStats.read > 0) {
        console.log("\n✅ TEST PASSED: Prompt caching is working!");
        console.log(
          `   Saved ~${Math.round(secondStats.read * 0.9)} tokens worth of cost (90% savings)`,
        );
      } else {
        console.log("\n❌ TEST FAILED: Cache MISS on second message");
        console.log(
          "   Possible reasons: prompt < 1024 tokens, cache expired, or API issue",
        );
      }
    } else if (cacheStats.length === 0) {
      console.log("\n⚠️  TEST INCONCLUSIVE: No cache stats in logs");
      console.log("   Check if VERBOSE=true is set and gateway is logging");
    } else {
      console.log("\n⚠️  TEST INCONCLUSIVE: Only one cache entry found");
    }

    const hits = cacheStats.filter((s) => s.isHit).length;
    const misses = cacheStats.filter((s) => !s.isHit).length;
    console.log(`\nCache HITs: ${hits}, Cache MISSes: ${misses}`);
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
