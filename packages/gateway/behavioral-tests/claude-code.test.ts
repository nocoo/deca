#!/usr/bin/env bun

/**
 * Behavioral Test: claude_code tool
 *
 * Tests that the agent can delegate complex tasks to Claude Code CLI.
 * Scenario: Tasks that require web fetching or complex reasoning
 * that the base agent cannot handle directly.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

interface TestCase {
  name: string;
  setup?: () => Promise<void>;
  prompt: string;
  validate: (response: string) => Promise<{ passed: boolean; error?: string }>;
  timeout?: number;
}

const CLAUDE_CODE_WORKSPACE = join(
  process.cwd(),
  "tmp",
  "claude-code-workspace",
);

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

const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim().replace(/^```\n?/, "");
  return PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

async function waitForAgentResponse(
  config: Config,
  afterTimestamp: number,
  timeout = 120000,
  stabilityWindow = 5000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 3000;

  let lastResponseCount = 0;
  let stableAt: number | null = null;
  let debugLogged = false;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      30,
    );

    if (!result.success || !result.messages) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    if (DEBUG && !debugLogged) {
      console.log(
        `\n   [DEBUG] afterTimestamp: ${afterTimestamp} (${new Date(afterTimestamp).toISOString()})`,
      );
      console.log(
        `   [DEBUG] Total messages fetched: ${result.messages.length}`,
      );
      debugLogged = true;
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
      .filter((msg) => !msg.content.startsWith("Use the claude_code tool"))
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

function createTests(): TestCase[] {
  const testMarker = `CCODE_${Date.now()}`;

  return [
    {
      name: "claude_code: create a simple file with timestamp",
      setup: async () => {
        mkdirSync(CLAUDE_CODE_WORKSPACE, { recursive: true });
      },
      prompt: `Use the claude_code tool to create a file at ${join(CLAUDE_CODE_WORKSPACE, `${testMarker}.txt`)} with the content "Hello from Claude Code - ${testMarker}". The task description should be: "Create a text file with specific content".`,
      validate: async (response) => {
        const filepath = join(CLAUDE_CODE_WORKSPACE, `${testMarker}.txt`);

        if (
          response.toLowerCase().includes("not found") ||
          response.toLowerCase().includes("not available")
        ) {
          return {
            passed: false,
            error: "Claude CLI not available on this system",
          };
        }

        if (!existsSync(filepath)) {
          if (response.includes("Success") || response.includes("✅")) {
            return {
              passed: false,
              error: `Response says success but file not created: ${filepath}`,
            };
          }
          return { passed: false, error: `File not created: ${filepath}` };
        }

        const content = readFileSync(filepath, "utf-8");
        if (!content.includes(testMarker)) {
          return {
            passed: false,
            error: `File content missing marker: ${content}`,
          };
        }

        return { passed: true };
      },
      timeout: 180000,
    },

    {
      name: "claude_code: fetch weather and save to file",
      setup: async () => {
        mkdirSync(CLAUDE_CODE_WORKSPACE, { recursive: true });
      },
      prompt: `Use the claude_code tool to: 1) Fetch the current weather in Beijing, 2) Save the weather info to ${join(CLAUDE_CODE_WORKSPACE, `weather_${testMarker}.txt`)}. The task should include searching the web for current weather.`,
      validate: async (response) => {
        const filepath = join(
          CLAUDE_CODE_WORKSPACE,
          `weather_${testMarker}.txt`,
        );

        if (
          response.toLowerCase().includes("not found") ||
          response.toLowerCase().includes("not available")
        ) {
          return {
            passed: false,
            error: "Claude CLI not available on this system",
          };
        }

        const weatherKeywords = [
          "weather",
          "temperature",
          "天气",
          "温度",
          "°",
          "celsius",
          "fahrenheit",
          "cloudy",
          "sunny",
          "rain",
          "beijing",
          "北京",
        ];
        const hasWeatherInfo = weatherKeywords.some((kw) =>
          response.toLowerCase().includes(kw.toLowerCase()),
        );

        if (!hasWeatherInfo) {
          return {
            passed: false,
            error: `Response doesn't contain weather info: ${response.slice(0, 300)}`,
          };
        }

        if (existsSync(filepath)) {
          const content = readFileSync(filepath, "utf-8");
          const fileHasWeather = weatherKeywords.some((kw) =>
            content.toLowerCase().includes(kw.toLowerCase()),
          );
          if (fileHasWeather) {
            return { passed: true };
          }
        }

        if (response.includes("Success") || response.includes("✅")) {
          return { passed: true };
        }

        return {
          passed: false,
          error: "Could not verify weather task completion",
        };
      },
      timeout: 300000,
    },
  ];
}

async function runTest(
  config: Config,
  test: TestCase,
): Promise<{ passed: boolean; error?: string; duration: number }> {
  const startTime = Date.now();
  const timeout = test.timeout ?? 120000;

  try {
    if (test.setup) {
      await test.setup();
    }

    if (DEBUG)
      console.log(`   [DEBUG] Prompt: ${test.prompt.slice(0, 100)}...`);

    const beforeSend = Date.now();

    const sendResult = await sendWebhookMessage(
      { url: config.webhookUrl },
      { content: test.prompt },
    );

    if (!sendResult.success) {
      return {
        passed: false,
        error: `Webhook failed: ${sendResult.error}`,
        duration: Date.now() - startTime,
      };
    }

    const messageId = sendResult.id ?? "";

    const hasEyes = await waitForReaction(
      { botToken: config.botToken, channelId: config.testChannelId },
      messageId,
      { emoji: "👀", timeout: 20000, interval: 500 },
    );

    if (!hasEyes) {
      return {
        passed: false,
        error: "Bot did not acknowledge (no 👀 reaction)",
        duration: Date.now() - startTime,
      };
    }

    const response = await waitForAgentResponse(config, beforeSend, timeout);

    if (!response) {
      return {
        passed: false,
        error: "No response from agent",
        duration: Date.now() - startTime,
      };
    }

    if (DEBUG) console.log(`   [DEBUG] Response: ${response.slice(0, 200)}...`);

    // Wait for file operations to complete (claude_code may still be writing)
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const validation = await test.validate(response);

    return {
      ...validation,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - claude_code Tool\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  if (existsSync(CLAUDE_CODE_WORKSPACE)) {
    rmSync(CLAUDE_CODE_WORKSPACE, { recursive: true });
  }
  mkdirSync(CLAUDE_CODE_WORKSPACE, { recursive: true });
  console.log(`✓ Workspace: ${CLAUDE_CODE_WORKSPACE}`);

  let bot: BotProcess;
  try {
    console.log("\n📡 Starting Agent Bot...");
    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      debounce: false,
      startupTimeout: 30000,
      workspaceDir: CLAUDE_CODE_WORKSPACE,
      debug: DEBUG,
    });
    console.log(`✓ Bot started (PID: ${bot.pid})`);
  } catch (error) {
    console.error(`✗ Bot error: ${(error as Error).message}`);
    process.exit(1);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const tests = createTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running claude_code Tool Tests\n");
  console.log(
    "Note: These tests require Claude CLI to be installed locally.\n",
  );

  const results: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }[] = [];

  for (const test of tests) {
    process.stdout.write(`  ${test.name}... `);

    const result = await runTest(config, test);
    results.push({ name: test.name, ...result });

    if (result.passed) {
      console.log(`✓ (${Math.round(result.duration / 1000)}s)`);
    } else {
      console.log(`✗ (${Math.round(result.duration / 1000)}s)`);
      console.log(`    Error: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("\n🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} claude_code tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} claude_code tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n📁 Workspace: ${CLAUDE_CODE_WORKSPACE}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
