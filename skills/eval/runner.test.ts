/**
 * Unit tests for eval runner
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type RunnerConfig,
  createPendingResults,
  executeCase,
  fetchWithTimeout,
  getGitCommit,
  run,
  runCases,
  savePendingResults,
} from "./runner.js";
import type { EvalCase } from "./types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const testCase: EvalCase = {
  id: "test-001",
  name: "Test Case",
  description: "A test case for testing",
  targetPrompt: "TEST.md",
  category: "test",
  input: "Hello",
  criteria: "Should respond appropriately",
  quickCheck: {
    containsAny: ["hello", "hi"],
  },
  passThreshold: 70,
};

const testConfig: RunnerConfig = {
  gatewayUrl: "http://localhost:9999",
  outputDir: "./test-reports",
  model: "test-model",
  timeout: 1000,
};

// =============================================================================
// getGitCommit tests
// =============================================================================

describe("getGitCommit", () => {
  it("should return a git commit hash", async () => {
    const commit = await getGitCommit();

    // Should be a string
    expect(typeof commit).toBe("string");

    // Should not be empty (we're in a git repo)
    expect(commit.length).toBeGreaterThan(0);

    // Should be either a valid short hash or "unknown"
    if (commit !== "unknown") {
      expect(commit).toMatch(/^[a-f0-9]+$/);
    }
  });
});

// =============================================================================
// fetchWithTimeout tests
// =============================================================================

describe("fetchWithTimeout", () => {
  it("should complete fetch within timeout", async () => {
    // Use a real endpoint that responds quickly
    const response = await fetchWithTimeout(
      "https://httpbin.org/get",
      { method: "GET" },
      5000,
    );

    expect(response.ok).toBe(true);
  });

  it("should abort on timeout", async () => {
    // Use a slow endpoint with very short timeout
    await expect(
      fetchWithTimeout("https://httpbin.org/delay/10", { method: "GET" }, 100),
    ).rejects.toThrow();
  });
});

// =============================================================================
// executeCase tests
// =============================================================================

describe("executeCase", () => {
  // Store original fetch
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  it("should return result with output on successful response", async () => {
    // Mock fetch
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          response: "Hello there! I am Tomato 🍅",
          success: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await executeCase(testCase, testConfig);

    expect(result.caseId).toBe("test-001");
    expect(result.caseName).toBe("Test Case");
    expect(result.output).toBe("Hello there! I am Tomato 🍅");
    expect(result.error).toBeUndefined();
    expect(result.quickCheck.ran).toBe(true);
    expect(result.quickCheck.passed).toBe(false); // "hello" or "hi" not in output
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("should return result with quickCheck passed when output matches", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          response: "hello world",
          success: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await executeCase(testCase, testConfig);

    expect(result.quickCheck.ran).toBe(true);
    expect(result.quickCheck.passed).toBe(true);
  });

  it("should return error on HTTP error response", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const result = await executeCase(testCase, testConfig);

    expect(result.error).toBe("HTTP 500: Internal Server Error");
    expect(result.output).toBe("");
    expect(result.quickCheck.ran).toBe(false);
  });

  it("should return error when success=false", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          response: "partial response",
          success: false,
          error: "Agent failed",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await executeCase(testCase, testConfig);

    expect(result.error).toBe("Agent failed");
    expect(result.output).toBe("partial response");
    expect(result.quickCheck.ran).toBe(false);
  });

  it("should return error on network failure", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Connection refused");
    });

    const result = await executeCase(testCase, testConfig);

    expect(result.error).toBe("Connection refused");
    expect(result.output).toBe("");
  });

  it("should include API key header when configured", async () => {
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = mock(async (url: string, options: RequestInit) => {
      capturedHeaders = new Headers(options.headers);
      return new Response(JSON.stringify({ response: "ok", success: true }), {
        status: 200,
      });
    });

    const configWithKey = { ...testConfig, apiKey: "test-key-123" };
    await executeCase(testCase, configWithKey);

    expect(capturedHeaders?.get("X-API-Key")).toBe("test-key-123");
  });

  it("should not include API key header when not configured", async () => {
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = mock(async (url: string, options: RequestInit) => {
      capturedHeaders = new Headers(options.headers);
      return new Response(JSON.stringify({ response: "ok", success: true }), {
        status: 200,
      });
    });

    await executeCase(testCase, testConfig);

    expect(capturedHeaders?.get("X-API-Key")).toBeNull();
  });

  it("should handle case without quickCheck", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ response: "response", success: true }),
        { status: 200 },
      );
    });

    const caseWithoutCheck: EvalCase = {
      ...testCase,
      quickCheck: undefined,
    };

    const result = await executeCase(caseWithoutCheck, testConfig);

    expect(result.quickCheck.ran).toBe(false);
    expect(result.quickCheck.passed).toBeNull();
  });
});

// =============================================================================
// runCases tests
// =============================================================================

describe("runCases", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should run all cases sequentially", async () => {
    const cases: EvalCase[] = [
      { ...testCase, id: "case-1", name: "Case 1" },
      { ...testCase, id: "case-2", name: "Case 2" },
      { ...testCase, id: "case-3", name: "Case 3" },
    ];

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ response: "hello", success: true }),
        { status: 200 },
      );
    });

    const results = await runCases(cases, testConfig);

    expect(results.length).toBe(3);
    expect(results[0].caseId).toBe("case-1");
    expect(results[1].caseId).toBe("case-2");
    expect(results[2].caseId).toBe("case-3");
  });

  it("should call onProgress callback", async () => {
    const cases: EvalCase[] = [
      { ...testCase, id: "case-1", name: "Case 1" },
      { ...testCase, id: "case-2", name: "Case 2" },
    ];

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ response: "hello", success: true }),
        { status: 200 },
      );
    });

    const progressCalls: Array<[number, number, string]> = [];

    await runCases(cases, testConfig, (completed, total, result) => {
      progressCalls.push([completed, total, result.caseId]);
    });

    expect(progressCalls).toEqual([
      [1, 2, "case-1"],
      [2, 2, "case-2"],
    ]);
  });

  it("should handle empty cases array", async () => {
    const results = await runCases([], testConfig);

    expect(results).toEqual([]);
  });
});

// =============================================================================
// createPendingResults tests
// =============================================================================

describe("createPendingResults", () => {
  it("should create pending results with metadata", async () => {
    const results = [
      {
        caseId: "test-001",
        caseName: "Test Case",
        targetPrompt: "TEST.md",
        category: "test",
        input: "Hello",
        output: "World",
        durationMs: 100,
        quickCheck: { ran: true, passed: true },
      },
    ];

    const pending = await createPendingResults(results, testConfig);

    expect(pending.gatewayUrl).toBe("http://localhost:9999");
    expect(pending.model).toBe("test-model");
    expect(pending.results).toEqual(results);
    expect(pending.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof pending.gitCommit).toBe("string");
  });
});

// =============================================================================
// savePendingResults tests
// =============================================================================

describe("savePendingResults", () => {
  const testOutputDir = "./test-output-temp";

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testOutputDir, { recursive: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  it("should save results to file", async () => {
    const pending = {
      timestamp: "2026-02-05T12:00:00.000Z",
      gitCommit: "abc123",
      gatewayUrl: "http://localhost:8080",
      model: "test",
      results: [],
    };

    const filepath = await savePendingResults(pending, testOutputDir);

    expect(filepath).toContain("pending-");
    expect(filepath).toContain(".json");

    // Verify file exists and has correct content
    const file = Bun.file(filepath);
    const content = await file.json();

    expect(content).toEqual(pending);
  });

  it("should create output directory if not exists", async () => {
    const pending = {
      timestamp: "2026-02-05T12:00:00.000Z",
      gitCommit: "abc123",
      gatewayUrl: "http://localhost:8080",
      model: "test",
      results: [],
    };

    const nestedDir = join(testOutputDir, "nested", "dir");
    const filepath = await savePendingResults(pending, nestedDir);

    const file = Bun.file(filepath);
    expect(await file.exists()).toBe(true);
  });
});

// =============================================================================
// run integration tests
// =============================================================================

describe("run", () => {
  const originalFetch = globalThis.fetch;
  const testOutputDir = "./test-run-temp";

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    try {
      await rm(testOutputDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  it("should run all cases and save results", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ response: "I am Tomato 🍅", success: true }),
        { status: 200 },
      );
    });

    const result = await run({
      gatewayUrl: "http://localhost:9999",
      outputDir: testOutputDir,
      model: "test-model",
    });

    expect(result.executed).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
    expect(result.outputPath).toContain("pending-");

    // Verify file exists
    const file = Bun.file(result.outputPath);
    expect(await file.exists()).toBe(true);
  });

  it("should run single case by ID", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ response: "hello", success: true }),
        { status: 200 },
      );
    });

    const result = await run({
      gatewayUrl: "http://localhost:9999",
      outputDir: testOutputDir,
      caseId: "identity-001",
    });

    expect(result.executed).toBe(1);
    expect(result.results.results[0].caseId).toBe("identity-001");
  });

  it("should throw error for unknown case ID", async () => {
    await expect(
      run({
        gatewayUrl: "http://localhost:9999",
        outputDir: testOutputDir,
        caseId: "nonexistent-case",
      }),
    ).rejects.toThrow("Case not found: nonexistent-case");
  });

  it("should count errors correctly", async () => {
    let callCount = 0;

    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ response: "ok", success: true }), {
          status: 200,
        });
      }
      throw new Error("Network error");
    });

    const result = await run({
      gatewayUrl: "http://localhost:9999",
      outputDir: testOutputDir,
    });

    // First case succeeds, rest fail
    expect(result.errors).toBe(result.executed - 1);
  });

  it("should use default values when not specified", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ response: "ok", success: true }), {
        status: 200,
      });
    });

    const result = await run({
      outputDir: testOutputDir,
    });

    expect(result.results.gatewayUrl).toBe("http://localhost:8080");
    expect(result.results.model).toBe("unknown");
  });
});
