#!/usr/bin/env bun
/**
 * Gateway CLI
 *
 * Start the Deca gateway with configured channels.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  - Required for agent
 *   ANTHROPIC_BASE_URL - Custom API base URL (optional)
 *   ANTHROPIC_MODEL    - Custom model ID (optional)
 *   DISCORD_TOKEN      - Discord bot token (optional)
 *   DISCORD_ALLOW_BOTS - Allow bot messages (default: false)
 *   DISCORD_DEBUG_MODE - Show debug messages before processing (default: false)
 *   HTTP_PORT          - HTTP server port (default: 3000)
 *   HTTP_API_KEY       - HTTP API key (optional)
 *   TERMINAL           - Enable terminal REPL (default: false)
 *   ENABLE_MEMORY      - Enable memory system (default: false)
 *   MEMORY_DIR         - Memory storage directory (optional)
 *   WORKSPACE_DIR      - Workspace directory for agent file operations (optional)
 *   ENABLE_CRON        - Enable cron scheduler (default: false)
 *   CRON_STORAGE_PATH  - Cron storage path (optional)
 *   MAIN_CHANNEL_ID    - Main channel ID for debugging (routes to user session)
 *   MAIN_USER_ID       - User ID for unified session across channels
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx bun run packages/gateway/cli.ts
 */

import {
  GatewayLockError,
  type GatewayLockHandle,
  acquireGatewayLock,
  createEchoGateway,
  createGateway,
} from "./src";

// Configuration from environment
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
const anthropicModel = process.env.ANTHROPIC_MODEL;
const discordToken = process.env.DISCORD_TOKEN;
const discordAllowBots = process.env.DISCORD_ALLOW_BOTS === "true";
const discordDebugMode = process.env.DISCORD_DEBUG_MODE === "true";
const httpPort = Number(process.env.HTTP_PORT) || 3000;
const httpApiKey = process.env.HTTP_API_KEY;
const enableTerminal = process.env.TERMINAL === "true";
const echoMode = process.env.ECHO_MODE === "true" || !anthropicApiKey;
const enableMemory = process.env.ENABLE_MEMORY === "true";
const memoryDir = process.env.MEMORY_DIR;
const workspaceDir = process.env.WORKSPACE_DIR;
const enableCron = process.env.ENABLE_CRON === "true";
const cronStoragePath = process.env.CRON_STORAGE_PATH;
const mainChannelId = process.env.MAIN_CHANNEL_ID;
const mainUserId = process.env.MAIN_USER_ID;

console.log("🚀 Starting Deca Gateway...\n");

// Acquire gateway lock to prevent multiple instances
let lockHandle: GatewayLockHandle | null = null;
try {
  lockHandle = await acquireGatewayLock({ httpPort });
} catch (err) {
  if (err instanceof GatewayLockError) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
  throw err;
}

// Determine mode
if (echoMode) {
  console.log("⚠️  Running in ECHO mode (no agent)\n");
  if (!anthropicApiKey) {
    console.log("   Set ANTHROPIC_API_KEY for agent mode\n");
  }
}

// Discord config
const discordConfig = discordToken
  ? {
      token: discordToken,
      ignoreBots: !discordAllowBots,
      debugMode: discordDebugMode,
      mainChannelId,
      mainUserId,
    }
  : undefined;

// Build gateway config
const gateway = echoMode
  ? createEchoGateway({
      discord: discordConfig,
      http: { port: httpPort, apiKey: httpApiKey },
      terminal: enableTerminal ? { enabled: true } : undefined,
      events: {
        onStart: () => console.log("✅ Gateway started (echo mode)"),
        onStop: () => console.log("👋 Gateway stopped"),
        onError: (err, channel) =>
          console.error(`❌ [${channel}] ${err.message}`),
        onMessage: (channel, session) =>
          console.log(`📥 [${channel}] ${session}`),
      },
    })
  : createGateway({
      agent: {
        apiKey: anthropicApiKey as string,
        baseUrl: anthropicBaseUrl,
        model: anthropicModel,
        agentId: "deca",
        enableMemory,
        memoryDir,
        workspaceDir,
        enableCron,
        cronStoragePath,
      },
      discord: discordConfig,
      http: { port: httpPort, apiKey: httpApiKey },
      terminal: enableTerminal ? { enabled: true } : undefined,
      events: {
        onStart: () => console.log("✅ Gateway started"),
        onStop: () => console.log("👋 Gateway stopped"),
        onError: (err, channel) =>
          console.error(`❌ [${channel}] ${err.message}`),
        onMessage: (channel, session) =>
          console.log(`📥 [${channel}] ${session}`),
      },
    });

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏳ Shutting down...");
  await gateway.stop();
  await lockHandle?.release();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await gateway.stop();
  await lockHandle?.release();
  process.exit(0);
});

// Start gateway
try {
  await gateway.start();

  console.log("\nActive channels:");
  for (const channel of gateway.channels) {
    console.log(`  - ${channel}`);
  }

  if (gateway.channels.includes("http")) {
    console.log(`\nHTTP endpoint: http://127.0.0.1:${httpPort}/chat`);
  }

  console.log("\nPress Ctrl+C to stop.\n");
} catch (error) {
  console.error(`❌ Failed to start: ${(error as Error).message}`);
  process.exit(1);
}
