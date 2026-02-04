#!/usr/bin/env bun
/**
 * Discord Bot CLI
 *
 * Starts the Discord bot with @deca/agent integration.
 *
 * Usage:
 *   bun run src/discord-cli.ts [options]
 *
 * Options:
 *   --echo          Use echo handler instead of agent (for testing)
 *   --agent-id=X    Custom agent ID (default: deca)
 *   --require-mention   Require @mention to respond
 *
 * Environment:
 *   DISCORD_BOT_TOKEN   Bot token (alternative to ~/.deca/credentials/discord.json)
 */

import { Agent, type AgentConfig } from "@deca/agent";
import {
  type CredentialStore,
  createCredentialManager,
  resolvePaths,
} from "@deca/storage";
import { createDiscordAgentAdapter } from "./adapters/discord-agent-adapter";
import { createEchoHandler } from "./channels/discord/echo-handler";
import { createDiscordGateway } from "./channels/discord/gateway";
import type { MessageHandler } from "./channels/discord/types";

// Parse command line arguments
const args = process.argv.slice(2);
const useEcho = args.includes("--echo");
const requireMention = args.includes("--require-mention");
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

async function loadAnthropicCredentials(): Promise<{
  apiKey: string;
  baseUrl?: string;
}> {
  const paths = resolvePaths();
  const credentials = createCredentialManager(paths.credentialsDir);

  const anthropic =
    await credentials.get<CredentialStore["anthropic"]>("anthropic");

  if (!anthropic?.apiKey) {
    console.error("❌ Anthropic API key not found.");
    console.error("");
    console.error("Please configure your Anthropic API key:");
    console.error("  mkdir -p ~/.deca/credentials");
    console.error(
      '  echo \'{"apiKey":"your-api-key"}\' > ~/.deca/credentials/anthropic.json',
    );
    console.error("  chmod 600 ~/.deca/credentials/anthropic.json");
    process.exit(1);
  }

  return {
    apiKey: anthropic.apiKey,
    baseUrl: anthropic.baseUrl,
  };
}

async function createHandler(): Promise<MessageHandler> {
  if (useEcho) {
    console.log("📢 Using echo handler (test mode)");
    return createEchoHandler({
      prefix: "🔊 Echo: ",
      includeSender: true,
      includeChannel: true,
    });
  }

  // Load Anthropic credentials and create agent
  console.log("🤖 Loading agent...");
  const anthropic = await loadAnthropicCredentials();

  const agentConfig: AgentConfig = {
    model: process.env.DECA_MODEL || "claude-sonnet-4-20250514",
    provider: {
      apiKey: anthropic.apiKey,
      baseUrl: anthropic.baseUrl,
    },
  };

  const agent = new Agent(agentConfig);
  console.log(`   Model: ${agentConfig.model}`);

  return createDiscordAgentAdapter({
    agent,
    systemPrompt: `You are a helpful Discord bot named Deca. 
You are friendly, concise, and helpful.
Keep responses brief and to the point, as Discord has a 2000 character limit per message.
Use markdown formatting when appropriate.`,
    includeContext: true,
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
  const handler = await createHandler();

  // Create gateway
  console.log("");
  console.log("🌐 Connecting to Discord...");

  const gateway = createDiscordGateway({
    token,
    handler,
    agentId,
    requireMention,
    ignoreBots: true,
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
