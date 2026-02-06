#!/usr/bin/env bun
/**
 * Deca Gateway Server
 *
 * Auto-loads credentials from ~/.deca/credentials/ and starts the gateway.
 *
 * Credentials files:
 *   ~/.deca/credentials/anthropic.json - { "apiKey": "..." }
 *   ~/.deca/credentials/minimax.json   - { "apiKey": "...", "baseUrl": "..." }
 *   ~/.deca/credentials/discord.json   - { "botToken": "..." }
 *
 * Provider selection (in priority order):
 *   1. DECA_PROVIDER env var (e.g., DECA_PROVIDER=minimax)
 *   2. config.activeProvider in ~/.deca/config.json
 *   3. First available provider credential
 *
 * Environment overrides:
 *   HTTP_PORT         - HTTP server port (default: 7014)
 *   HTTP_API_KEY      - HTTP API key (optional)
 *   TERMINAL          - Enable terminal REPL (default: false)
 *   REQUIRE_MENTION   - Require @mention for Discord (default: false)
 *
 * Usage:
 *   bun run packages/gateway/serve.ts
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onAgentEvent } from "@deca/agent";
import {
  createConfigManager,
  createCredentialManager,
  createProviderResolver,
  resolvePaths,
} from "@deca/storage";
import { createGateway } from "./src";
import { loadDiscordCredentials } from "./src/e2e/credentials";
import {
  GatewayLockError,
  type GatewayLockHandle,
  acquireGatewayLock,
} from "./src/lock";

// Resolve directories (relative to this file)
const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(__dirname, "..", "..", "prompts");
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

// Environment overrides
const httpPort = Number(process.env.HTTP_PORT) || 7014;
const httpApiKey = process.env.HTTP_API_KEY;
const enableTerminal = process.env.TERMINAL === "true";
const requireMention = process.env.REQUIRE_MENTION === "true";

console.log("🚀 Starting Deca Gateway...\n");

const verbose = process.env.VERBOSE === "true";
if (verbose) {
  onAgentEvent((evt) => {
    const time = new Date(evt.ts).toISOString().slice(11, 23);
    const prefix = `[${time}] [${evt.stream}]`;

    if (evt.stream === "tool") {
      const data = evt.data as {
        phase: string;
        name: string;
        input?: unknown;
        output?: string;
      };
      if (data.phase === "start") {
        const inputStr = JSON.stringify(data.input ?? {}).slice(0, 100);
        console.log(`${prefix} 🔧 ${data.name}(${inputStr})`);
      } else if (data.phase === "end") {
        const output = (data.output ?? "").slice(0, 200);
        console.log(`${prefix} ✅ ${data.name} → ${output}`);
      }
    } else if (evt.stream === "lifecycle") {
      const data = evt.data as {
        phase: string;
        turns?: number;
        toolCalls?: number;
      };
      if (data.phase === "start") {
        console.log(`${prefix} ▶️  Run started`);
      } else if (data.phase === "end") {
        console.log(
          `${prefix} ⏹️  Run ended (turns: ${data.turns}, tools: ${data.toolCalls})`,
        );
      }
    } else if (evt.stream === "error") {
      console.log(`${prefix} ❌ Error: ${JSON.stringify(evt.data)}`);
    }
  });
  console.log("📝 Verbose logging enabled (VERBOSE=true)\n");
}

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

if (!provider) {
  console.error("❌ No LLM provider credentials found.");
  console.error("   Create ~/.deca/credentials/<provider>.json with:");
  console.error('   { "apiKey": "sk-..." }\n');
  console.error("   Supported providers: glm, minimax\n");
  process.exit(1);
}

console.log(`✅ Provider loaded: ${provider.id} (model: ${provider.model})`);

if (!discord) {
  console.log("⚠️  Discord credentials not found (Discord channel disabled)");
  console.log("   Create ~/.deca/credentials/discord.json to enable\n");
}

// Build gateway config
const gateway = createGateway({
  agent: {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: provider.model,
    agentId: "tomato",
    promptDir: promptsDir,
    workspaceDir: workspaceDir,
  },
  discord: discord
    ? {
        token: discord.botToken,
        clientId: discord.clientId,
        guildId: discord.guildId,
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

  console.log("\n📡 Active channels:");
  for (const channel of gateway.channels) {
    if (channel === "discord") {
      const guildInfo = discord?.guildId ? ` guildId: ${discord.guildId}` : "";
      console.log(
        `  - discord (requireMention: ${requireMention}${guildInfo})`,
      );
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
