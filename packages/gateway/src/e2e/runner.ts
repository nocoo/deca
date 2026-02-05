/**
 * Gateway E2E Test Runner
 *
 * Runs end-to-end tests for the Gateway module.
 */

import { createEchoGateway } from "../index";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Gateway with HTTP channel
  results.push(await testHttpChannel());

  // Test 2: Handler integration
  results.push(await testHandlerIntegration());

  // Test 3: Multiple channels
  results.push(await testMultipleChannels());

  // Test 4: Event callbacks
  results.push(await testEventCallbacks());

  return results;
}

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
      return { name, passed: false, error: `Unexpected response: ${response.text}` };
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

// Main
async function main() {
  console.log("🧪 Running Gateway E2E Tests...\n");

  const results = await runTests();

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✅ ${result.name}`);
      passed++;
    } else {
      console.log(`❌ ${result.name}`);
      console.log(`   Error: ${result.error}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("E2E runner failed:", error);
  process.exit(1);
});
