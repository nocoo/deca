#!/usr/bin/env bun

/**
 * Test: Proactive Search Behavior
 *
 * Verifies that the Agent proactively uses search when asked about
 * information it cannot know from training data (e.g., "Opus 4.6")
 */

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

interface Config {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);
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
  timeout = 120000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 3000;
  const stabilityWindow = 8000;
  let lastContent = "";
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      30,
    );

    if (!result.success || !result.messages) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    const botResponses = result.messages
      .filter((msg) => {
        const msgTime = new Date(msg.timestamp).getTime();
        // Must be from our bot (tomato), not webhook (E2E Tester, Captain Hook)
        const isTomato = msg.author.username === "tomato";
        return msgTime > afterTimestamp && isTomato;
      })
      .filter((msg) => !msg.content.includes("⏳"))
      .filter((msg) => !msg.content.startsWith("🔧"))
      .filter((msg) => !msg.content.startsWith("✅ exec"))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (botResponses.length > 0) {
      const content = botResponses
        .map((msg) => msg.content.trim())
        .join("\n\n");
      if (content !== lastContent) {
        lastContent = content;
        stableAt = Date.now();
      } else if (stableAt && Date.now() - stableAt >= stabilityWindow) {
        return content;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return lastContent || null;
}

async function main() {
  console.log("🧪 Proactive Search Test\n");

  const config = await loadConfig();
  console.log("✓ Loaded credentials");

  console.log("\n📡 Starting Agent Bot...");
  const bot = await spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    debug: true,
  });
  console.log(`✓ Bot started (PID: ${bot.pid})`);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test: Ask about something the Agent cannot know
  const testPrompt = "你知道 Opus 4.6 吗？它有什么新特性？";
  console.log(`\n📤 Sending: "${testPrompt}"`);

  const beforeSend = Date.now();
  const sendResult = await sendWebhookMessage(
    { url: config.webhookUrl },
    { content: testPrompt },
  );

  if (!sendResult.success) {
    console.error(`✗ Webhook failed: ${sendResult.error}`);
    await bot.stop();
    process.exit(1);
  }

  const messageId = sendResult.id ?? "";
  console.log(`✓ Message sent (ID: ${messageId})`);

  // Wait for acknowledgment
  const hasEyes = await waitForReaction(
    { botToken: config.botToken, channelId: config.testChannelId },
    messageId,
    { emoji: "👀", timeout: 30000, interval: 500 },
  );

  if (!hasEyes) {
    console.error("✗ Bot did not acknowledge (no 👀 reaction)");
    await bot.stop();
    process.exit(1);
  }
  console.log("✓ Bot acknowledged (👀)");

  // Wait for response
  console.log("\n⏳ Waiting for response (up to 2 minutes)...");
  const response = await waitForAgentResponse(config, beforeSend, 120000);

  if (!response) {
    console.error("✗ No response from agent");
    await bot.stop();
    process.exit(1);
  }

  console.log("\n📥 Response received:");
  console.log("─".repeat(60));
  console.log(response);
  console.log("─".repeat(60));

  // Analyze response
  const lower = response.toLowerCase();

  // Signs that Agent searched
  const searchIndicators = [
    "搜索",
    "查询",
    "search",
    "tavily",
    "找到",
    "结果",
    "根据",
    "显示",
    "资料",
    "信息",
    "2024",
    "2025",
    "2026",
    "anthropic",
    "claude",
  ];

  // Signs that Agent guessed (bad)
  const guessIndicators = [
    "我不知道",
    "没有信息",
    "不了解",
    "不清楚",
    "无法确认",
    "我的知识",
    "训练数据",
  ];

  const hasSearchIndicators = searchIndicators.some((ind) =>
    lower.includes(ind),
  );
  const hasGuessIndicators = guessIndicators.some((ind) => lower.includes(ind));

  console.log("\n📊 Analysis:");
  console.log(`  Search indicators found: ${hasSearchIndicators}`);
  console.log(`  Guess indicators found: ${hasGuessIndicators}`);

  // Check if response contains actual search results
  const hasActualInfo =
    lower.includes("opus") &&
    (lower.includes("model") ||
      lower.includes("模型") ||
      lower.includes("版本") ||
      lower.includes("发布") ||
      lower.includes("特性") ||
      lower.includes("功能"));

  console.log(`  Contains actual info about Opus: ${hasActualInfo}`);

  await bot.stop();
  console.log("\n🛑 Bot stopped");

  if (hasSearchIndicators && hasActualInfo) {
    console.log("\n✅ TEST PASSED: Agent proactively searched for information");
    process.exit(0);
  } else if (hasGuessIndicators) {
    console.log(
      "\n⚠️ TEST PARTIAL: Agent admitted not knowing but may not have searched",
    );
    process.exit(1);
  } else {
    console.log("\n❌ TEST FAILED: Agent did not search and may have guessed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
