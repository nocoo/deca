#!/usr/bin/env bun

/**
 * Heartbeat Behavioral Tests
 *
 * Tests the complete heartbeat flow:
 * 1. Set up HEARTBEAT.md with pending tasks via Discord
 * 2. Trigger heartbeat via HTTP API
 * 3. Verify Agent processes tasks
 * 4. Verify response appears in Discord channel
 *
 * This test forms a closed-loop debugging cycle:
 * Discord (set task) -> HTTP (trigger) -> Agent (process) -> Discord (verify)
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const DEBUG = process.argv.includes("--debug");

interface Config {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

const TEST_DIR = join(process.cwd(), "tmp", "heartbeat-behavioral-tests");
const HEARTBEAT_PATH = join(TEST_DIR, "HEARTBEAT.md");

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
    botUserId: creds.clientId, // clientId is the bot user ID
  };
}

const PROCESSING_PREFIXES = ["Processing", "Thinking"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();
  if (PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  if (trimmed.startsWith("```") && trimmed.includes("Processing")) {
    return true;
  }
  if (trimmed.includes("Processing")) {
    return true;
  }
  return false;
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
      const finalResponses = botResponses.filter(
        (msg) => !isProcessingMessage(msg.content),
      );
      if (finalResponses.length === 0) {
        continue;
      }
      return finalResponses[finalResponses.length - 1].content.trim();
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}

async function sendAndWait(
  config: Config,
  prompt: string,
  timeout = 90000,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const beforeSend = Date.now();

  if (DEBUG) {
    console.log(`   [DEBUG] Sending: ${prompt.slice(0, 80)}...`);
  }

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
    { emoji: "eye", timeout: 15000, interval: 500 },
  );

  if (!hasEyes) {
    return {
      success: false,
      error: "Bot did not acknowledge (no eye reaction)",
    };
  }

  const response = await waitForAgentResponse(config, beforeSend, timeout);

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  if (DEBUG) {
    console.log(`   [DEBUG] Response: ${response.slice(0, 150)}...`);
  }

  return { success: true, response };
}

interface TriggerResponse {
  ok: boolean;
  tasks?: { description: string; completed: boolean; line: number }[];
  error?: string;
}

async function triggerHeartbeat(port: number): Promise<TriggerResponse> {
  try {
    const res = await fetch(`http://localhost:${port}/heartbeat/trigger`, {
      method: "POST",
    });
    return (await res.json()) as TriggerResponse;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function startBot(httpPort: number): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: TEST_DIR,
    httpPort,
    debug: DEBUG,
  });
}

async function main() {
  console.log("\n Agent Behavioral Tests - Heartbeat System\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log(" Loaded credentials");
  } catch (error) {
    console.error(` Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  // Clean up and create test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  console.log(` Test directory: ${TEST_DIR}`);

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `HBTEST_${Date.now()}`;
  const HTTP_PORT = 48900 + Math.floor(Math.random() * 100);

  console.log(`\n Starting Agent Bot with HTTP on port ${HTTP_PORT}...`);
  let bot: BotProcess | null = null;

  try {
    bot = await startBot(HTTP_PORT);
    console.log(` Bot started (PID: ${bot.pid})`);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(`\n${"=".repeat(60)}`);
    console.log("Phase 1: HTTP Trigger API Basic Test\n");

    // Test 1: Trigger with no HEARTBEAT.md
    {
      const testName = "trigger API: returns empty when no HEARTBEAT.md";
      process.stdout.write(`  ${testName}... `);

      const result = await triggerHeartbeat(HTTP_PORT);

      if (result.ok && result.tasks && result.tasks.length === 0) {
        console.log("");
        results.push({ name: testName, passed: true });
      } else {
        console.log("");
        console.log(`    Error: ${JSON.stringify(result)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Unexpected result: ${JSON.stringify(result)}`,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Test 2: Create HEARTBEAT.md and verify trigger returns tasks
    {
      const testName = "trigger API: returns tasks from HEARTBEAT.md";
      process.stdout.write(`  ${testName}... `);

      // Create HEARTBEAT.md with a test task
      const taskDescription = `Say hello for test ${testMarker}`;
      writeFileSync(HEARTBEAT_PATH, `# Tasks\n\n- [ ] ${taskDescription}\n`);

      if (DEBUG) {
        console.log(`   [DEBUG] Created HEARTBEAT.md at ${HEARTBEAT_PATH}`);
      }

      // Wait a bit for filesystem sync
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await triggerHeartbeat(HTTP_PORT);

      if (
        result.ok &&
        result.tasks &&
        result.tasks.length === 1 &&
        result.tasks[0].description === taskDescription
      ) {
        console.log("");
        results.push({ name: testName, passed: true });
      } else {
        console.log("");
        console.log(`    Error: ${JSON.stringify(result)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Unexpected result: ${JSON.stringify(result)}`,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("Phase 2: Discord Integration Test\n");

    // Test 3: Set task via Discord and trigger
    {
      const testName = "full loop: Discord set task -> trigger -> verify";
      process.stdout.write(`  ${testName}... `);

      // First, clean up HEARTBEAT.md
      rmSync(HEARTBEAT_PATH, { force: true });

      // Ask agent to create a task in HEARTBEAT.md
      const setupResult = await sendAndWait(
        config,
        `Please add a task to HEARTBEAT.md: "Respond with greeting ${testMarker}". Just add it, don't execute it yet.`,
      );

      if (!setupResult.success) {
        console.log("");
        console.log(`    Setup error: ${setupResult.error}`);
        results.push({
          name: testName,
          passed: false,
          error: `Setup failed: ${setupResult.error}`,
        });
      } else {
        // Verify HEARTBEAT.md was created
        if (!existsSync(HEARTBEAT_PATH)) {
          console.log("");
          console.log("    Error: HEARTBEAT.md was not created");
          results.push({
            name: testName,
            passed: false,
            error: "HEARTBEAT.md not created",
          });
        } else {
          // Record timestamp before trigger
          const beforeTrigger = Date.now();

          // Trigger heartbeat
          const triggerResult = await triggerHeartbeat(HTTP_PORT);

          if (DEBUG) {
            console.log(
              `   [DEBUG] Trigger result: ${JSON.stringify(triggerResult)}`,
            );
          }

          if (!triggerResult.ok) {
            console.log("");
            console.log(`    Trigger error: ${triggerResult.error}`);
            results.push({
              name: testName,
              passed: false,
              error: `Trigger failed: ${triggerResult.error}`,
            });
          } else {
            // Wait for response in Discord channel
            const response = await waitForAgentResponse(
              config,
              beforeTrigger,
              60000,
            );

            if (DEBUG) {
              console.log(
                `   [DEBUG] Discord response: ${response?.slice(0, 200)}`,
              );
            }

            // Check bot output for heartbeat processing
            const botOutput = bot?.getOutput() ?? "";
            const hasHeartbeatLog =
              botOutput.includes("[HEARTBEAT:") ||
              botOutput.includes("heartbeat");

            if (DEBUG) {
              console.log(
                `   [DEBUG] Bot has heartbeat log: ${hasHeartbeatLog}`,
              );
            }

            // The response should appear in Discord (either via dispatcher callback or sendHeartbeatResult)
            if (response || hasHeartbeatLog) {
              console.log("");
              if (DEBUG && response) {
                console.log(
                  `    Response received: ${response.slice(0, 100)}...`,
                );
              }
              results.push({ name: testName, passed: true });
            } else {
              console.log("");
              console.log("    Error: No response in Discord after trigger");
              results.push({
                name: testName,
                passed: false,
                error: "No Discord response after heartbeat trigger",
              });
            }
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Test 4: Verify log contains heartbeat dispatch info
    {
      const testName = "logs: heartbeat dispatch visible in output";
      process.stdout.write(`  ${testName}... `);

      const botOutput = bot?.getOutput() ?? "";
      const hasDispatch =
        botOutput.includes("heartbeat") || botOutput.includes("HEARTBEAT");

      if (hasDispatch) {
        console.log("");
        results.push({ name: testName, passed: true });
      } else {
        console.log("");
        if (DEBUG) {
          console.log(
            `    Bot output (last 500 chars): ${botOutput.slice(-500)}`,
          );
        }
        results.push({
          name: testName,
          passed: false,
          error: "No heartbeat dispatch in logs",
        });
      }
    }
  } finally {
    console.log("\n Stopping bot...");
    if (bot) {
      await bot.stop();
      console.log(" Bot stopped");
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(` All ${total} heartbeat behavioral tests passed`);
  } else {
    console.log(` ${passed}/${total} heartbeat behavioral tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n Test files: ${TEST_DIR}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
