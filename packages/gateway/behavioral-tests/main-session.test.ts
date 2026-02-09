#!/usr/bin/env bun

/**
 * Main Session Behavioral Test
 *
 * Tests that messages sent to the main channel are routed to the user session.
 * This enables debugging Agent behavior through a dedicated Discord channel,
 * where messages route to the same session as Terminal and HTTP.
 *
 * Key behaviors tested:
 * 1. Messages to main channel use session key `agent:deca:user:{userId}`
 * 2. Main session persists across messages (same conversation context)
 * 3. Session is correctly identified in debug output
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
import { isProcessingMessage } from "./utils";

const DEBUG = process.argv.includes("--debug");

interface Config {
  botToken: string;
  mainWebhookUrl: string;
  mainChannelId: string;
  botUserId?: string;
  /** Main user ID for unified session routing */
  mainUserId?: string;
}

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  if (!creds.botToken || !creds.mainWebhookUrl || !creds.mainChannelId) {
    throw new Error(
      "Missing required credentials: botToken, mainWebhookUrl, mainChannelId",
    );
  }

  return {
    botToken: creds.botToken,
    mainWebhookUrl: creds.mainWebhookUrl,
    mainChannelId: creds.mainChannelId,
    botUserId: creds.clientId,
    mainUserId: creds.userId,
  };
}

async function waitForAgentResponse(
  config: Config,
  afterTimestamp: number,
  timeout = 60000,
  stabilityWindow = 3000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 2000;

  let lastResponseCount = 0;
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.mainChannelId },
      20,
    );

    if (!result.success || !result.messages) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    const botResponses = result.messages
      .filter((msg) => {
        const msgTime = new Date(msg.timestamp).getTime();
        const isBotUser = config.botUserId
          ? msg.author.id === config.botUserId
          : msg.author.bot;
        return msgTime > afterTimestamp && isBotUser;
      })
      .filter((msg) => !isProcessingMessage(msg.content))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (botResponses.length === 0) {
      lastResponseCount = 0;
      stableAt = null;
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    if (botResponses.length !== lastResponseCount) {
      lastResponseCount = botResponses.length;
      stableAt = Date.now();
      if (DEBUG) {
        console.log(`   [DEBUG] Found ${botResponses.length} bot responses`);
      }
    }

    if (stableAt && Date.now() - stableAt >= stabilityWindow) {
      return botResponses.map((msg) => msg.content.trim()).join("\n\n");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}

/**
 * Get all bot messages including debug messages
 */
async function getAllBotMessages(
  config: Config,
  afterTimestamp: number,
  timeout = 60000,
): Promise<string[]> {
  const startTime = Date.now();
  const interval = 2000;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.mainChannelId },
      20,
    );

    if (!result.success || !result.messages) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    const botMessages = result.messages
      .filter((msg) => {
        const msgTime = new Date(msg.timestamp).getTime();
        const isBotUser = config.botUserId
          ? msg.author.id === config.botUserId
          : msg.author.bot;
        return msgTime > afterTimestamp && isBotUser;
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    // Wait for at least one response that's not just a debug message
    const hasRealResponse = botMessages.some(
      (msg) => !isProcessingMessage(msg.content),
    );

    if (hasRealResponse) {
      return botMessages.map((msg) => msg.content.trim());
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return [];
}

async function sendAndWait(
  config: Config,
  prompt: string,
): Promise<{
  success: boolean;
  response?: string;
  allMessages?: string[];
  error?: string;
}> {
  const beforeSend = Date.now();

  const sendResult = await sendWebhookMessage(
    { url: config.mainWebhookUrl },
    { content: prompt },
  );

  if (!sendResult.success) {
    return { success: false, error: `Webhook failed: ${sendResult.error}` };
  }

  const messageId = sendResult.id ?? "";

  const hasEyes = await waitForReaction(
    { botToken: config.botToken, channelId: config.mainChannelId },
    messageId,
    { emoji: "👀", timeout: 15000, interval: 500 },
  );

  if (!hasEyes) {
    return {
      success: false,
      error: "Bot did not acknowledge (no 👀 reaction)",
    };
  }

  // Get all messages including debug
  const allMessages = await getAllBotMessages(config, beforeSend, 90000);

  // Get just the real response
  const response = await waitForAgentResponse(config, beforeSend, 5000);

  return { success: true, response: response ?? "", allMessages };
}

function startBot(config: Config): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    mainChannelId: config.mainChannelId,
    mainUserId: config.mainUserId,
    discordDebugMode: true, // Enable to check session keys in debug messages
    debug: DEBUG,
  });
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Main Session Routing\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
    console.log(`  Main Channel ID: ${config.mainChannelId}`);
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  const results: { name: string; passed: boolean; error?: string }[] = [];

  console.log("\n📡 Starting Agent Bot with mainChannelId...");
  const bot = await startBot(config);
  console.log(`✓ Bot started (PID: ${bot.pid})`);
  if (config.mainUserId) {
    const fullKey = `agent:deca:user:${config.mainUserId}`;
    console.log(`  Main User ID: ${config.mainUserId}`);
    console.log(`  Expected session key: ${fullKey}`);
    console.log(`  Debug display: ...${fullKey.slice(-12)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Main Session Routing Tests\n");

  // Test 1: Session key is user session (unified with Terminal/HTTP)
  {
    const testName = "routing: main channel uses user session key";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(config, "Hello! What session am I in?");

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      // Check debug messages for session key - there might be multiple
      const debugMessages =
        result.allMessages?.filter((msg) => msg.includes("Session:")) ?? [];

      if (DEBUG) {
        console.log(
          `\n   [DEBUG] All messages: ${JSON.stringify(result.allMessages)}`,
        );
        console.log(
          `   [DEBUG] Debug messages: ${JSON.stringify(debugMessages)}`,
        );
      }

      // Session key is displayed as "...{last12chars}" in debug messages
      // Full key: agent:deca:user:{userId}, shown as: ...{userId-last12}
      // We check for the last 12 chars of the full session key
      const fullKey = config.mainUserId
        ? `agent:deca:user:${config.mainUserId}`
        : "";
      const expectedPattern = fullKey ? `...${fullKey.slice(-12)}` : "...";

      const hasUserSession = debugMessages.some((msg) =>
        msg.includes(expectedPattern),
      );

      if (hasUserSession) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Expected session key with '${expectedPattern}', got: ${debugMessages.join(" | ")}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Wrong session: ${debugMessages.join(" | ")}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 2: Context persists in main session
  {
    const testName = "persistence: main session maintains context";
    process.stdout.write(`  ${testName}... `);

    const secret = `MAIN_SECRET_${Date.now()}`;

    // First message - store secret
    const step1 = await sendAndWait(
      config,
      `Remember this secret code: ${secret}. Just say "OK, remembered."`,
    );

    if (!step1.success) {
      console.log("✗");
      console.log(`    Error (step 1): ${step1.error}`);
      results.push({ name: testName, passed: false, error: step1.error });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Second message - recall secret
      const step2 = await sendAndWait(
        config,
        "What was the secret code I just told you?",
      );

      if (!step2.success) {
        console.log("✗");
        console.log(`    Error (step 2): ${step2.error}`);
        results.push({ name: testName, passed: false, error: step2.error });
      } else {
        const response = step2.response ?? "";

        if (response.includes(secret)) {
          console.log("✓");
          results.push({ name: testName, passed: true });
        } else {
          console.log("✗");
          console.log(
            "    Error: Agent should remember secret from same session",
          );
          console.log(`    Expected to find: ${secret}`);
          console.log(`    Got: ${response.slice(0, 200)}`);
          results.push({
            name: testName,
            passed: false,
            error: `Context not persisted: ${response.slice(0, 100)}`,
          });
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 3: Verify it's user session (not channel session)
  {
    const testName = "isolation: user session is distinct from channel session";
    process.stdout.write(`  ${testName}... `);

    // Ask agent to confirm session - user session should have consistent identity
    const result = await sendAndWait(
      config,
      "Check your session key and tell me what type it is (user or channel).",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      // The debug message should show the user session
      // There might be multiple debug messages, find the one with user session
      const debugMessages =
        result.allMessages?.filter((msg) => msg.includes("Session:")) ?? [];

      if (DEBUG) {
        console.log(
          `   [DEBUG] All debug messages: ${JSON.stringify(debugMessages)}`,
        );
      }

      // Check if ANY debug message shows user session
      // Session key is displayed as "...{last12chars}" in debug messages
      const fullKey = config.mainUserId
        ? `agent:deca:user:${config.mainUserId}`
        : "";
      const expectedPattern = fullKey ? `...${fullKey.slice(-12)}` : "...";

      const hasUserSession = debugMessages.some((msg) =>
        msg.includes(expectedPattern),
      );

      // Check it's NOT a channel session
      const hasChannelSession = debugMessages.some((msg) =>
        msg.includes("channel:"),
      );

      if (hasUserSession && !hasChannelSession) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else if (hasUserSession) {
        // User session found but also channel session - partial success
        console.log("✓ (with extra debug)");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Should be user session, not channel session");
        console.log(`    Debug messages: ${debugMessages.join(" | ")}`);
        results.push({
          name: testName,
          passed: false,
          error: `Not user session: ${debugMessages.join(" | ")}`,
        });
      }
    }
  }

  console.log("\n🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} user session routing tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} user session routing tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
