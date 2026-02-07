#!/usr/bin/env bun

/**
 * Behavioral Test: Built-in Skills
 *
 * Tests the 4 built-in skills:
 * - code-review: /review trigger
 * - explain: /explain trigger
 * - refactor: /refactor trigger
 * - test: /test trigger
 *
 * Verification Strategy:
 * Each skill injects a specific prompt that guides Agent behavior.
 * We verify by checking for characteristic keywords in the response
 * that indicate the skill was activated and followed.
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
  validate: (response: string) => { passed: boolean; error?: string };
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
    botUserId: creds.botUserId,
  };
}

const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking", "🔧"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();
  return PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
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
      validate: (response) => {
        const lower = response.toLowerCase();
        const reviewIndicators = [
          "bug",
          "issue",
          "problem",
          "error",
          "off-by-one",
          "boundary",
          "undefined",
          "i <=",
          "i <= items.length",
          "security",
          "improvement",
          "suggest",
          "recommend",
          "consider",
          "should",
          "better",
          "fix",
          "质量",
          "问题",
          "建议",
          "改进",
          "漏洞",
          "边界",
        ];

        const hasReviewContent = reviewIndicators.some((indicator) =>
          lower.includes(indicator.toLowerCase()),
        );

        if (!hasReviewContent) {
          return {
            passed: false,
            error: `Response lacks code review indicators: ${response.slice(0, 300)}`,
          };
        }

        return { passed: true };
      },
    },

    {
      name: "skill: /explain triggers explain",
      prompt: `/explain this code:\n\`\`\`javascript\n${SIMPLE_CODE}\n\`\`\``,
      validate: (response) => {
        const lower = response.toLowerCase();
        const explainIndicators = [
          "function",
          "return",
          "parameter",
          "argument",
          "string",
          "concatenat",
          "greet",
          "hello",
          "name",
          "takes",
          "accepts",
          "creates",
          "produces",
          "outputs",
          "功能",
          "函数",
          "参数",
          "返回",
          "字符串",
          "拼接",
        ];

        const hasExplainContent = explainIndicators.some((indicator) =>
          lower.includes(indicator.toLowerCase()),
        );

        if (!hasExplainContent) {
          return {
            passed: false,
            error: `Response lacks explanation indicators: ${response.slice(0, 300)}`,
          };
        }

        return { passed: true };
      },
    },

    {
      name: "skill: /refactor triggers refactor",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(join(TEST_DIR, "refactor-target.js"), BUGGY_CODE);
      },
      prompt: `/refactor the code in ${join(TEST_DIR, "refactor-target.js")}. Fix the bug and improve readability.`,
      validate: (response) => {
        const lower = response.toLowerCase();

        const refactorIndicators = [
          "refactor",
          "改",
          "修改",
          "重构",
          "<",
          "< items.length",
          "const",
          "let",
          "for...of",
          "foreach",
          "reduce",
          "readab",
          "improve",
          "clean",
          "modern",
          "简化",
          "改善",
          "可读",
        ];

        const hasRefactorContent = refactorIndicators.some((indicator) =>
          lower.includes(indicator.toLowerCase()),
        );

        if (!hasRefactorContent) {
          return {
            passed: false,
            error: `Response lacks refactor indicators: ${response.slice(0, 300)}`,
          };
        }

        const filePath = join(TEST_DIR, "refactor-target.js");
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          const wasModified = !content.includes("i <= items.length");
          if (wasModified) {
            if (DEBUG) console.log("   [DEBUG] File was modified (bonus)");
          }
        }

        return { passed: true };
      },
    },

    {
      name: "skill: /test triggers test writing",
      prompt: `/test write tests for this function:\n\`\`\`javascript\n${SIMPLE_CODE}\n\`\`\``,
      validate: (response) => {
        const lower = response.toLowerCase();

        const testIndicators = [
          "test",
          "describe",
          "it(",
          "expect",
          "assert",
          "should",
          "equal",
          "tobe",
          "return",
          "hello",
          "测试",
          "用例",
          "覆盖",
          "边界",
        ];

        const hasTestContent = testIndicators.some((indicator) =>
          lower.includes(indicator.toLowerCase()),
        );

        if (!hasTestContent) {
          return {
            passed: false,
            error: `Response lacks test indicators: ${response.slice(0, 300)}`,
          };
        }

        const hasCodeBlock = response.includes("```");
        if (!hasCodeBlock) {
          return {
            passed: false,
            error: "Response should contain code block with test examples",
          };
        }

        return { passed: true };
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

    const validation = test.validate(response);

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
    "Testing 4 built-in skills: code-review, explain, refactor, test\n",
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
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
