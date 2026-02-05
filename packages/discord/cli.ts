#!/usr/bin/env bun
/**
 * Discord Standalone CLI
 *
 * Run the Discord gateway in standalone mode with an echo handler.
 * This is useful for testing the Discord connection without the full Deca agent.
 *
 * Usage:
 *   DISCORD_TOKEN=your-token bun run packages/discord/cli.ts
 *   DISCORD_TOKEN=your-token bun run packages/discord/cli.ts --echo --allow-bots --debounce
 *
 * Options:
 *   --echo        Use echo handler (default, responds with message content)
 *   --allow-bots  Process messages from bots/webhooks (for E2E testing)
 *   --debounce    Enable message debouncing (merge rapid consecutive messages)
 */

import { createDiscordGateway, createEchoHandler } from "./src";

// Parse command line arguments
const args = process.argv.slice(2);
const allowBots = args.includes("--allow-bots");
const debounceEnabled = args.includes("--debounce");
// --echo is currently the only mode, but kept for future extensibility

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN environment variable is required");
  console.error("");
  console.error("Usage:");
  console.error("  DISCORD_TOKEN=your-token bun run packages/discord/cli.ts");
  console.error("");
  console.error("Options:");
  console.error("  --echo        Use echo handler (default)");
  console.error("  --allow-bots  Process messages from bots/webhooks");
  console.error("  --debounce    Enable message debouncing");
  process.exit(1);
}

console.log("🤖 Starting Discord standalone mode (echo handler)...");
if (allowBots) {
  console.log("   📡 Bot messages: allowed");
}
if (debounceEnabled) {
  console.log("   ⏱️  Debounce: enabled");
}
console.log("");

const gateway = createDiscordGateway({
  token,
  handler: createEchoHandler(),
  ignoreBots: !allowBots,
  debounce: debounceEnabled
    ? {
        enabled: true,
        windowMs: 3000,
      }
    : undefined,
  events: {
    onConnect: () => {
      console.log(`✅ Connected as ${gateway.user?.tag}`);
      console.log(`📡 Listening in ${gateway.guilds.length} guild(s):`);
      for (const guild of gateway.guilds) {
        console.log(`   - ${guild.name} (${guild.memberCount} members)`);
      }
      console.log("");
      console.log("💬 Send me a message and I'll echo it back!");
      console.log("Press Ctrl+C to stop.\n");
    },
    onDisconnect: (reason) => {
      console.log(`⚠️  Disconnected: ${reason}`);
    },
    onReconnect: (attempts) => {
      console.log(`🔄 Reconnected after ${attempts} attempt(s)`);
    },
    onReconnectFailed: (error) => {
      console.error(`❌ Reconnection failed: ${error.message}`);
    },
    onError: (error) => {
      console.error(`❌ Error: ${error.message}`);
    },
  },
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏳ Shutting down gracefully...");
  await gateway.shutdown();
  console.log("👋 Goodbye!");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n⏳ Received SIGTERM, shutting down...");
  await gateway.shutdown();
  process.exit(0);
});

// Connect
try {
  await gateway.connect();
} catch (error) {
  console.error(`❌ Failed to connect: ${(error as Error).message}`);
  process.exit(1);
}
