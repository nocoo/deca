#!/usr/bin/env bun

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

interface AutonomyTestCase {
  name: string;
  task: string;
  expectedCapabilities: string[];
  validate: (response: string) => { passed: boolean; error?: string };
}

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

const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking", "```\n⏳"];

function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();
  if (PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  if (trimmed.startsWith("```") && trimmed.includes("⏳")) {
    return true;
  }
  return false;
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
      validate: (response) => {
        const hasBranch =
          response.includes("main") || response.includes("master");
        const hasCleanStatus =
          response.includes("clean") ||
          response.includes("uncommitted") ||
          response.includes("modified");
        const hasCommitInfo =
          response.includes("commit") || response.includes("docs");
        const checks = [
          { name: "branch", passed: hasBranch },
          { name: "status", passed: hasCleanStatus },
          { name: "commits", passed: hasCommitInfo },
        ];

        const failed = checks.filter((c) => !c.passed);
        if (failed.length > 0) {
          return {
            passed: false,
            error: `Missing: ${failed.map((c) => c.name).join(", ")}. Response: ${response.slice(0, 300)}`,
          };
        }
        return { passed: true };
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
      validate: (response) => {
        const hasType =
          response.includes("TypeScript") ||
          response.includes("JavaScript") ||
          response.includes("Node") ||
          response.includes("Bun");
        const hasMonorepo =
          response.includes("monorepo") ||
          response.includes("packages") ||
          response.includes("workspace");
        const hasPackageNames =
          response.includes("agent") ||
          response.includes("discord") ||
          response.includes("gateway");

        const checks = [
          { name: "project-type", passed: hasType },
          { name: "monorepo-structure", passed: hasMonorepo },
          { name: "package-names", passed: hasPackageNames },
        ];

        const failed = checks.filter((c) => !c.passed);
        if (failed.length > 0) {
          return {
            passed: false,
            error: `Missing: ${failed.map((c) => c.name).join(", ")}. Response: ${response.slice(0, 300)}`,
          };
        }
        return { passed: true };
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
      validate: (response) => {
        const hasFilePath =
          response.includes("memory.ts") || response.includes("packages/agent");
        const hasMethods =
          (response.includes("add") || response.includes("search")) &&
          (response.includes("load") || response.includes("save"));
        const hasStorage =
          response.includes("JSON") ||
          response.includes("file") ||
          response.includes("index.json");

        const checks = [
          { name: "file-location", passed: hasFilePath },
          { name: "methods", passed: hasMethods },
          { name: "storage-mechanism", passed: hasStorage },
        ];

        const failed = checks.filter((c) => !c.passed);
        if (failed.length > 0) {
          return {
            passed: false,
            error: `Missing: ${failed.map((c) => c.name).join(", ")}. Response: ${response.slice(0, 300)}`,
          };
        }
        return { passed: true };
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
      validate: (response) => {
        const mentionsBranch = response.includes("main");
        const mentionsCount =
          response.match(/\d+\s*(\.ts|TypeScript|files)/) ||
          response.includes("files");
        const mentionsCreated =
          response.includes("created") ||
          response.includes("Created") ||
          response.includes("wrote") ||
          response.includes("written") ||
          response.includes("saved") ||
          response.includes("summary file");

        const checks = [
          { name: "branch-check", passed: mentionsBranch },
          { name: "file-count", passed: Boolean(mentionsCount) },
          { name: "file-created", passed: mentionsCreated },
        ];

        const failed = checks.filter((c) => !c.passed);
        if (failed.length > 0) {
          return {
            passed: false,
            error: `Missing: ${failed.map((c) => c.name).join(", ")}. Response: ${response.slice(0, 300)}`,
          };
        }
        return { passed: true };
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
      const validation = test.validate(result.response ?? "");

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

  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
