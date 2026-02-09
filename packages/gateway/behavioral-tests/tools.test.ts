#!/usr/bin/env bun

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

interface ToolTestCase {
  name: string;
  setup?: () => Promise<void>;
  prompt: string;
  validate: (response: string) => Promise<{ passed: boolean; error?: string }>;
}

const TEST_DIR = join(process.cwd(), "tmp", "behavioral-tests");

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
  const trimmed = content.trim();
  return PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
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
  let debugLogged = false;

  while (Date.now() - startTime < timeout) {
    const result = await fetchChannelMessages(
      { botToken: config.botToken, channelId: config.testChannelId },
      20,
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
      for (const msg of result.messages.slice(0, 5)) {
        const msgTime = new Date(msg.timestamp).getTime();
        console.log(
          `   [DEBUG] msg: bot=${msg.author.bot} id=${msg.author.id} time=${msgTime} content="${msg.content.slice(0, 50)}..."`,
        );
      }
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

function createToolTests(): ToolTestCase[] {
  const testMarker = `TEST_${Date.now()}`;

  return [
    {
      name: "write: create file",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
      },
      prompt: `Use the write tool to create a file. Path: ${join(TEST_DIR, "write-test.txt")}. Content: ${testMarker}_WRITE_SUCCESS. Just confirm when done.`,
      validate: async () => {
        const filepath = join(TEST_DIR, "write-test.txt");
        if (!existsSync(filepath)) {
          return { passed: false, error: "File not created" };
        }
        const content = readFileSync(filepath, "utf-8");
        if (!content.includes(`${testMarker}_WRITE_SUCCESS`)) {
          return { passed: false, error: `Wrong content: ${content}` };
        }
        return { passed: true };
      },
    },

    {
      name: "read: read file content",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(
          join(TEST_DIR, "read-test.txt"),
          `SECRET=${testMarker}_READ_VALUE`,
        );
      },
      prompt: `Use the read tool to read ${join(TEST_DIR, "read-test.txt")}. What is the SECRET value? Reply with just the value.`,
      validate: async (response) => {
        if (!response.includes(`${testMarker}_READ_VALUE`)) {
          return {
            passed: false,
            error: `Expected "${testMarker}_READ_VALUE" in response`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "edit: replace text",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(
          join(TEST_DIR, "edit-test.txt"),
          `Status: PENDING_${testMarker}`,
        );
      },
      prompt: `Use the edit tool on ${join(TEST_DIR, "edit-test.txt")}. Replace "PENDING_${testMarker}" with "DONE_${testMarker}". Confirm when done.`,
      validate: async () => {
        const filepath = join(TEST_DIR, "edit-test.txt");
        if (!existsSync(filepath)) {
          return { passed: false, error: "File not found" };
        }
        const content = readFileSync(filepath, "utf-8");
        if (content.includes(`PENDING_${testMarker}`)) {
          return { passed: false, error: "Old text not replaced" };
        }
        if (!content.includes(`DONE_${testMarker}`)) {
          return { passed: false, error: `New text not found: ${content}` };
        }
        return { passed: true };
      },
    },

    {
      name: "exec: run shell command",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
      },
      prompt: `Use the exec tool to run: echo "${testMarker}_EXEC_OUTPUT". Tell me the exact output.`,
      validate: async (response) => {
        if (!response.includes(`${testMarker}_EXEC_OUTPUT`)) {
          return {
            passed: false,
            error: `Expected "${testMarker}_EXEC_OUTPUT" in response`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "list: list directory",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(join(TEST_DIR, `${testMarker}_file1.txt`), "content1");
        writeFileSync(join(TEST_DIR, `${testMarker}_file2.txt`), "content2");
        mkdirSync(join(TEST_DIR, `${testMarker}_subdir`), { recursive: true });
      },
      prompt: `Use the list tool to list ${TEST_DIR}. Tell me how many items contain "${testMarker}" in their name.`,
      validate: async (response) => {
        if (!response.includes("3") && !response.includes("three")) {
          return {
            passed: false,
            error: `Expected "3" or "three" items in response: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "grep: search file content",
      setup: async () => {
        mkdirSync(TEST_DIR, { recursive: true });
        writeFileSync(
          join(TEST_DIR, "grep-test.txt"),
          `Line 1: hello\nLine 2: ${testMarker}_GREP_TARGET\nLine 3: world`,
        );
      },
      prompt: `Use the grep tool to search for "${testMarker}_GREP_TARGET" in ${TEST_DIR}. Which line number contains it?`,
      validate: async (response) => {
        if (
          !response.includes("2") &&
          !response.includes("two") &&
          !response.includes("second")
        ) {
          return {
            passed: false,
            error: `Expected line "2" in response: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "exec: git status in external directory",
      prompt:
        'Use the exec tool to run "git status" in directory /Users/nocoo/workspace/personal/obsidian. Tell me which branch it is on and if it has uncommitted changes.',
      validate: async (response) => {
        const hasBranchInfo =
          response.includes("main") ||
          response.includes("master") ||
          response.includes("branch");
        const hasStatusInfo =
          response.includes("clean") ||
          response.includes("uncommitted") ||
          response.includes("modified") ||
          response.includes("nothing to commit") ||
          response.includes("changes");
        if (!hasBranchInfo) {
          return {
            passed: false,
            error: `Expected branch info in response: ${response.slice(0, 200)}`,
          };
        }
        if (!hasStatusInfo) {
          return {
            passed: false,
            error: `Expected status info in response: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },

    {
      name: "exec: git log in external directory",
      prompt:
        'Use the exec tool to run "git log --oneline -3" in directory /Users/nocoo/workspace/personal/obsidian. Tell me the first commit message.',
      validate: async (response) => {
        const hasCommitInfo =
          response.includes("docs") ||
          response.includes("add") ||
          response.includes("update") ||
          response.includes("fix") ||
          response.includes("feat") ||
          response.match(/[a-f0-9]{7}/i);
        if (!hasCommitInfo) {
          return {
            passed: false,
            error: `Expected commit info in response: ${response.slice(0, 200)}`,
          };
        }
        return { passed: true };
      },
    },
  ];
}

async function runToolTest(
  config: Config,
  test: ToolTestCase,
): Promise<{ passed: boolean; error?: string; duration: number }> {
  const startTime = Date.now();

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
      { emoji: "👀", timeout: 15000, interval: 500 },
    );

    if (!hasEyes) {
      return {
        passed: false,
        error: "Bot did not acknowledge (no 👀 reaction)",
        duration: Date.now() - startTime,
      };
    }

    const response = await waitForAgentResponse(config, beforeSend, 90000);

    if (!response) {
      return {
        passed: false,
        error: "No response from agent",
        duration: Date.now() - startTime,
      };
    }

    if (DEBUG) console.log(`   [DEBUG] Response: ${response.slice(0, 150)}...`);

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
  console.log("🧪 Agent Behavioral Tests - Tools\n");

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

  const toolTests = createToolTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running Tool Tests\n");

  const results: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }[] = [];

  for (const test of toolTests) {
    process.stdout.write(`  ${test.name}... `);

    const result = await runToolTest(config, test);
    results.push({ name: test.name, ...result });

    if (result.passed) {
      console.log(`✓ (${result.duration}ms)`);
    } else {
      console.log(`✗ (${result.duration}ms)`);
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
    console.log(`✅ All ${total} behavioral tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} behavioral tests passed`);
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
