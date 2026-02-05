#!/usr/bin/env bun
/**
 * Deca Gateway Server
 *
 * Auto-loads credentials from ~/.deca/credentials/ and starts the gateway.
 *
 * Credentials files:
 *   ~/.deca/credentials/anthropic.json - { "apiKey": "..." }
 *   ~/.deca/credentials/discord.json   - { "botToken": "..." }
 *
 * Environment overrides:
 *   HTTP_PORT         - HTTP server port (default: 3000)
 *   HTTP_API_KEY      - HTTP API key (optional)
 *   TERMINAL          - Enable terminal REPL (default: false)
 *   REQUIRE_MENTION   - Require @mention for Discord (default: true)
 *
 * Usage:
 *   bun run packages/gateway/serve.ts
 */

import { createGateway } from "./src";
import {
  loadAnthropicCredentials,
  loadDiscordCredentials,
} from "./src/e2e/credentials";

// Load credentials
const anthropic = loadAnthropicCredentials();
const discord = loadDiscordCredentials();

// Environment overrides
const httpPort = Number(process.env.HTTP_PORT) || 7014;
const httpApiKey = process.env.HTTP_API_KEY;
const enableTerminal = process.env.TERMINAL === "true";
const requireMention = process.env.REQUIRE_MENTION === "true"; // default: false

console.log("🚀 Starting Deca Gateway...\n");

// Validate credentials
if (!anthropic) {
  console.error("❌ Anthropic credentials not found.");
  console.error("   Create ~/.deca/credentials/anthropic.json with:");
  console.error('   { "apiKey": "sk-ant-..." }\n');
  process.exit(1);
}

console.log("✅ Anthropic credentials loaded");

if (!discord) {
  console.log("⚠️  Discord credentials not found (Discord channel disabled)");
  console.log("   Create ~/.deca/credentials/discord.json to enable\n");
}

// Build gateway config
const gateway = createGateway({
  agent: {
    apiKey: anthropic.apiKey,
    baseUrl: anthropic.baseUrl,
    model: anthropic.models?.default,
    agentId: "deca",
  },
  discord: discord
    ? {
        token: discord.botToken,
        requireMention,
        ignoreBots: true,
        allowlist: discord.guildId ? { guilds: [discord.guildId] } : undefined,
      }
    : undefined,
  http: {
    port: httpPort,
    apiKey: httpApiKey,
  },
  terminal: enableTerminal ? { enabled: true } : undefined,
  events: {
    onStart: () => console.log("✅ Gateway started"),
    onStop: () => console.log("👋 Gateway stopped"),
    onError: (err, channel) => console.error(`❌ [${channel}] ${err.message}`),
    onMessage: (channel, session) => console.log(`📥 [${channel}] ${session}`),
  },
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏳ Shutting down...");
  await gateway.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await gateway.stop();
  process.exit(0);
});

// Start gateway
try {
  await gateway.start();

  console.log("\n📡 Active channels:");
  for (const channel of gateway.channels) {
    if (channel === "discord") {
      const guildInfo = discord?.guildId ? ` guildId: ${discord.guildId}` : "";
      console.log(`  - discord (requireMention: ${requireMention}${guildInfo})`);
    } else {
      console.log(`  - ${channel}`);
    }
  }

  if (gateway.channels.includes("http")) {
    console.log(`\n🌐 HTTP endpoint: http://127.0.0.1:${httpPort}/chat`);
  }

  console.log("\nPress Ctrl+C to stop.\n");
} catch (error) {
  console.error(`❌ Failed to start: ${(error as Error).message}`);
  process.exit(1);
}
