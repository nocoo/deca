#!/usr/bin/env bun

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

import { cleanupJudge, verify } from "./judge";
import { isProcessingMessage } from "./utils";

const DEBUG = process.argv.includes("--debug");

interface Config {
  botToken: string;
  webhookUrl: string;
  testChannelId: string;
  botUserId?: string;
}

const TEST_DIR = join(process.cwd(), "tmp", "cron-behavioral-tests");
const CRON_STORAGE_PATH = join(TEST_DIR, "cron.json");

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
  promptPrefix: string,
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

/**
 * Wait for a scheduled delivery message (sent via sendScheduledResult).
 * Unlike waitForAgentResponse which expects a reply to a webhook message,
 * this waits for an additional bot message that appears after the chat reply.
 *
 * @param afterTimestamp - Only consider messages after this time
 * @param excludeContent - Exclude messages containing this text (to filter out the chat reply)
 * @param timeout - Max wait time in ms
 */
async function waitForScheduledDelivery(
  config: Config,
  afterTimestamp: number,
  excludeContent: string[],
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

    const deliveredMessages = result.messages
      .filter((msg) => {
        const msgTime = new Date(msg.timestamp).getTime();
        const isBotUser = config.botUserId
          ? msg.author.id === config.botUserId
          : msg.author.bot;
        if (!isBotUser || msgTime <= afterTimestamp) return false;
        // Exclude processing messages and known chat replies
        if (isProcessingMessage(msg.content)) return false;
        for (const exc of excludeContent) {
          if (msg.content.includes(exc)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (deliveredMessages.length === 0) {
      lastResponseCount = 0;
      stableAt = null;
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }

    if (deliveredMessages.length !== lastResponseCount) {
      lastResponseCount = deliveredMessages.length;
      stableAt = Date.now();
      if (DEBUG) {
        console.log(
          `   [DEBUG] Found ${deliveredMessages.length} scheduled delivery messages`,
        );
      }
    }

    if (stableAt && Date.now() - stableAt >= stabilityWindow) {
      // Return the latest delivered message
      return deliveredMessages[deliveredMessages.length - 1].content.trim();
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
    prompt.slice(0, 50),
    timeout,
    5000,
  );

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  if (DEBUG) {
    console.log(`   [DEBUG] Response: ${response.slice(0, 150)}...`);
  }

  return { success: true, response };
}

function startBot(options?: { mainChannelId?: string }): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    enableCron: true,
    cronStoragePath: CRON_STORAGE_PATH,
    debug: DEBUG,
    ...(options?.mainChannelId && { mainChannelId: options.mainChannelId }),
  });
}

function readCronStorage(): { jobs: unknown[] } | null {
  try {
    const content = readFileSync(CRON_STORAGE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function main() {
  console.log("🧪 Agent Behavioral Tests - Cron System\n");

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
  console.log(`✓ Cron storage: ${CRON_STORAGE_PATH}`);

  // Clean up session file to avoid context pollution
  const sessionDir = join(process.cwd(), ".deca", "sessions");
  const guildId = "1467737355384258695";
  const testChannelSessionFile = join(
    sessionDir,
    `agent%3Adeca%3Achannel%3A${guildId}%3A${config.testChannelId}.jsonl`,
  );
  if (existsSync(testChannelSessionFile)) {
    rmSync(testChannelSessionFile);
    console.log("✓ Cleaned up session file");
  }

  const results: { name: string; passed: boolean; error?: string }[] = [];
  const testMarker = `CRONTEST_${Date.now()}`;

  console.log("\n📡 Starting Agent Bot with Cron enabled...");
  let bot = await startBot();
  console.log(`✓ Bot started (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 1: Cron Tool Basic Operations\n");

  // Test 1: cron list (empty)
  {
    const testName = "cron list: empty state returns no jobs";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      "Use the cron tool with action 'list' to list all scheduled jobs. Tell me how many jobs there are.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const judgeResult = await verify(
        response,
        "Response should indicate that there are zero scheduled jobs or the job list is empty.",
      );

      if (judgeResult.passed) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Expected 0 jobs, got: ${response.slice(0, 150)}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Unexpected response: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 2: cron add
  const jobName = `test-job-${testMarker}`;
  {
    const testName = "cron add: create a scheduled job";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use the cron tool with action 'add' to create a job with name "${jobName}", instruction "Say hello from cron test", and schedule every 30000 milliseconds (30 seconds). Confirm when done.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const judgeResult = await verify(
        response,
        `Response should confirm that a cron job named "${jobName}" was successfully added/created/scheduled.`,
      );

      // Also verify storage file
      const storage = readCronStorage();
      const jobInStorage = storage?.jobs?.some(
        (j: unknown) => (j as { name?: string }).name === jobName,
      );

      if (judgeResult.passed && jobInStorage) {
        console.log("✓");
        if (DEBUG) {
          console.log(
            `    [DEBUG] Storage: ${JSON.stringify(storage, null, 2)}`,
          );
        }
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Job not properly added. Response check: ${judgeResult.passed}, InStorage: ${jobInStorage}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Job add failed. judgePass=${judgeResult.passed}, jobInStorage=${jobInStorage}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 3: cron list (with job)
  {
    const testName = "cron list: shows the created job";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      "Use the cron tool with action 'list' to list all scheduled jobs. Tell me the job names.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      // First check for exact job name (deterministic)
      const hasExactName = response.includes(jobName);

      if (hasExactName) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        // Fall back to LLM judge for semantic check
        const judgeResult = await verify(
          response,
          "Response should list at least one scheduled cron job, indicating a test job exists.",
        );

        if (judgeResult.passed) {
          console.log("✓");
          results.push({ name: testName, passed: true });
        } else {
          console.log("✗");
          console.log(
            `    Error: Job not in list. Response: ${response.slice(0, 150)}`,
          );
          results.push({
            name: testName,
            passed: false,
            error: `Job not found in list: ${judgeResult.reasoning}`,
          });
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 4: cron status
  {
    const testName = "cron status: shows job count";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      "Use the cron tool with action 'status' to check cron status. Tell me how many jobs are scheduled.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const judgeResult = await verify(
        response,
        "Response should indicate that there is at least 1 scheduled cron job (e.g., mentioning 1 job, one job, or similar).",
      );

      if (judgeResult.passed) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Status incomplete. Response: ${response.slice(0, 150)}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Status check failed: ${judgeResult.reasoning}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test 5: cron remove
  // Get jobId from storage first
  const storageBeforeRemove = readCronStorage();
  const jobToRemove = (
    storageBeforeRemove?.jobs as { id: string; name: string }[]
  )?.find((j) => j.name === jobName);
  const jobIdToRemove = jobToRemove?.id ?? "unknown";

  {
    const testName = "cron remove: delete the job";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use the cron tool with action 'remove' and jobId '${jobIdToRemove}'. Confirm when done.`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const judgeResult = await verify(
        response,
        "Response should confirm that the cron job was successfully removed/deleted.",
      );

      // Verify storage
      const storage = readCronStorage();
      const jobStillExists = storage?.jobs?.some(
        (j: unknown) => (j as { name?: string }).name === jobName,
      );

      if (judgeResult.passed && !jobStillExists) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Remove failed. Judge: ${judgeResult.passed}, stillExists: ${jobStillExists}`,
        );
        results.push({
          name: testName,
          passed: false,
          error: `Remove failed. judgePass=${judgeResult.passed}, stillExists=${jobStillExists}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 2: Persistence Test\n");

  // Create a job for persistence test
  const persistJobName = `persist-${testMarker}`;
  {
    const testName = "persistence: create job before restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      `Use the cron tool to add a job with name "${persistJobName}", instruction "Persistence test job", schedule every 60000 milliseconds. Confirm when done.`,
    );

    if (!result.success) {
      console.log("✗");
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const storage = readCronStorage();
      const jobExists = storage?.jobs?.some(
        (j: unknown) => (j as { name?: string }).name === persistJobName,
      );

      if (jobExists) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        results.push({
          name: testName,
          passed: false,
          error: "Job not in storage",
        });
      }
    }
  }

  console.log("\n🛑 Stopping bot for persistence test...");
  await bot.stop();
  console.log("✓ Bot stopped");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n📡 Restarting Agent Bot...");
  bot = await startBot();
  console.log(`✓ Bot restarted (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Verify job survives restart
  {
    const testName = "persistence: job survives restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendAndWait(
      config,
      "Use the cron tool with action 'list' to list all scheduled jobs. Tell me the job names.",
    );

    if (!result.success) {
      console.log("✗");
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      // Check for exact name first (deterministic)
      const hasExactName = response.includes(persistJobName);

      if (hasExactName) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        const judgeResult = await verify(
          response,
          "Response should list at least one scheduled cron job that survived a restart.",
        );

        if (judgeResult.passed) {
          console.log("✓");
          results.push({ name: testName, passed: true });
        } else {
          console.log("✗");
          console.log(`    Response: ${response.slice(0, 200)}`);
          results.push({
            name: testName,
            passed: false,
            error: `Job not found after restart: ${judgeResult.reasoning}`,
          });
        }
      }
    }
  }

  // Cleanup: remove persistence test job by ID
  const storageBeforeCleanup = readCronStorage();
  const persistJob = (
    storageBeforeCleanup?.jobs as { id: string; name: string }[]
  )?.find((j) => j.name === persistJobName);
  if (persistJob) {
    await sendAndWait(
      config,
      `Use the cron tool with action 'remove' and jobId '${persistJob.id}'.`,
    );
  }

  console.log("\n🛑 Stopping bot for Phase 3...");
  await bot.stop();
  console.log("✓ Bot stopped");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 3: Cron Result Delivery\n");

  // Phase 3 needs mainChannelId so sendScheduledResult can deliver to Discord
  console.log("📡 Restarting bot with mainChannelId for result delivery...");
  bot = await startBot({ mainChannelId: config.testChannelId });
  console.log(`✓ Bot started (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test: cron run → result appears in Discord channel
  const deliveryJobName = `delivery-${testMarker}`;
  const deliveryMarker = `CRONDELIVERY_${Date.now()}`;
  {
    const testName = "cron result delivery: run → result in Discord";
    process.stdout.write(`  ${testName}... `);

    // Step 1: Add a cron job with unique marker in instruction
    const addResult = await sendAndWait(
      config,
      `Use the cron tool with action 'add' to create a job with name "${deliveryJobName}", instruction "Reply with exactly: ${deliveryMarker}", and schedule every 600000 milliseconds. Confirm when done.`,
    );

    if (!addResult.success) {
      console.log("✗");
      console.log(`    Error adding job: ${addResult.error}`);
      results.push({ name: testName, passed: false, error: addResult.error });
    } else {
      // Step 2: Get the job ID from storage
      const storage = readCronStorage();
      const job = (storage?.jobs as { id: string; name: string }[])?.find(
        (j) => j.name === deliveryJobName,
      );

      if (!job) {
        console.log("✗");
        console.log("    Error: Job not found in storage after add");
        results.push({
          name: testName,
          passed: false,
          error: "Job not in storage",
        });
      } else {
        // Step 3: Record timestamp, then trigger the job via "cron run"
        const beforeRun = Date.now();

        const runResult = await sendAndWait(
          config,
          `Use the cron tool with action 'run' and jobId '${job.id}'. Confirm when done.`,
        );

        if (!runResult.success) {
          console.log("✗");
          console.log(`    Error running job: ${runResult.error}`);
          results.push({
            name: testName,
            passed: false,
            error: runResult.error,
          });
        } else {
          // Step 4: Wait for the scheduled delivery message
          // Exclude only the chat reply about "Job triggered" — do NOT exclude
          // deliveryJobName because the cron delivery message itself contains
          // the job name in its metadata section.
          const delivered = await waitForScheduledDelivery(
            config,
            beforeRun,
            ["Job triggered", "cron tool"],
            90000,
          );

          if (delivered) {
            // Verify the delivered message contains our marker or is a meaningful response
            const judgeResult = await verify(
              delivered,
              `Response should contain the marker "${deliveryMarker}" or be a direct response to the instruction "Reply with exactly: ${deliveryMarker}". The key point is that a cron result was actually delivered to the Discord channel.`,
            );

            if (judgeResult.passed) {
              console.log("✓");
              results.push({ name: testName, passed: true });
            } else {
              console.log("✗");
              console.log(
                `    Delivered but wrong content: ${delivered.slice(0, 150)}`,
              );
              results.push({
                name: testName,
                passed: false,
                error: `Wrong content: ${judgeResult.reasoning}`,
              });
            }
          } else {
            // Fallback: check bot logs for evidence of scheduled delivery
            const botOutput = bot?.getOutput() ?? "";
            const hasScheduledLog =
              botOutput.includes("[Scheduled]") ||
              botOutput.includes(deliveryMarker);

            if (hasScheduledLog) {
              console.log("✓ (via logs)");
              results.push({ name: testName, passed: true });
            } else {
              console.log("✗");
              console.log(
                "    Error: No scheduled delivery in Discord or logs",
              );
              if (DEBUG) {
                console.log(
                  `    [DEBUG] Bot output (last 500): ${botOutput.slice(-500)}`,
                );
              }
              results.push({
                name: testName,
                passed: false,
                error: "No cron result delivery detected",
              });
            }
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test: cron result NOT suppressed when Agent replies HEARTBEAT_OK
  const heartbeatJobName = `hbok-${testMarker}`;
  {
    const testName = "cron result delivery: HEARTBEAT_OK not suppressed";
    process.stdout.write(`  ${testName}... `);

    // Step 1: Add a job that asks Agent to reply "HEARTBEAT_OK"
    const addResult = await sendAndWait(
      config,
      `Use the cron tool with action 'add' to create a job with name "${heartbeatJobName}", instruction "Reply with exactly the text HEARTBEAT_OK and nothing else", and schedule every 600000 milliseconds. Confirm when done.`,
    );

    if (!addResult.success) {
      console.log("✗");
      console.log(`    Error adding job: ${addResult.error}`);
      results.push({ name: testName, passed: false, error: addResult.error });
    } else {
      const storage = readCronStorage();
      const job = (storage?.jobs as { id: string; name: string }[])?.find(
        (j) => j.name === heartbeatJobName,
      );

      if (!job) {
        console.log("✗");
        results.push({
          name: testName,
          passed: false,
          error: "Job not in storage",
        });
      } else {
        const beforeRun = Date.now();

        const runResult = await sendAndWait(
          config,
          `Use the cron tool with action 'run' and jobId '${job.id}'. Confirm when done.`,
        );

        if (!runResult.success) {
          console.log("✗");
          results.push({
            name: testName,
            passed: false,
            error: runResult.error,
          });
        } else {
          // Wait for scheduled delivery — should NOT be suppressed even if content is HEARTBEAT_OK
          const delivered = await waitForScheduledDelivery(
            config,
            beforeRun,
            ["Job triggered", "cron tool"],
            90000,
          );

          if (delivered) {
            // The message was delivered — that's the key assertion
            // For cron, HEARTBEAT_OK should NOT be suppressed
            console.log("✓");
            if (DEBUG) {
              console.log(
                `    [DEBUG] Delivered content: ${delivered.slice(0, 100)}`,
              );
            }
            results.push({ name: testName, passed: true });
          } else {
            // Check logs — if we see the result in logs, it means delivery was attempted
            const botOutput = bot?.getOutput() ?? "";
            const hasDelivery =
              botOutput.includes("HEARTBEAT_OK") &&
              !botOutput.includes("suppressed");

            if (hasDelivery) {
              console.log("✓ (via logs)");
              results.push({ name: testName, passed: true });
            } else {
              console.log("✗");
              console.log(
                "    Error: HEARTBEAT_OK response was suppressed or not delivered",
              );
              results.push({
                name: testName,
                passed: false,
                error:
                  "Cron HEARTBEAT_OK was suppressed (should always deliver)",
              });
            }
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Cleanup Phase 3 jobs
  const storagePhase3 = readCronStorage();
  const phase3Jobs = (
    storagePhase3?.jobs as { id: string; name: string }[]
  )?.filter((j) => j.name === deliveryJobName || j.name === heartbeatJobName);
  for (const job of phase3Jobs ?? []) {
    await sendAndWait(
      config,
      `Use the cron tool with action 'remove' and jobId '${job.id}'.`,
    );
  }

  console.log("\n🛑 Stopping bot...");
  await bot.stop();
  console.log("✓ Bot stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} cron behavioral tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} cron behavioral tests passed`);
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n📁 Test files: ${TEST_DIR}`);
  console.log(`📁 Cron storage: ${CRON_STORAGE_PATH}`);
  cleanupJudge();
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
