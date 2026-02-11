#!/usr/bin/env bun
/**
 * Debug script for testing slash commands integration
 *
 * This script:
 * 1. Starts the gateway with slash commands enabled
 * 2. Sends a test message via webhook
 * 3. Waits for bot response
 * 4. Logs the result
 *
 * Usage:
 *   bun run packages/gateway/debug-slash-commands.ts
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConfigManager,
  createCredentialManager,
  createProviderResolver,
  resolvePaths,
} from "@deca/storage";
import { createGateway } from "./src";
import { loadDiscordCredentials } from "./src/e2e/credentials";

const {
  createTestMessage,
  fetchChannelMessages,
  generateTestId,
  sendWebhookMessage,
  waitForBotResponse,
} = await import("../discord/src/e2e/index");

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = join(__dirname, "..", "..", "workspace");

const paths = resolvePaths();
const configManager = createConfigManager(paths.configPath);
const credentialManager = createCredentialManager(paths.credentialsDir);
const providerResolver = createProviderResolver(
  configManager,
  credentialManager,
);

const provider = await providerResolver.resolve();
const discord = loadDiscordCredentials();

if (!provider) {
  console.error("❌ No LLM provider credentials found.");
  process.exit(1);
}

if (!discord) {
  console.error("❌ Discord credentials not found.");
  process.exit(1);
}

if (!discord.botApplicationId) {
  console.error("❌ Discord botApplicationId not found in credentials.");
  process.exit(1);
}

const testServer = discord.servers?.test;
if (!testServer?.testChannelWebhookUrl || !testServer?.testChannelId) {
  console.error(
    "❌ Discord servers.test.testChannelWebhookUrl or testChannelId not found.",
  );
  process.exit(1);
}

// Collect all guild IDs from servers config
const allGuildIds = discord.servers
  ? [discord.servers.production?.guildId, discord.servers.test?.guildId].filter(
      (id): id is string => !!id,
    )
  : [];

console.log("🚀 Starting Gateway with Slash Commands...\n");
console.log(`  Provider: ${provider.id} (${provider.model})`);
console.log(`  Discord botApplicationId: ${discord.botApplicationId}`);
console.log(
  `  Discord guildIds: ${allGuildIds.length > 0 ? allGuildIds.join(", ") : "(global)"}`,
);
console.log("");

const gateway = createGateway({
  agent: {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: provider.model,
    agentId: "tomato",
    workspaceDir: workspaceDir,
  },
  discord: {
    token: discord.botToken,
    botApplicationId: discord.botApplicationId,
    guildIds: allGuildIds.length > 0 ? allGuildIds : undefined,
    requireMention: false,
    ignoreBots: false,
    allowlist: allGuildIds.length > 0 ? { guilds: allGuildIds } : undefined,
  },
  events: {
    onStart: () => console.log("✅ Gateway started"),
    onStop: () => console.log("👋 Gateway stopped"),
    onError: (err, channel) => console.error(`❌ [${channel}] ${err.message}`),
    onMessage: (channel, session) => console.log(`📥 [${channel}] ${session}`),
  },
});

try {
  await gateway.start();
  console.log("\n📡 Gateway is running with slash commands enabled!");
  console.log("   Commands registered: /ask, /clear, /status\n");

  // Give Discord time to process command registration
  console.log("⏳ Waiting 2 seconds for command registration...");
  await new Promise((r) => setTimeout(r, 2000));

  // Test: Send a message via webhook
  console.log("\n📤 Sending test message via webhook...");
  const testId = generateTestId();
  const testContent = "Hello! What is 2 + 2?";
  const message = createTestMessage(testId, testContent);

  const sendResult = await sendWebhookMessage(
    { url: testServer.testChannelWebhookUrl },
    { content: message },
  );

  if (!sendResult.success) {
    console.error(`❌ Failed to send webhook message: ${sendResult.error}`);
  } else {
    console.log(`✅ Message sent (ID: ${sendResult.id})`);
    console.log(`   Content: ${message}\n`);

    // Wait for bot response
    console.log("⏳ Waiting for bot response (timeout: 30s)...");
    const response = await waitForBotResponse(
      { botToken: discord.botToken, channelId: testServer.testChannelId },
      testId,
      { timeout: 30000, interval: 1000, botUserId: discord.botApplicationId },
    );

    if (response) {
      console.log("\n✅ Bot responded!");
      console.log(`   Author: ${response.author.username}`);
      console.log(`   Content: ${response.content.slice(0, 200)}...`);
    } else {
      console.log("\n⚠️  No bot response received within timeout.");

      // Fetch recent messages for debugging
      console.log("\n📋 Recent channel messages:");
      const msgs = await fetchChannelMessages(
        { botToken: discord.botToken, channelId: testServer.testChannelId },
        5,
      );
      for (const m of msgs.messages) {
        console.log(
          `   [${m.author.bot ? "BOT" : "USER"}] ${m.author.username}: ${m.content.slice(0, 80)}...`,
        );
      }
    }
  }

  // Keep running for manual testing
  console.log("\n🔄 Gateway continues running. Press Ctrl+C to stop.");
  console.log("   You can test slash commands in Discord now!\n");

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n⏳ Shutting down...");
    await gateway.stop();
    process.exit(0);
  });
} catch (error) {
  console.error(`❌ Error: ${(error as Error).message}`);
  await gateway.stop();
  process.exit(1);
}
