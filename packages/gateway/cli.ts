#!/usr/bin/env bun
/**
 * Gateway CLI
 *
 * Start the Deca gateway with configured channels.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Required for agent
 *   DISCORD_TOKEN     - Discord bot token (optional)
 *   DISCORD_ALLOW_BOTS - Allow bot messages (default: false)
 *   HTTP_PORT         - HTTP server port (default: 3000)
 *   HTTP_API_KEY      - HTTP API key (optional)
 *   TERMINAL          - Enable terminal REPL (default: false)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx bun run packages/gateway/cli.ts
 */

import { createGateway, createEchoGateway } from "./src";

// Configuration from environment
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const discordToken = process.env.DISCORD_TOKEN;
const discordAllowBots = process.env.DISCORD_ALLOW_BOTS === "true";
const httpPort = Number(process.env.HTTP_PORT) || 3000;
const httpApiKey = process.env.HTTP_API_KEY;
const enableTerminal = process.env.TERMINAL === "true";
const echoMode = process.env.ECHO_MODE === "true" || !anthropicApiKey;

console.log("🚀 Starting Deca Gateway...\n");

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
        onError: (err, channel) => console.error(`❌ [${channel}] ${err.message}`),
        onMessage: (channel, session) => console.log(`📥 [${channel}] ${session}`),
      },
    })
  : createGateway({
      agent: {
        apiKey: anthropicApiKey as string,
        agentId: "deca",
      },
      discord: discordConfig,
      http: { port: httpPort, apiKey: httpApiKey },
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
