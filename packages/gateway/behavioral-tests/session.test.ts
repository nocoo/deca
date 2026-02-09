#!/usr/bin/env bun

import { existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Clean up session files for specific users before running tests.
 * This ensures a clean slate for each test run.
 */
function cleanupSessionFiles(userIds: string[]): void {
  const sessionDir = join(getGatewayDir(), ".deca", "sessions");

  for (const userId of userIds) {
    const sessionKey = `agent:deca:user:${userId.toLowerCase()}`;
    const filename = `${encodeURIComponent(sessionKey)}.jsonl`;
    const filepath = join(sessionDir, filename);

    if (existsSync(filepath)) {
      try {
        unlinkSync(filepath);
        console.log(`✓ Cleaned session: ${userId}`);
      } catch {
        console.warn(`⚠ Failed to clean session: ${userId}`);
      }
    }
  }
}

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
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

const TEST_DIR = join(process.cwd(), "tmp", "session-tests");

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  if (!creds.botToken || !creds.webhookUrl || !creds.testChannelId) {
    throw new Error("Missing required credentials");
  }

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
  timeout = 60000,
  stabilityWindow = 3000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 2000;

  let lastResponseCount = 0;
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
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

async function sendDiscordAndWait(
  config: Config,
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const beforeSend = Date.now();

  const sendResult = await sendWebhookMessage(
    { url: config.webhookUrl },
    { content: prompt },
  );

  if (!sendResult.success) {
    return { success: false, error: `Webhook failed: ${sendResult.error}` };
  }

  const messageId = sendResult.id ?? "";

  const hasEyes = await waitForReaction(
    { botToken: config.botToken, channelId: config.testChannelId },
    messageId,
    { emoji: "👀", timeout: 15000, interval: 500 },
  );

  if (!hasEyes) {
    return {
      success: false,
      error: "Bot did not acknowledge (no 👀 reaction)",
    };
  }

  const response = await waitForAgentResponse(config, beforeSend, 90000);

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  return { success: true, response };
}

async function sendHttpAndWait(
  port: number,
  userId: string,
  message: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, senderId: userId }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return { success: true, response: data.response };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function startBot(httpPort: number): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    httpPort,
    debug: DEBUG,
  });
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Session Isolation\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  console.log(`✓ Test directory: ${TEST_DIR}`);

  // Clean up session files for test users to ensure a fresh start
  console.log("\n🧹 Cleaning up previous session data...");
  cleanupSessionFiles(["user-A", "user-B"]);

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `SESSION_${Date.now()}`;
  const httpPort = 19800 + Math.floor(Math.random() * 100);

  console.log("\n📡 Starting Agent Bot...");
  let bot = await startBot(httpPort);
  console.log(`✓ Bot started (PID: ${bot.pid}, HTTP: ${httpPort})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 1: HTTP User Isolation Tests\n");

  const userASecret = `${testMarker}_USER_A_SECRET`;
  const userBSecret = `${testMarker}_USER_B_SECRET`;

  {
    const testName = "http: user A sets context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-A",
      `Remember this secret code for me: "${userASecret}". Just confirm you understood.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      console.log("✓");
      if (DEBUG) console.log(`    Response: ${result.response?.slice(0, 100)}`);
      results.push({ name: testName, passed: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "http: user A can recall own context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-A",
      "What is the secret code I told you earlier? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(userASecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(`    Error: Expected "${userASecret}" in response`);
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Context not found: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "http: user B cannot access user A context (isolation)";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-B",
      "What is the secret code? If you don't know any secret code, say 'I don't know any secret code'.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const leakedSecret = response.includes(userASecret);
      const indicatesNoKnowledge =
        response.toLowerCase().includes("don't know") ||
        response.toLowerCase().includes("no secret") ||
        response.toLowerCase().includes("haven't") ||
        response.toLowerCase().includes("not aware") ||
        response.toLowerCase().includes("what secret");

      if (!leakedSecret && indicatesNoKnowledge) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else if (leakedSecret) {
        console.log("✗");
        console.log("    Error: User A secret leaked to User B!");
        results.push({
          name: testName,
          passed: false,
          error: "Session isolation failed - secret leaked",
        });
      } else {
        console.log("⚠ (ambiguous)");
        console.log(`    Response: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: true,
          error: "Ambiguous but no leak detected",
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "http: user B sets own context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-B",
      `Remember this different secret for me: "${userBSecret}". Just confirm.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      console.log("✓");
      results.push({ name: testName, passed: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "http: user B can recall own context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-B",
      "What is MY secret code? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(userBSecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(`    Error: Expected "${userBSecret}" in response`);
        results.push({
          name: testName,
          passed: false,
          error: `Own context not found: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 2: Discord Channel Sharing Tests\n");

  const channelSecret = `${testMarker}_CHANNEL_SECRET`;

  {
    const testName = "discord: set channel context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      `Everyone in this channel should remember: the shared password is "${channelSecret}". Confirm you got it.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      console.log("✓");
      if (DEBUG) console.log(`    Response: ${result.response?.slice(0, 100)}`);
      results.push({ name: testName, passed: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "discord: recall channel context";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "What is the shared password for this channel? Reply with just the password.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(channelSecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(`    Error: Expected "${channelSecret}" in response`);
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Channel context not found: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 3: Session Persistence Tests\n");

  console.log("🛑 Stopping bot for persistence test...");
  await bot.stop();
  console.log("✓ Bot stopped");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n📡 Restarting Agent Bot...");
  bot = await startBot(httpPort);
  console.log(`✓ Bot restarted (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  {
    const testName = "persistence: user A context survives restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      "user-A",
      "What was the secret code I told you before? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(userASecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Session not persisted after restart");
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Session lost: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "persistence: discord channel context survives restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "What was the shared password for this channel? Reply with just the password.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(channelSecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Channel session not persisted after restart");
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Channel session lost: ${response.slice(0, 100)}`,
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
    console.log(`✅ All ${total} session behavioral tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} session behavioral tests passed`);
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
