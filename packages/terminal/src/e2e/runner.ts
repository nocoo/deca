/**
 * Terminal E2E Test Runner
 *
 * Runs end-to-end tests for the terminal module.
 */

import { createTerminal, createEchoHandler } from "../index";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Terminal handles message
  results.push(await testTerminalHandlesMessage());

  // Test 2: Terminal handles streaming
  results.push(await testTerminalStreaming());

  // Test 3: Terminal handles errors
  results.push(await testTerminalHandlesErrors());

  // Test 4: Session key is preserved
  results.push(await testSessionKeyPreserved());

  return results;
}

async function testTerminalHandlesMessage(): Promise<TestResult> {
  const name = "Terminal handles message with echo handler";

  try {
    const output: string[] = [];
    const terminal = createTerminal({
      handler: createEchoHandler(),
      streaming: false,
      input: process.stdin,
      output: {
        write: (chunk: string) => {
          output.push(chunk);
          return true;
        },
      } as NodeJS.WritableStream,
    });

    const response = await terminal.send("hello world");

    if (!response.success) {
      return { name, passed: false, error: "Response was not successful" };
    }

    if (response.text !== "Echo: hello world") {
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

async function testTerminalStreaming(): Promise<TestResult> {
  const name = "Terminal supports streaming output";

  try {
    const chunks: string[] = [];
    const terminal = createTerminal({
      handler: createEchoHandler({
        prefix: "",
        simulateStreaming: true,
        streamingDelayMs: 0,
      }),
      streaming: true,
      input: process.stdin,
      output: {
        write: (chunk: string) => {
          chunks.push(chunk);
          return true;
        },
      } as NodeJS.WritableStream,
    });

    await terminal.send("ab");

    // Should have received individual characters
    if (!chunks.includes("a") || !chunks.includes("b")) {
      return {
        name,
        passed: false,
        error: `Expected streaming chunks, got: ${JSON.stringify(chunks)}`,
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

async function testTerminalHandlesErrors(): Promise<TestResult> {
  const name = "Terminal handles handler errors gracefully";

  try {
    let errorReceived: Error | null = null;

    const terminal = createTerminal({
      handler: {
        async handle() {
          throw new Error("Test error");
        },
      },
      streaming: false,
      input: process.stdin,
      output: {
        write: () => true,
      } as NodeJS.WritableStream,
      events: {
        onError: (err) => {
          errorReceived = err;
        },
      },
    });

    const response = await terminal.send("test");

    if (response.success) {
      return { name, passed: false, error: "Expected response to fail" };
    }

    if (!errorReceived) {
      return { name, passed: false, error: "Expected onError callback to be called" };
    }

    if (errorReceived.message !== "Test error") {
      return { name, passed: false, error: `Unexpected error: ${errorReceived.message}` };
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

async function testSessionKeyPreserved(): Promise<TestResult> {
  const name = "Session key is preserved across messages";

  try {
    let capturedSessionKey: string | null = null;

    const terminal = createTerminal({
      handler: {
        async handle(request) {
          capturedSessionKey = request.sessionKey;
          return { text: "ok", success: true };
        },
      },
      sessionKey: "test:session:123",
      streaming: false,
      input: process.stdin,
      output: {
        write: () => true,
      } as NodeJS.WritableStream,
    });

    await terminal.send("first");
    const firstKey = capturedSessionKey;

    await terminal.send("second");
    const secondKey = capturedSessionKey;

    if (firstKey !== secondKey) {
      return {
        name,
        passed: false,
        error: `Session keys differ: ${firstKey} vs ${secondKey}`,
      };
    }

    if (terminal.sessionKey !== "test:session:123") {
      return {
        name,
        passed: false,
        error: `Terminal sessionKey mismatch: ${terminal.sessionKey}`,
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

// Main
async function main() {
  console.log("🧪 Running Terminal E2E Tests...\n");

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
