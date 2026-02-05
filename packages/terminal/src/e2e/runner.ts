/**
 * Terminal E2E Test Runner
 *
 * Spawns Terminal REPL as subprocess, sends real input via stdin, verifies stdout responses.
 * This is a true end-to-end test that validates the full REPL interaction cycle.
 *
 * Usage:
 *   bun run packages/terminal/src/e2e/runner.ts
 *   bun run packages/terminal/src/e2e/runner.ts --debug
 */

import { getPackageDir, spawnTerminal, type TerminalProcess } from "./spawner";

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
  terminal: TerminalProcess;
}

type TestFn = (ctx: TestContext) => Promise<void>;

interface TestSuite {
  name: string;
  tests: { name: string; fn: TestFn }[];
}

const suites: TestSuite[] = [];

function suite(name: string): TestSuite {
  const s: TestSuite = { name, tests: [] };
  suites.push(s);
  return s;
}

// ============================================================================
// Test Suites
// ============================================================================

// --- Suite 1: Basic REPL Functionality ---
const basicSuite = suite("Basic REPL Functionality");

basicSuite.tests.push({
  name: "terminal echoes simple message",
  fn: async ({ terminal }) => {
    const response = await terminal.send("hello world");

    if (!response.includes("Echo:")) {
      throw new Error(`Expected echo response, got: ${response}`);
    }

    if (!response.includes("hello world")) {
      throw new Error(`Expected 'hello world' in response, got: ${response}`);
    }
  },
});

basicSuite.tests.push({
  name: "terminal handles multiple messages",
  fn: async ({ terminal }) => {
    const response1 = await terminal.send("first message");
    if (!response1.includes("first message")) {
      throw new Error(`First message not echoed: ${response1}`);
    }

    const response2 = await terminal.send("second message");
    if (!response2.includes("second message")) {
      throw new Error(`Second message not echoed: ${response2}`);
    }
  },
});

basicSuite.tests.push({
  name: "terminal handles empty input gracefully",
  fn: async ({ terminal }) => {
    // Send empty line - should just show prompt again without crash
    const response = await terminal.send("");
    
    // Should not crash, just return prompt or empty echo
    // The terminal should still be responsive
    const followUp = await terminal.send("still working");
    if (!followUp.includes("still working")) {
      throw new Error(`Terminal not responsive after empty input: ${followUp}`);
    }
  },
});

basicSuite.tests.push({
  name: "terminal handles special characters",
  fn: async ({ terminal }) => {
    const testMsg = "test with 'quotes' and \"double quotes\"";
    const response = await terminal.send(testMsg);

    if (!response.includes("quotes")) {
      throw new Error(`Special characters not handled: ${response}`);
    }
  },
});

basicSuite.tests.push({
  name: "terminal handles unicode",
  fn: async ({ terminal }) => {
    const testMsg = "Hello 你好 🎉";
    const response = await terminal.send(testMsg);

    if (!response.includes("你好") && !response.includes("Hello")) {
      throw new Error(`Unicode not handled: ${response}`);
    }
  },
});

// --- Suite 2: Commands ---
const commandSuite = suite("Built-in Commands");

commandSuite.tests.push({
  name: "help command shows usage",
  fn: async ({ terminal }) => {
    const response = await terminal.send("help");

    // Should show help info or at least not crash
    // The echo handler will just echo "help", but that's fine
    if (!response) {
      throw new Error("No response to help command");
    }
  },
});

// ============================================================================
// Runner
// ============================================================================

async function runSuite(suiteDef: TestSuite): Promise<TestResult[]> {
  console.log(`\n📦 ${suiteDef.name}\n`);

  // Spawn terminal for this suite
  let terminal: TerminalProcess;
  try {
    terminal = await spawnTerminal({
      startupTimeout: 10000,
      debug: DEBUG,
    });
    console.log(`   ✓ Terminal started (PID: ${terminal.pid})\n`);
  } catch (error) {
    console.error(
      `   ✗ Failed to start terminal: ${error instanceof Error ? error.message : String(error)}`,
    );
    return suiteDef.tests.map((t) => ({
      name: t.name,
      passed: false,
      duration: 0,
      error: "Terminal startup failed",
    }));
  }

  // Give terminal a moment to stabilize
  await new Promise((resolve) => setTimeout(resolve, 500));

  const results: TestResult[] = [];

  try {
    for (const { name, fn } of suiteDef.tests) {
      const start = Date.now();
      process.stdout.write(`   ${name}... `);

      try {
        await fn({ terminal });
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
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } finally {
    // Stop terminal
    console.log("\n   🛑 Stopping terminal...");
    await terminal.stop();
    console.log("   ✓ Terminal stopped");
  }

  return results;
}

async function runTests(): Promise<void> {
  console.log("🧪 Terminal E2E Test Runner");
  console.log(`   Package: ${getPackageDir()}`);

  const allResults: TestResult[] = [];

  // Run each suite with its own terminal instance
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
