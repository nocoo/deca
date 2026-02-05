/**
 * HTTP E2E Test Runner
 *
 * Runs end-to-end tests for the HTTP module.
 */

import { createHttpServer, createEchoHandler } from "../index";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Create test server
  const server = createHttpServer({
    handler: createEchoHandler(),
    port: 0, // Random port
  });

  await server.start();
  const baseUrl = `http://127.0.0.1:${server.port}`;

  try {
    // Test 1: Health check
    results.push(await testHealthCheck(baseUrl));

    // Test 2: Chat endpoint
    results.push(await testChatEndpoint(baseUrl));

    // Test 3: Session persistence
    results.push(await testSessionPersistence(baseUrl));

    // Test 4: Error handling
    results.push(await testErrorHandling(baseUrl));
  } finally {
    server.stop();
  }

  return results;
}

async function testHealthCheck(baseUrl: string): Promise<TestResult> {
  const name = "Health check endpoint works";

  try {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();

    if (response.status !== 200) {
      return { name, passed: false, error: `Status ${response.status}` };
    }

    if (!data.ok) {
      return { name, passed: false, error: "Expected ok: true" };
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

async function testChatEndpoint(baseUrl: string): Promise<TestResult> {
  const name = "Chat endpoint echoes messages";

  try {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello, World!" }),
    });

    const data = await response.json();

    if (response.status !== 200) {
      return { name, passed: false, error: `Status ${response.status}` };
    }

    if (!data.success) {
      return { name, passed: false, error: `Not successful: ${data.error}` };
    }

    if (data.response !== "Echo: Hello, World!") {
      return { name, passed: false, error: `Unexpected response: ${data.response}` };
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

async function testSessionPersistence(baseUrl: string): Promise<TestResult> {
  const name = "Session ID is preserved";

  try {
    const response1 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first", sessionId: "test-session-123" }),
    });

    const data1 = await response1.json();

    if (data1.sessionId !== "test-session-123") {
      return {
        name,
        passed: false,
        error: `Session ID not preserved: ${data1.sessionId}`,
      };
    }

    // Second request with same session
    const response2 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "second", sessionId: "test-session-123" }),
    });

    const data2 = await response2.json();

    if (data2.sessionId !== "test-session-123") {
      return {
        name,
        passed: false,
        error: `Session ID not preserved in second request: ${data2.sessionId}`,
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

async function testErrorHandling(baseUrl: string): Promise<TestResult> {
  const name = "Error handling for missing message";

  try {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.status !== 400) {
      return { name, passed: false, error: `Expected 400, got ${response.status}` };
    }

    if (data.error !== "message_required") {
      return { name, passed: false, error: `Unexpected error: ${data.error}` };
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
  console.log("🧪 Running HTTP E2E Tests...\n");

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
