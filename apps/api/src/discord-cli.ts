#!/usr/bin/env bun
/**
 * Discord Bot CLI
 *
 * Starts the Discord bot for testing.
 * Currently only supports echo mode.
 *
 * Usage:
 *   bun run src/discord-cli.ts [options]
 *
 * Options:
 *   --agent-id=X        Custom agent ID (default: deca)
 *   --require-mention   Require @mention to respond
 *   --debounce          Enable message debouncing
 *   --allow-bots        Allow responding to bot messages
 *
 * Environment:
 *   DISCORD_BOT_TOKEN   Bot token (alternative to ~/.deca/credentials/discord.json)
 */

import {
  type CredentialStore,
  createCredentialManager,
  resolvePaths,
} from "@deca/storage";
import { createEchoHandler } from "./channels/discord/echo-handler";
import { createDiscordGateway } from "./channels/discord/gateway";
import type { MessageHandler } from "./channels/discord/types";

// Parse command line arguments
const args = process.argv.slice(2);
const requireMention = args.includes("--require-mention");
const useDebounce = args.includes("--debounce");
const allowBots = args.includes("--allow-bots");
const agentIdArg = args.find((a) => a.startsWith("--agent-id="));
const agentId = agentIdArg ? agentIdArg.split("=")[1] : "deca";

async function loadDiscordToken(): Promise<string> {
  // Check environment variable first
  if (process.env.DISCORD_BOT_TOKEN) {
    return process.env.DISCORD_BOT_TOKEN;
  }

  // Load from credentials file
  const paths = resolvePaths();
  const credentials = createCredentialManager(paths.credentialsDir);

  const discord = await credentials.get<CredentialStore["discord"]>("discord");

  if (!discord?.botToken) {
    console.error("❌ Discord bot token not found.");
    console.error("");
    console.error("Please configure your Discord bot token:");
    console.error("");
    console.error("Option 1: Set environment variable");
    console.error("  export DISCORD_BOT_TOKEN=your-bot-token");
    console.error("");
    console.error("Option 2: Create credentials file");
    console.error("  mkdir -p ~/.deca/credentials");
    console.error(
      '  echo \'{"botToken":"your-bot-token"}\' > ~/.deca/credentials/discord.json',
    );
    console.error("  chmod 600 ~/.deca/credentials/discord.json");
    process.exit(1);
  }

  return discord.botToken;
}

function createHandler(): MessageHandler {
  console.log("📢 Using echo handler");
  return createEchoHandler({
    prefix: "🔊 Echo: ",
    includeSender: true,
    includeChannel: true,
  });
}

async function main() {
  console.log("🚀 Starting Deca Discord Bot...");
  console.log("");

  // Load token
  console.log("🔑 Loading Discord credentials...");
  const token = await loadDiscordToken();
  console.log("   Token loaded successfully");

  // Create handler
  const handler = createHandler();

  // Create gateway
  console.log("");
  console.log("🌐 Connecting to Discord...");

  const gateway = createDiscordGateway({
    token,
    handler,
    agentId,
    requireMention,
    ignoreBots: !allowBots,
    debounce: useDebounce ? { enabled: true, windowMs: 3000 } : undefined,
  });

  // Handle shutdown
  const shutdown = () => {
    console.log("");
    console.log("👋 Shutting down...");
    gateway.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Connect
  try {
    await gateway.connect();

    console.log("");
    console.log("✅ Connected to Discord!");
    console.log(`   Bot: ${gateway.user?.tag}`);
    console.log(`   Guilds: ${gateway.guilds.length}`);
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Require Mention: ${requireMention}`);
    console.log(`   Debounce: ${useDebounce}`);
    console.log("");
    console.log("📭 Listening for messages... (Ctrl+C to stop)");
    console.log("");

    // List guilds
    for (const guild of gateway.guilds) {
      console.log(`   📍 ${guild.name} (${guild.memberCount} members)`);
    }
  } catch (error) {
    console.error("");
    console.error("❌ Failed to connect to Discord:");
    console.error(
      `   ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}

main();
