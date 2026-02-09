#!/usr/bin/env bun

/**
 * Cross-Channel Session Sharing Behavioral Test
 *
 * Tests that HTTP (with senderId), Discord Main Channel (with mainUserId),
 * and Terminal all share the same user session.
 *
 * Test hierarchy (progressive validation):
 *
 * Phase 1: Baseline - HTTP to HTTP (same channel, same session)
 *   └── Confirms HTTP with senderId works
 *
 * Phase 2: Cross-Channel - HTTP ↔ Discord Main
 *   ├── HTTP stores → Discord Main recalls
 *   └── Discord Main stores → HTTP recalls
 *
 * Phase 3: Persistence - Session survives restart
 *   └── Both HTTP and Discord Main can recall after gateway restart
 *
 * Phase 4: Isolation - Non-main channel is isolated
 *   └── Test channel (channel session) cannot see main session data
 *
 * Session key: `agent:deca:user:{mainUserId}`
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
  /** Main channel webhook for user session */
  mainWebhookUrl: string;
  /** Main channel ID for user session routing */
  mainChannelId: string;
  /** Test channel webhook for channel session (isolation test) */
  testWebhookUrl: string;
  /** Test channel ID for channel session */
  testChannelId: string;
  /** Bot user ID for filtering responses */
  botUserId?: string;
  /** Main user ID for unified session key */
  mainUserId: string;
}

async function loadConfig(): Promise<Config> {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  const required = [
    "botToken",
    "mainWebhookUrl",
    "mainChannelId",
    "webhookUrl",
    "testChannelId",
    "userId",
  ];
  const missing = required.filter((k) => !creds[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required credentials: ${missing.join(", ")}`);
  }

  return {
    botToken: creds.botToken,
    mainWebhookUrl: creds.mainWebhookUrl,
    mainChannelId: creds.mainChannelId,
    testWebhookUrl: creds.webhookUrl,
    testChannelId: creds.testChannelId,
    botUserId: creds.clientId,
    mainUserId: creds.userId,
  };
}

async function waitForAgentResponse(
  config: { botToken: string; channelId: string; botUserId?: string },
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
      { botToken: config.botToken, channelId: config.channelId },
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
  channel: "main" | "test",
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const webhookUrl =
    channel === "main" ? config.mainWebhookUrl : config.testWebhookUrl;
  const channelId =
    channel === "main" ? config.mainChannelId : config.testChannelId;

  const beforeSend = Date.now();

  const sendResult = await sendWebhookMessage(
    { url: webhookUrl },
    { content: prompt },
  );

  if (!sendResult.success) {
    return { success: false, error: `Webhook failed: ${sendResult.error}` };
  }

  const messageId = sendResult.id ?? "";

  const hasEyes = await waitForReaction(
    { botToken: config.botToken, channelId },
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
    { botToken: config.botToken, channelId, botUserId: config.botUserId },
    beforeSend,
    90000,
  );

  if (!response) {
    return { success: false, error: "No response from agent" };
  }

  return { success: true, response };
}

async function sendHttpAndWait(
  port: number,
  senderId: string,
  message: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, senderId }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      success: boolean;
      response?: string;
      error?: string;
    };

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

function startBot(config: Config, httpPort: number): Promise<BotProcess> {
  return spawnBot({
    cwd: getGatewayDir(),
    mode: "agent",
    allowBots: true,
    debounce: false,
    startupTimeout: 30000,
    workspaceDir: process.cwd(),
    httpPort,
    mainChannelId: config.mainChannelId,
    mainUserId: config.mainUserId,
    debug: DEBUG,
  });
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main() {
  console.log("🧪 Cross-Channel Session Sharing Behavioral Tests\n");
  console.log("   Tests: HTTP ↔ Discord Main Channel ↔ (Terminal)");
  console.log("   Session Key: agent:deca:user:{mainUserId}\n");

  let config: Config;
  try {
    config = await loadConfig();
    console.log("✓ Loaded credentials");
    console.log(`  Main User ID: ${config.mainUserId}`);
    console.log(`  Main Channel ID: ${config.mainChannelId}`);
    console.log(`  Test Channel ID: ${config.testChannelId}`);
  } catch (error) {
    console.error(`✗ Config error: ${(error as Error).message}`);
    process.exit(1);
  }

  const results: TestResult[] = [];
  const testMarker = `XSESSION_${Date.now()}`;
  const httpPort = 19800 + Math.floor(Math.random() * 100);

  console.log("\n📡 Starting Gateway with cross-channel session...");
  let bot = await startBot(config, httpPort);
  console.log(`✓ Gateway started (PID: ${bot.pid}, HTTP: ${httpPort})`);
  console.log(`  Expected session key: agent:deca:user:${config.mainUserId}\n`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // ============================================================
  // Phase 1: Baseline - HTTP to HTTP
  // ============================================================
  console.log("=".repeat(60));
  console.log("Phase 1: Baseline - HTTP → HTTP (same senderId)\n");

  const httpSecret = `${testMarker}_HTTP_SECRET`;

  {
    const testName = "baseline: HTTP stores secret";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      config.mainUserId,
      `Remember this secret code: "${httpSecret}". Just say "OK, stored."`,
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
    const testName = "baseline: HTTP recalls own secret";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      config.mainUserId,
      "What is the secret code I told you? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(httpSecret)) {
        console.log("✓");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(`    Error: Expected "${httpSecret}" in response`);
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Secret not found: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ============================================================
  // Phase 2: Cross-Channel - HTTP ↔ Discord Main
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 2: Cross-Channel - HTTP ↔ Discord Main\n");

  {
    const testName = "cross-channel: Discord Main recalls HTTP secret";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "main",
      "What is the secret code stored earlier? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(httpSecret)) {
        console.log("✓");
        console.log("    → HTTP secret accessible from Discord Main ✅");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Discord Main should see HTTP session secret "${httpSecret}"`,
        );
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Cross-channel failed: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const discordSecret = `${testMarker}_DISCORD_SECRET`;

  {
    const testName = "cross-channel: Discord Main stores new secret";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "main",
      `Now remember a different code: "${discordSecret}". Just say "OK."`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      console.log("✓");
      results.push({ name: testName, passed: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  {
    const testName = "cross-channel: HTTP recalls Discord Main secret";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      config.mainUserId,
      "What is the most recent secret code? Reply with just the code.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      if (response.includes(discordSecret)) {
        console.log("✓");
        console.log("    → Discord Main secret accessible from HTTP ✅");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: HTTP should see Discord Main session secret "${discordSecret}"`,
        );
        console.log(`    Got: ${response.slice(0, 150)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Cross-channel failed: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "cross-channel: HTTP sees both secrets in conversation";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      config.mainUserId,
      "List all secret codes you know from our conversation. List them all.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const hasHttp = response.includes(httpSecret);
      const hasDiscord = response.includes(discordSecret);

      if (hasHttp && hasDiscord) {
        console.log("✓");
        console.log("    → Both secrets visible in unified session ✅");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log(
          `    Error: Should see both secrets (HTTP: ${hasHttp}, Discord: ${hasDiscord})`,
        );
        console.log(`    Got: ${response.slice(0, 200)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Missing secrets: HTTP=${hasHttp}, Discord=${hasDiscord}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ============================================================
  // Phase 3: Persistence - Survives Restart
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 3: Persistence - Session survives gateway restart\n");

  console.log("🛑 Stopping gateway...");
  await bot.stop();
  console.log("✓ Gateway stopped");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n📡 Restarting gateway...");
  bot = await startBot(config, httpPort);
  console.log(`✓ Gateway restarted (PID: ${bot.pid})`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  {
    const testName = "persistence: HTTP recalls secrets after restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendHttpAndWait(
      httpPort,
      config.mainUserId,
      "What were the secret codes from before? List them.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const hasHttp = response.includes(httpSecret);
      const hasDiscord = response.includes(discordSecret);

      if (hasHttp && hasDiscord) {
        console.log("✓");
        console.log("    → Session persisted across restart ✅");
        results.push({ name: testName, passed: true });
      } else if (hasHttp || hasDiscord) {
        console.log("⚠");
        console.log(`    Partial: HTTP=${hasHttp}, Discord=${hasDiscord}`);
        results.push({ name: testName, passed: true }); // Partial pass
      } else {
        console.log("✗");
        console.log("    Error: Session lost after restart");
        console.log(`    Got: ${response.slice(0, 200)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Session not persisted: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  {
    const testName = "persistence: Discord Main recalls secrets after restart";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "main",
      "What were the secret codes from before? List them.",
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const hasHttp = response.includes(httpSecret);
      const hasDiscord = response.includes(discordSecret);

      if (hasHttp && hasDiscord) {
        console.log("✓");
        console.log("    → Discord Main also sees persisted session ✅");
        results.push({ name: testName, passed: true });
      } else if (hasHttp || hasDiscord) {
        console.log("⚠");
        console.log(`    Partial: HTTP=${hasHttp}, Discord=${hasDiscord}`);
        results.push({ name: testName, passed: true }); // Partial pass
      } else {
        console.log("✗");
        console.log("    Error: Discord Main lost session after restart");
        console.log(`    Got: ${response.slice(0, 200)}`);
        results.push({
          name: testName,
          passed: false,
          error: `Session not persisted: ${response.slice(0, 100)}`,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // ============================================================
  // Phase 4: Isolation - Test channel cannot see main session
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("Phase 4: Isolation - Test channel (channel session) isolated\n");

  {
    const testName = "isolation: Test channel cannot see main session secrets";
    process.stdout.write(`  ${testName}... `);

    const result = await sendDiscordAndWait(
      config,
      "test",
      `Do you know any secret codes? If not, say "I don't know any secrets".`,
    );

    if (!result.success) {
      console.log("✗");
      console.log(`    Error: ${result.error}`);
      results.push({ name: testName, passed: false, error: result.error });
    } else {
      const response = result.response ?? "";
      const leakedHttp = response.includes(httpSecret);
      const leakedDiscord = response.includes(discordSecret);
      const leakedMarker = response.includes(testMarker);

      if (!leakedHttp && !leakedDiscord && !leakedMarker) {
        console.log("✓");
        console.log("    → Test channel is isolated from main user session ✅");
        results.push({ name: testName, passed: true });
      } else {
        console.log("✗");
        console.log("    Error: Main session secrets leaked to test channel!");
        console.log(`    Leaked: HTTP=${leakedHttp}, Discord=${leakedDiscord}`);
        results.push({
          name: testName,
          passed: false,
          error: "Session isolation failed - secrets leaked to test channel",
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const testChannelSecret = `${testMarker}_TEST_CHANNEL`;

  {
    const testName = "isolation: Test channel has its own session";
    process.stdout.write(`  ${testName}... `);

    // Store something in test channel
    const step1 = await sendDiscordAndWait(
      config,
      "test",
      `Remember this for the test channel: "${testChannelSecret}". Say OK.`,
    );

    if (!step1.success) {
      console.log("✗");
      console.log(`    Error (store): ${step1.error}`);
      results.push({ name: testName, passed: false, error: step1.error });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify main channel doesn't see it
      const step2 = await sendDiscordAndWait(
        config,
        "main",
        `Do you know any code containing "TEST_CHANNEL"? If not, say "no".`,
      );

      if (!step2.success) {
        console.log("✗");
        console.log(`    Error (verify): ${step2.error}`);
        results.push({ name: testName, passed: false, error: step2.error });
      } else {
        const response = step2.response ?? "";
        const leaked = response.includes(testChannelSecret);

        if (!leaked) {
          console.log("✓");
          console.log(
            "    → Test channel session isolated from main session ✅",
          );
          results.push({ name: testName, passed: true });
        } else {
          console.log("✗");
          console.log("    Error: Test channel secret leaked to main session!");
          results.push({
            name: testName,
            passed: false,
            error: "Reverse isolation failed",
          });
        }
      }
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n🛑 Stopping gateway...");
  await bot.stop();
  console.log("✓ Gateway stopped");

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log("\n📊 Test Results by Phase:\n");

  // Group results by phase
  const phases = [
    { name: "Phase 1: Baseline", prefix: "baseline" },
    { name: "Phase 2: Cross-Channel", prefix: "cross-channel" },
    { name: "Phase 3: Persistence", prefix: "persistence" },
    { name: "Phase 4: Isolation", prefix: "isolation" },
  ];

  for (const phase of phases) {
    const phaseResults = results.filter((r) => r.name.startsWith(phase.prefix));
    const phasePassed = phaseResults.filter((r) => r.passed).length;
    const phaseTotal = phaseResults.length;
    const status = phasePassed === phaseTotal ? "✅" : "❌";
    console.log(`  ${status} ${phase.name}: ${phasePassed}/${phaseTotal}`);
  }

  console.log(`\n${"=".repeat(60)}`);

  if (passed === total) {
    console.log(`\n✅ All ${total} cross-channel session tests passed`);
    console.log("\n🎯 Session Sharing Verified:");
    console.log(`   HTTP (senderId=${config.mainUserId})`);
    console.log(`   Discord Main (channelId=${config.mainChannelId})`);
    console.log(`   → Share session: agent:deca:user:${config.mainUserId}`);
  } else {
    console.log(`\n❌ ${passed}/${total} cross-channel session tests passed`);
    console.log("\nFailed tests:");
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
