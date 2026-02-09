#!/usr/bin/env bun

/**
 * Behavioral Test: Built-in Skills
 *
 * Tests the 5 built-in skills:
 * - code-review: /review trigger
 * - explain: /explain trigger
 * - refactor: /refactor trigger
 * - test: /test trigger
 * - research: /research trigger (requires TAVILY_API_KEY)
 *
 * NOTE: /search was removed - now uses web_search tool instead
 *
 * Verification Strategy:
 * Uses LLM-as-Judge (via judge.ts) to semantically verify agent responses
 * against natural language criteria, replacing brittle keyword matching.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
import { cleanupJudge, verify } from "./judge";
import { isProcessingMessage } from "./utils";

const DEBUG = process.argv.includes("--debug");

interface Config {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

interface SkillTestCase {
  name: string;
  setup?: () => Promise<void>;
  prompt: string;
  validate: (response: string) => Promise<{ passed: boolean; error?: string }>;
  timeout?: number;
}

const TEST_DIR = join(process.cwd(), "tmp", "skills-tests");

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
  timeout = 90000,
  stabilityWindow = 5000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 2000;

  let lastResponseCount = 0;
  let stableAt: number | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      30,
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

const BUGGY_CODE = `function calculateTotal(items) {
  var total = 0;
  for (var i = 0; i <= items.length; i++) {
    total = total + items[i].price;
  }
  return total
}`;

const SIMPLE_CODE = `function greet(name) {
  return "Hello, " + name + "!";
}`;

function createSkillTests(): SkillTestCase[] {
  return [
    {
      name: "skill: /review triggers code-review",
      prompt: `/review this code:\n\`\`\`javascript\n${BUGGY_CODE}\n\`\`\``,
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should be a code review that identifies the off-by-one bug (i <= items.length should be i < items.length) and provides improvement suggestions",
        );
        return result.passed
          ? { passed: true }
          : { passed: false, error: result.reasoning };
      },
    },

    {
      name: "skill: /explain triggers explain",
      prompt: `/explain this code:\n\`\`\`javascript\n${SIMPLE_CODE}\n\`\`\``,
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should explain what the greet function does — it takes a name parameter and returns a greeting string by concatenating 'Hello, ' with the name",
        );
        return result.passed
          ? { passed: true }
          : { passed: false, error: result.reasoning };
      },
    },

    {
      name: "skill: /refactor triggers refactor",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(join(TEST_DIR, "refactor-target.js"), BUGGY_CODE);
      },
      prompt: `/refactor the code in ${join(TEST_DIR, "refactor-target.js")}. Fix the bug and improve readability.`,
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should describe refactoring the calculateTotal function — fixing the loop boundary bug and improving code style (e.g., using const/let, modern iteration)",
        );

        // Supplementary check: see if the file was actually modified
        const filePath = join(TEST_DIR, "refactor-target.js");
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          const wasModified = !content.includes("i <= items.length");
          if (wasModified && DEBUG) {
            console.log("   [DEBUG] File was modified (bonus)");
          }
        }

        return result.passed
          ? { passed: true }
          : { passed: false, error: result.reasoning };
      },
    },

    {
      name: "skill: /test triggers test writing",
      prompt: `/test write tests for this function:\n\`\`\`javascript\n${SIMPLE_CODE}\n\`\`\``,
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should contain test cases for the greet function, with test assertions/expectations, presented in code blocks",
        );
        return result.passed
          ? { passed: true }
          : { passed: false, error: result.reasoning };
      },
    },

    // NOTE: /search skill removed - now uses web_search tool instead

    {
      name: "skill: /research triggers deep research",
      prompt: "/research what are the main features of Bun runtime",
      timeout: 180000,
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should describe Bun runtime features such as JavaScript/TypeScript execution, bundling, package management, or performance characteristics",
        );
        return result.passed
          ? { passed: true }
          : { passed: false, error: result.reasoning };
      },
    },
  ];
}

async function runSkillTest(
  config: Config,
  test: SkillTestCase,
): Promise<{ passed: boolean; error?: string; duration: number }> {
  const startTime = Date.now();
  const timeout = test.timeout ?? 90000;

  try {
    if (test.setup) {
      await test.setup();
    }

    if (DEBUG) console.log(`   [DEBUG] Prompt: ${test.prompt.slice(0, 80)}...`);

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
  console.log("🧪 Agent Behavioral Tests - Built-in Skills\n");

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

  let bot: BotProcess;
  try {
    console.log("\n📡 Starting Agent Bot...");
    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      debounce: false,
      startupTimeout: 30000,
      workspaceDir: process.cwd(),
      debug: DEBUG,
    });
    console.log(`✓ Bot started (PID: ${bot.pid})`);
  } catch (error) {
    console.error(`✗ Bot error: ${(error as Error).message}`);
    process.exit(1);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const skillTests = createSkillTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running Skill Tests\n");
  console.log(
    "Testing 5 built-in skills: code-review, explain, refactor, test, research\n",
  );

  const results: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }[] = [];

  for (const test of skillTests) {
    process.stdout.write(`  ${test.name}... `);

    const result = await runSkillTest(config, test);
    results.push({ name: test.name, ...result });

    if (result.passed) {
      console.log(`✓ (${Math.round(result.duration / 1000)}s)`);
    } else {
      console.log(`✗ (${Math.round(result.duration / 1000)}s)`);
      console.log(`    Error: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log("\n🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} skill tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} skill tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n📁 Test files: ${TEST_DIR}`);
  cleanupJudge();
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
