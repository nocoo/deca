/**
 * Gateway E2E Test Runner
 *
 * Runs end-to-end tests for the Gateway module.
 *
 * Test categories:
 * 1. Echo mode tests (no credentials required)
 * 2. Real LLM tests (requires Anthropic credentials)
 * 3. Discord integration tests (requires Discord credentials)
 */

import {
  type DiscordMessageData,
  fetchChannelMessages,
  waitForBotResponse,
} from "@deca/discord/e2e/fetcher";
import {
  createTestMessage,
  generateTestId,
  sendWebhookMessage,
} from "@deca/discord/e2e/webhook";
import { createEchoGateway } from "../index";
import {
  hasAnthropicCredentials,
  hasDiscordCredentials,
  requireDiscordCredentials,
} from "./credentials";
import { spawnGateway } from "./spawner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  skipped?: boolean;
  duration?: number;
}

// ============================================================================
// Echo Mode Tests (no credentials required)
// ============================================================================

async function testHttpChannel(): Promise<TestResult> {
  const name = "Gateway starts HTTP channel";

  try {
    const gateway = createEchoGateway({
      http: { port: 0 },
    });

    await gateway.start();

    if (!gateway.isRunning) {
      return { name, passed: false, error: "Gateway not running" };
    }

    if (!gateway.channels.includes("http")) {
      return { name, passed: false, error: "HTTP channel not active" };
    }

    await gateway.stop();

    if (gateway.isRunning) {
      return { name, passed: false, error: "Gateway still running after stop" };
    }

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testHandlerIntegration(): Promise<TestResult> {
  const name = "Handler echoes messages correctly";

  try {
    const gateway = createEchoGateway({
      http: { port: 0 },
      echoPrefix: "Test: ",
    });

    const response = await gateway.handler.handle({
      sessionKey: "e2e:test:session",
      content: "hello world",
      sender: { id: "e2e-user" },
    });

    if (!response.success) {
      return { name, passed: false, error: "Response not successful" };
    }

    if (response.text !== "Test: hello world") {
      return {
        name,
        passed: false,
        error: `Unexpected response: ${response.text}`,
      };
    }

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testMultipleChannels(): Promise<TestResult> {
  const name = "Gateway supports multiple channels";

  try {
    const gateway = createEchoGateway({
      http: { port: 0 },
      terminal: { enabled: true, userId: "e2e-user" },
    });

    await gateway.start();

    const channels = gateway.channels;

    if (!channels.includes("http")) {
      return { name, passed: false, error: "HTTP channel missing" };
    }

    if (!channels.includes("terminal")) {
      return { name, passed: false, error: "Terminal channel missing" };
    }

    await gateway.stop();

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testEventCallbacks(): Promise<TestResult> {
  const name = "Event callbacks are triggered";

  try {
    let startCalled = false;
    let stopCalled = false;

    const gateway = createEchoGateway({
      http: { port: 0 },
      events: {
        onStart: () => {
          startCalled = true;
        },
        onStop: () => {
          stopCalled = true;
        },
      },
    });

    await gateway.start();

    if (!startCalled) {
      return { name, passed: false, error: "onStart not called" };
    }

    await gateway.stop();

    if (!stopCalled) {
      return { name, passed: false, error: "onStop not called" };
    }

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Dispatcher E2E Tests (in-process, echo mode)
// ============================================================================

async function testDispatcherProcessesRequests(): Promise<TestResult> {
  const name = "Dispatcher processes requests through gateway";

  try {
    const gateway = createEchoGateway({
      http: { port: 0 },
      echoPrefix: "Dispatched: ",
    });

    await gateway.start();

    const response = await gateway.handler?.handle({
      sessionKey: "e2e:dispatcher:test",
      content: "hello dispatcher",
      sender: { id: "e2e-user" },
    });

    await gateway.stop();

    if (!response?.success) {
      return { name, passed: false, error: "Response not successful" };
    }

    if (response.text !== "Dispatched: hello dispatcher") {
      return {
        name,
        passed: false,
        error: `Unexpected response: ${response.text}`,
      };
    }

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testDispatcherHandlesMultipleRequests(): Promise<TestResult> {
  const name = "Dispatcher handles multiple concurrent requests";

  try {
    const gateway = createEchoGateway({
      http: { port: 0 },
      echoPrefix: "Echo: ",
    });

    await gateway.start();

    const requests = [
      gateway.handler?.handle({
        sessionKey: "e2e:multi:1",
        content: "message 1",
        sender: { id: "user1" },
      }),
      gateway.handler?.handle({
        sessionKey: "e2e:multi:2",
        content: "message 2",
        sender: { id: "user2" },
      }),
      gateway.handler?.handle({
        sessionKey: "e2e:multi:3",
        content: "message 3",
        sender: { id: "user3" },
      }),
    ];

    const responses = await Promise.all(requests);

    await gateway.stop();

    const allSuccessful = responses.every((r) => r?.success);
    if (!allSuccessful) {
      return { name, passed: false, error: "Not all responses successful" };
    }

    const expectedResponses = [
      "Echo: message 1",
      "Echo: message 2",
      "Echo: message 3",
    ];
    const actualResponses = responses.map((r) => r?.text);

    for (const expected of expectedResponses) {
      if (!actualResponses.includes(expected)) {
        return {
          name,
          passed: false,
          error: `Missing expected response: ${expected}`,
        };
      }
    }

    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Real LLM Tests (requires Anthropic credentials)
// ============================================================================

async function testRealLLMViaHTTP(): Promise<TestResult> {
  const name = "Real LLM responds via HTTP (subprocess)";
  const startTime = Date.now();

  if (!hasAnthropicCredentials()) {
    return {
      name,
      passed: true,
      skipped: true,
      error: "Anthropic credentials not found",
    };
  }

  let gateway: Awaited<ReturnType<typeof spawnGateway>> | null = null;

  try {
    // Spawn gateway with real agent
    gateway = await spawnGateway({
      echoMode: false,
      debug: false,
    });

    // Send a simple question
    const response = await fetch(`${gateway.httpBaseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionKey: "e2e:llm:test",
        message: "What is 2+2? Reply with just the number.",
      }),
      signal: AbortSignal.timeout(60000), // LLM can be slow
    });

    if (!response.ok) {
      const text = await response.text();
      return { name, passed: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = (await response.json()) as {
      response?: string;
      error?: string;
    };

    if (data.error) {
      return { name, passed: false, error: data.error };
    }

    if (!data.response) {
      return { name, passed: false, error: "No response in JSON" };
    }

    // Check that the response mentions "4"
    if (!data.response.includes("4")) {
      return {
        name,
        passed: false,
        error: `Response doesn't contain "4": ${data.response.slice(0, 100)}`,
      };
    }

    return { name, passed: true, duration: Date.now() - startTime };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  } finally {
    if (gateway) {
      await gateway.stop();
    }
  }
}

async function testSubprocessEchoMode(): Promise<TestResult> {
  const name = "Gateway subprocess works in echo mode";
  const startTime = Date.now();

  let gateway: Awaited<ReturnType<typeof spawnGateway>> | null = null;

  try {
    // Spawn gateway in echo mode (no credentials needed)
    gateway = await spawnGateway({
      echoMode: true,
      debug: false,
    });

    // Send a message
    const response = await fetch(`${gateway.httpBaseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionKey: "e2e:echo:test",
        message: "hello from e2e test",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const text = await response.text();
      return { name, passed: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = (await response.json()) as { response?: string };

    if (!data.response) {
      return { name, passed: false, error: "No response in JSON" };
    }

    // Echo mode should echo back the message
    if (!data.response.includes("hello from e2e test")) {
      return {
        name,
        passed: false,
        error: `Echo didn't work: ${data.response}`,
      };
    }

    return { name, passed: true, duration: Date.now() - startTime };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  } finally {
    if (gateway) {
      await gateway.stop();
    }
  }
}

// ============================================================================
// Discord Integration Tests (requires Discord credentials)
// ============================================================================

async function testDiscordWebhookFlow(): Promise<TestResult> {
  const name = "Discord webhook → Agent → LLM → Reply";
  const startTime = Date.now();

  if (!hasAnthropicCredentials() || !hasDiscordCredentials()) {
    return {
      name,
      passed: true,
      skipped: true,
      error: "Anthropic or Discord credentials not found",
    };
  }

  let gateway: Awaited<ReturnType<typeof spawnGateway>> | null = null;

  try {
    const discord = requireDiscordCredentials();
    const testServer = discord.servers?.test;

    if (!testServer?.testChannelWebhookUrl || !testServer?.testChannelId) {
      return {
        name,
        passed: false,
        error:
          "Discord test server config missing testChannelWebhookUrl or testChannelId",
      };
    }

    // 1. Spawn gateway with Discord channel and real agent
    gateway = await spawnGateway({
      echoMode: false,
      discord,
      debug: false,
    });

    // 2. Generate test ID and send webhook message
    const testId = generateTestId();
    const testMessage = createTestMessage(
      testId,
      "What is the capital of France? Reply briefly.",
    );

    const webhookResult = await sendWebhookMessage(
      { url: testServer.testChannelWebhookUrl },
      { content: testMessage },
    );

    if (!webhookResult.success) {
      return {
        name,
        passed: false,
        error: `Webhook failed: ${webhookResult.error}`,
      };
    }

    // Store the webhook message ID to exclude it later
    const webhookMessageId = webhookResult.id;

    // 3. Wait for bot response (LLM call can take time)
    // Custom wait that excludes the webhook message
    const botResponses = await waitForBotReplies(
      { botToken: discord.botToken, channelId: testServer.testChannelId },
      testId,
      webhookMessageId,
      {
        timeout: 60000, // 60 seconds for LLM
        interval: 1000,
        minMessages: 2, // Wait for at least 2 messages (debug + actual response)
      },
    );

    if (botResponses.length === 0) {
      return {
        name,
        passed: false,
        error: "Timeout waiting for bot response",
        duration: Date.now() - startTime,
      };
    }

    // 4. Verify at least one response mentions Paris
    const hasParisResponse = botResponses.some(
      (msg) =>
        msg.content.toLowerCase().includes("paris") ||
        msg.content.includes("Paris"),
    );

    if (!hasParisResponse) {
      const allContent = botResponses.map((m) => m.content).join("\n---\n");
      return {
        name,
        passed: false,
        error: `No response mentions Paris. Got ${botResponses.length} messages: ${allContent.slice(0, 300)}`,
        duration: Date.now() - startTime,
      };
    }

    return { name, passed: true, duration: Date.now() - startTime };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  } finally {
    if (gateway) {
      await gateway.stop();
    }
  }
}

/**
 * Wait for bot replies, excluding the original webhook message.
 * Returns all bot messages found that match criteria.
 */
async function waitForBotReplies(
  config: { botToken: string; channelId: string },
  testId: string,
  excludeMessageId: string | undefined,
  options: { timeout: number; interval: number; minMessages?: number },
): Promise<DiscordMessageData[]> {
  const startTime = Date.now();
  const minMessages = options.minMessages ?? 1;

  while (Date.now() - startTime < options.timeout) {
    const result = await fetchChannelMessages(config, 20);

    if (result.success) {
      // Find all bot messages that:
      // 1. Are NOT the webhook message we sent
      // 2. Are from a bot (author.bot = true)
      // 3. Reference our test message
      const responses = result.messages.filter((msg) => {
        if (excludeMessageId && msg.id === excludeMessageId) {
          return false; // Skip the webhook message
        }
        if (!msg.author.bot) {
          return false; // Only bot messages
        }
        // Look for response that references our test ID OR is a direct reply
        return (
          msg.content.includes(testId) ||
          isReplyToTestMessage(msg, excludeMessageId)
        );
      });

      // Return if we have enough messages
      if (responses.length >= minMessages) {
        return responses;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, options.interval));
  }

  // Return whatever we found, even if less than minMessages
  const finalResult = await fetchChannelMessages(config, 20);
  if (finalResult.success) {
    return finalResult.messages.filter((msg) => {
      if (excludeMessageId && msg.id === excludeMessageId) return false;
      if (!msg.author.bot) return false;
      return (
        msg.content.includes(testId) ||
        isReplyToTestMessage(msg, excludeMessageId)
      );
    });
  }

  return [];
}

/**
 * Wait for bot reply, excluding the original webhook message.
 */
async function waitForBotReply(
  config: { botToken: string; channelId: string },
  testId: string,
  excludeMessageId: string | undefined,
  options: { timeout: number; interval: number },
): Promise<DiscordMessageData | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < options.timeout) {
    const result = await fetchChannelMessages(config, 20);

    if (result.success) {
      // Find a bot message that:
      // 1. Contains the test ID (it's a reply to our message)
      // 2. Is NOT the webhook message we sent
      // 3. Is from a bot (author.bot = true)
      const response = result.messages.find((msg) => {
        if (excludeMessageId && msg.id === excludeMessageId) {
          return false; // Skip the webhook message
        }
        if (!msg.author.bot) {
          return false; // Only bot messages
        }
        // Look for response that references our test ID OR is a direct reply
        // The bot response might not contain testId, but it should be newer than our webhook message
        return (
          msg.content.includes(testId) ||
          isReplyToTestMessage(msg, excludeMessageId)
        );
      });

      if (response) {
        return response;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, options.interval));
  }

  return null;
}

/**
 * Check if a message is a reply to the test message.
 */
function isReplyToTestMessage(
  msg: DiscordMessageData,
  webhookMessageId: string | undefined,
): boolean {
  // Discord messages have a referenced_message field for replies
  const msgWithRef = msg as DiscordMessageData & {
    referenced_message?: { id: string };
    message_reference?: { message_id: string };
  };

  if (webhookMessageId) {
    if (msgWithRef.referenced_message?.id === webhookMessageId) {
      return true;
    }
    if (msgWithRef.message_reference?.message_id === webhookMessageId) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Main Runner
// ============================================================================

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("📦 Echo Mode Tests (in-process)\n");

  // Echo mode tests (fast, no subprocess)
  results.push(await testHttpChannel());
  results.push(await testHandlerIntegration());
  results.push(await testMultipleChannels());
  results.push(await testEventCallbacks());

  console.log("\n📤 Dispatcher E2E Tests (in-process)\n");

  // Dispatcher integration tests
  results.push(await testDispatcherProcessesRequests());
  results.push(await testDispatcherHandlesMultipleRequests());

  console.log("\n🔧 Subprocess Tests\n");

  // Subprocess tests
  results.push(await testSubprocessEchoMode());

  console.log("\n🤖 Real LLM Tests\n");

  // Real LLM tests (requires credentials)
  results.push(await testRealLLMViaHTTP());

  console.log("\n💬 Discord Integration Tests\n");

  // Discord tests (requires credentials)
  results.push(await testDiscordWebhookFlow());

  return results;
}

async function main() {
  console.log("🧪 Running Gateway E2E Tests...\n");
  console.log(`${"=".repeat(60)}\n`);

  const results = await runTests();

  console.log(`\n${"=".repeat(60)}`);
  console.log("\n📊 Summary\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    if (result.skipped) {
      console.log(`⏭️  ${result.name} (skipped: ${result.error})`);
      skipped++;
    } else if (result.passed) {
      const duration = result.duration ? ` (${result.duration}ms)` : "";
      console.log(`✅ ${result.name}${duration}`);
      passed++;
    } else {
      console.log(`❌ ${result.name}`);
      console.log(`   Error: ${result.error}`);
      failed++;
    }
  }

  console.log(
    `\n📈 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("E2E runner failed:", error);
  process.exit(1);
});
