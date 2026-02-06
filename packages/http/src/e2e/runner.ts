/**
 * HTTP E2E Test Runner
 *
 * Spawns HTTP server as subprocess, sends real HTTP requests, verifies responses.
 * This is a true end-to-end test that validates the full request/response cycle.
 *
 * Usage:
 *   bun run packages/http/src/e2e/runner.ts
 *   bun run packages/http/src/e2e/runner.ts --debug
 */

import { type ServerProcess, getPackageDir, spawnServer } from "./spawner";

// ============================================================================
// Configuration
// ============================================================================

const DEBUG = process.argv.includes("--debug");

// ============================================================================
// Test Framework
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestContext {
  baseUrl: string;
  apiKey?: string;
}

type TestFn = (ctx: TestContext) => Promise<void>;

interface TestSuite {
  name: string;
  apiKey?: string;
  tests: { name: string; fn: TestFn }[];
}

const suites: TestSuite[] = [];

function suite(name: string, apiKey?: string): TestSuite {
  const s: TestSuite = { name, apiKey, tests: [] };
  suites.push(s);
  return s;
}

// ============================================================================
// Test Suites
// ============================================================================

// --- Suite 1: Basic Functionality (no API key) ---
const basicSuite = suite("Basic Functionality");

basicSuite.tests.push({
  name: "health endpoint returns ok",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!data.ok) {
      throw new Error(`Expected ok: true, got ${JSON.stringify(data)}`);
    }
  },
});

basicSuite.tests.push({
  name: "chat endpoint echoes messages",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello, World!" }),
    });

    const data = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!data.success) {
      throw new Error(`Expected success: true, got ${JSON.stringify(data)}`);
    }

    if (data.response !== "Echo: Hello, World!") {
      throw new Error(`Unexpected response: ${data.response}`);
    }
  },
});

basicSuite.tests.push({
  name: "session ID is preserved across requests",
  fn: async ({ baseUrl }) => {
    const senderId = `test-user-${Date.now()}`;

    // First request with senderId
    const response1 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first", senderId }),
    });

    const data1 = await response1.json();

    // Session ID should be normalized userId (lowercase)
    const expectedSessionId = senderId.toLowerCase();
    if (data1.sessionId !== expectedSessionId) {
      throw new Error(
        `Session ID not preserved: expected ${expectedSessionId}, got ${data1.sessionId}`,
      );
    }

    // Second request with same sender
    const response2 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "second", senderId }),
    });

    const data2 = await response2.json();

    if (data2.sessionId !== expectedSessionId) {
      throw new Error(
        `Session ID not preserved in second request: ${data2.sessionId}`,
      );
    }
  },
});

basicSuite.tests.push({
  name: "returns 400 for missing message",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }

    if (data.error !== "message_required") {
      throw new Error(`Expected error: message_required, got ${data.error}`);
    }
  },
});

basicSuite.tests.push({
  name: "message endpoint works as alternative to chat",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test message" }), // /message uses 'content' not 'message'
    });

    const data = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!data.success) {
      throw new Error("Expected success: true");
    }

    if (data.text !== "Echo: test message") {
      throw new Error(`Unexpected response: ${data.text}`);
    }
  },
});

// --- Suite 2: API Key Authentication ---
const authSuite = suite("API Key Authentication", "test-api-key-12345");

authSuite.tests.push({
  name: "rejects requests without API key",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  },
});

authSuite.tests.push({
  name: "rejects requests with wrong API key",
  fn: async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  },
});

authSuite.tests.push({
  name: "accepts requests with correct API key",
  fn: async ({ baseUrl, apiKey }) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey ?? "",
      },
      body: JSON.stringify({ message: "authenticated" }),
    });

    const data = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!data.success) {
      throw new Error("Expected success: true");
    }
  },
});

authSuite.tests.push({
  name: "health endpoint bypasses authentication",
  fn: async ({ baseUrl }) => {
    // Health should work without auth even when API key is configured
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!data.ok) {
      throw new Error("Expected ok: true");
    }
  },
});

// ============================================================================
// Runner
// ============================================================================

async function runSuite(suiteDef: TestSuite): Promise<TestResult[]> {
  console.log(`\n📦 ${suiteDef.name}`);
  if (suiteDef.apiKey) {
    console.log(`   (API Key: ${suiteDef.apiKey.slice(0, 8)}...)`);
  }
  console.log("");

  // Spawn server for this suite
  let server: ServerProcess;
  try {
    server = await spawnServer({
      apiKey: suiteDef.apiKey,
      startupTimeout: 10000,
      debug: DEBUG,
    });
    console.log(
      `   ✓ Server started (PID: ${server.pid}, Port: ${server.port})\n`,
    );
  } catch (error) {
    console.error(
      `   ✗ Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
    );
    return suiteDef.tests.map((t) => ({
      name: t.name,
      passed: false,
      duration: 0,
      error: "Server startup failed",
    }));
  }

  const results: TestResult[] = [];

  try {
    for (const { name, fn } of suiteDef.tests) {
      const start = Date.now();
      process.stdout.write(`   ${name}... `);

      try {
        await fn({ baseUrl: server.baseUrl, apiKey: suiteDef.apiKey });
        const duration = Date.now() - start;
        results.push({ name, passed: true, duration });
        console.log(`✓ (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - start;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, duration, error: errorMsg });
        console.log(`✗ (${duration}ms)`);
        console.log(`      Error: ${errorMsg}`);
      }

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    // Stop server
    console.log("\n   🛑 Stopping server...");
    await server.stop();
    console.log("   ✓ Server stopped");
  }

  return results;
}

async function runTests(): Promise<void> {
  console.log("🧪 HTTP E2E Test Runner");
  console.log(`   Package: ${getPackageDir()}`);

  const allResults: TestResult[] = [];

  // Run each suite with its own server configuration
  for (const suiteDef of suites) {
    const results = await runSuite(suiteDef);
    allResults.push(...results);
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  const passed = allResults.filter((r) => r.passed).length;
  const total = allResults.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(`✅ All ${total} tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} tests passed`);
    console.log("\nFailed tests:");
    for (const r of allResults.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
