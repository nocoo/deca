#!/usr/bin/env bun

import { existsSync, rmSync } from "node:fs";
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

interface AutonomyTestCase {
  name: string;
  task: string;
  expectedCapabilities: string[];
  validate: (response: string) => Promise<{ passed: boolean; error?: string }>;
}

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  const testServer = creds.servers?.test;
  if (
    !creds.botToken ||
    !testServer?.testChannelWebhookUrl ||
    !testServer?.testChannelId
  ) {
    throw new Error("Missing required credentials");
  }

  return {
    botToken: creds.botToken,
    webhookUrl: testServer.testChannelWebhookUrl,
    testChannelId: testServer.testChannelId,
    botUserId: creds.botApplicationId,
  };
}

async function waitForAgentResponse(
  config: Config,
  afterTimestamp: number,
  originalPrompt: string,
  timeout = 180000,
  stabilityWindow = 8000,
): Promise<string | null> {
  const startTime = Date.now();
  const interval = 3000;
  const promptPrefix = originalPrompt.slice(0, 50);

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
        const isWebhookMessage = msg.content.startsWith(promptPrefix);
        return msgTime > afterTimestamp && isBotUser && !isWebhookMessage;
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

async function sendAndWait(
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

  const response = await waitForAgentResponse(
    config,
    beforeSend,
    prompt,
    180000,
  );

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  return { success: true, response };
}

function createAutonomyTests(): AutonomyTestCase[] {
  return [
    {
      name: "repo-analysis: analyze external git repository",
      task: `Analyze the git repository at /Users/nocoo/workspace/personal/obsidian and give me a brief report:
1. What branch is it on?
2. Is the working directory clean?
3. What were the last 3 commits about?
4. How many commits in total (approximately)?

Figure out how to get this information yourself.`,
      expectedCapabilities: ["exec", "git commands", "synthesis"],
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should contain: (1) which git branch the repository is on, (2) whether the working directory is clean or has uncommitted changes, (3) information about recent commits.",
        );
        return { passed: result.passed, error: result.reasoning };
      },
    },

    {
      name: "file-discovery: find and summarize project structure",
      task: `Look at the project at /Users/nocoo/workspace/personal/deca and tell me:
1. What type of project is this? (language, framework)
2. How many packages does it have?
3. What are the main package names?

Use whatever tools you need to figure this out.`,
      expectedCapabilities: ["list", "read", "synthesis"],
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should identify: (1) the project type/language (TypeScript/JavaScript/Bun/Node), (2) that it is a monorepo with multiple packages, (3) names of key packages such as agent, discord, gateway.",
        );
        return { passed: result.passed, error: result.reasoning };
      },
    },

    {
      name: "code-investigation: find implementation details",
      task: `I need to understand how the memory system works in /Users/nocoo/workspace/personal/deca.
Find where the MemoryManager class is defined and tell me:
1. What file is it in?
2. What are its main public methods?
3. How does it store data?

Investigate the codebase yourself.`,
      expectedCapabilities: ["grep", "read", "analysis"],
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should describe: (1) the file path where MemoryManager is defined (in packages/agent), (2) its main public methods (such as add, search, load, save), (3) how it stores data (e.g., JSON files, file-based storage).",
        );
        return { passed: result.passed, error: result.reasoning };
      },
    },

    {
      name: "multi-step-task: create file based on repo info",
      task: `Do the following steps and report each result:
1. Check the current git branch of /Users/nocoo/workspace/personal/deca - tell me the branch name
2. Count how many .ts files are in packages/agent/src - tell me the count
3. Create a file at /Users/nocoo/workspace/personal/deca/packages/gateway/tmp/repo-summary.txt containing:
   Branch: <branch name>
   TypeScript files in agent: <count>
   Generated at: <current timestamp>

Report back: the branch name, the file count, and confirm the file was created.`,
      expectedCapabilities: ["exec", "list", "write", "multi-step"],
      validate: async (response) => {
        const result = await verify(
          response,
          "Response should report: (1) the current git branch name (e.g., main), (2) the count of .ts files found in packages/agent/src, (3) confirmation that the summary file was created/written.",
        );
        return { passed: result.passed, error: result.reasoning };
      },
    },
  ];
}

async function main() {
  console.log("🧪 Agent Autonomy Tests - High-Level Task Completion\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  let bot: BotProcess;
  try {
    console.log("\n📡 Starting Agent Bot...");

    // Clean up session file to avoid context pollution from previous runs
    const sessionDir = join(process.cwd(), ".deca", "sessions");
    const guildId = "1467737355384258695";
    const testChannelId = config.testChannelId;
    const sessionFile = join(
      sessionDir,
      `agent%3Adeca%3Achannel%3A${guildId}%3A${testChannelId}.jsonl`,
    );
    if (existsSync(sessionFile)) {
      rmSync(sessionFile);
      console.log("✓ Cleaned up previous session file");
    }

    bot = await spawnBot({
      cwd: getGatewayDir(),
      mode: "agent",
      allowBots: true,
      debounce: false,
      startupTimeout: 30000,
      workspaceDir: "/Users/nocoo/workspace/personal/deca",
      debug: DEBUG,
    });
    console.log(`✓ Bot started (PID: ${bot.pid})`);
  } catch (error) {
    console.error(`✗ Bot error: ${(error as Error).message}`);
    process.exit(1);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const tests = createAutonomyTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Running Agent Autonomy Tests\n");
  console.log("These tests verify the agent can:");
  console.log("  - Understand high-level tasks");
  console.log("  - Plan and execute multi-step workflows");
  console.log("  - Choose appropriate tools autonomously");
  console.log("  - Synthesize results into coherent responses\n");

  const results: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    capabilities?: string[];
  }[] = [];

  for (const test of tests) {
    console.log(`  ${test.name}`);
    console.log(
      `    Expected capabilities: ${test.expectedCapabilities.join(", ")}`,
    );
    process.stdout.write("    Running... ");

    const startTime = Date.now();
    const result = await sendAndWait(config, test.task);
    const duration = Date.now() - startTime;

    if (!result.success) {
      console.log(`✗ (${duration}ms)`);
      console.log(`    Error: ${result.error}`);
      results.push({
        name: test.name,
        passed: false,
        duration,
        error: result.error,
        capabilities: test.expectedCapabilities,
      });
    } else {
      const validation = await test.validate(result.response ?? "");

      if (validation.passed) {
        console.log(`✓ (${duration}ms)`);
        if (DEBUG) {
          console.log(`    Response: ${result.response?.slice(0, 200)}...`);
        }
        results.push({
          name: test.name,
          passed: true,
          duration,
          capabilities: test.expectedCapabilities,
        });
      } else {
        console.log(`✗ (${duration}ms)`);
        console.log(`    Error: ${validation.error}`);
        results.push({
          name: test.name,
          passed: false,
          duration,
          error: validation.error,
          capabilities: test.expectedCapabilities,
        });
      }
    }

    console.log("");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} autonomy tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} autonomy tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  const avgDuration = Math.round(
    results.reduce((sum, r) => sum + r.duration, 0) / results.length,
  );
  console.log(`\n⏱️  Average task completion time: ${avgDuration}ms`);

  cleanupJudge();
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
