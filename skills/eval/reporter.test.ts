/**
 * Unit tests for eval reporter
 */

import { afterEach, describe, expect, it } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  calculateByCategory,
  calculateSummary,
  createReport,
  formatPercent,
  formatStatus,
  generateMarkdown,
  generateReport,
  loadJudgedResults,
  saveReport,
} from "./reporter.js";
import type { EvalResult, JudgedResults } from "./types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const createResult = (overrides: Partial<EvalResult> = {}): EvalResult => ({
  caseId: "test-001",
  caseName: "Test Case",
  targetPrompt: "TEST.md",
  category: "test",
  input: "Hello",
  output: "World",
  durationMs: 100,
  quickCheck: { ran: true, passed: true },
  ...overrides,
});

const createJudgedResults = (
  overrides: Partial<JudgedResults> = {},
): JudgedResults => ({
  timestamp: "2026-02-05T12:00:00.000Z",
  gitCommit: "abc123",
  gatewayUrl: "http://localhost:8080",
  model: "test-model",
  results: [],
  judgedAt: "2026-02-05T12:30:00.000Z",
  judgedBy: "opencode",
  ...overrides,
});

// =============================================================================
// calculateSummary tests
// =============================================================================

describe("calculateSummary", () => {
  it("should return zeros for empty results", () => {
    const summary = calculateSummary([]);

    expect(summary).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      avgScore: 0,
    });
  });

  it("should calculate summary for single passed result", () => {
    const results = [
      createResult({
        judgement: { passed: true, score: 85, reasoning: "Good" },
      }),
    ];

    const summary = calculateSummary(results);

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.passRate).toBe(1);
    expect(summary.avgScore).toBe(85);
  });

  it("should calculate summary for single failed result", () => {
    const results = [
      createResult({
        judgement: { passed: false, score: 40, reasoning: "Bad" },
      }),
    ];

    const summary = calculateSummary(results);

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.passRate).toBe(0);
    expect(summary.avgScore).toBe(40);
  });

  it("should calculate summary for mixed results", () => {
    const results = [
      createResult({
        caseId: "case-1",
        judgement: { passed: true, score: 90, reasoning: "Good" },
      }),
      createResult({
        caseId: "case-2",
        judgement: { passed: true, score: 80, reasoning: "Good" },
      }),
      createResult({
        caseId: "case-3",
        judgement: { passed: false, score: 50, reasoning: "Bad" },
      }),
    ];

    const summary = calculateSummary(results);

    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.passRate).toBeCloseTo(0.667, 2);
    expect(summary.avgScore).toBeCloseTo(73.33, 1);
  });

  it("should handle results without judgement", () => {
    const results = [
      createResult({ caseId: "case-1" }), // No judgement
      createResult({
        caseId: "case-2",
        judgement: { passed: true, score: 80, reasoning: "Good" },
      }),
    ];

    const summary = calculateSummary(results);

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1); // Non-judged counts as failed
    expect(summary.avgScore).toBe(80); // Only judged results in avg
  });

  it("should handle results with score 0", () => {
    const results = [
      createResult({
        judgement: { passed: false, score: 0, reasoning: "Zero" },
      }),
    ];

    const summary = calculateSummary(results);

    expect(summary.avgScore).toBe(0);
  });
});

// =============================================================================
// calculateByCategory tests
// =============================================================================

describe("calculateByCategory", () => {
  it("should return empty object for empty results", () => {
    const stats = calculateByCategory([]);

    expect(stats).toEqual({});
  });

  it("should group by category", () => {
    const results = [
      createResult({
        caseId: "id-1",
        category: "identity",
        judgement: { passed: true, score: 90, reasoning: "Good" },
      }),
      createResult({
        caseId: "id-2",
        category: "identity",
        judgement: { passed: true, score: 80, reasoning: "Good" },
      }),
      createResult({
        caseId: "beh-1",
        category: "behavior",
        judgement: { passed: false, score: 50, reasoning: "Bad" },
      }),
    ];

    const stats = calculateByCategory(results);

    expect(Object.keys(stats)).toHaveLength(2);
    expect(stats.identity.total).toBe(2);
    expect(stats.identity.passed).toBe(2);
    expect(stats.identity.passRate).toBe(1);
    expect(stats.behavior.total).toBe(1);
    expect(stats.behavior.passed).toBe(0);
    expect(stats.behavior.passRate).toBe(0);
  });

  it("should handle single category", () => {
    const results = [
      createResult({
        caseId: "case-1",
        category: "test",
        judgement: { passed: true, score: 85, reasoning: "Good" },
      }),
    ];

    const stats = calculateByCategory(results);

    expect(Object.keys(stats)).toEqual(["test"]);
    expect(stats.test.avgScore).toBe(85);
  });
});

// =============================================================================
// createReport tests
// =============================================================================

describe("createReport", () => {
  it("should create report from judged results", () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          judgement: { passed: true, score: 85, reasoning: "Good" },
        }),
      ],
    });

    const report = createReport(judged);

    expect(report.timestamp).toBe("2026-02-05T12:00:00.000Z");
    expect(report.gitCommit).toBe("abc123");
    expect(report.model).toBe("test-model");
    expect(report.gatewayUrl).toBe("http://localhost:8080");
    expect(report.summary.total).toBe(1);
    expect(report.results).toHaveLength(1);
  });
});

// =============================================================================
// formatPercent tests
// =============================================================================

describe("formatPercent", () => {
  it("should format 0", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("should format 1", () => {
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("should format decimal", () => {
    expect(formatPercent(0.667)).toBe("66.7%");
  });

  it("should format small value", () => {
    expect(formatPercent(0.001)).toBe("0.1%");
  });
});

// =============================================================================
// formatStatus tests
// =============================================================================

describe("formatStatus", () => {
  it("should return ❌ for error", () => {
    const result = createResult({ error: "Something failed" });
    expect(formatStatus(result)).toBe("❌");
  });

  it("should return ⏳ for no judgement", () => {
    const result = createResult();
    expect(formatStatus(result)).toBe("⏳");
  });

  it("should return ✅ for passed judgement", () => {
    const result = createResult({
      judgement: { passed: true, score: 85, reasoning: "Good" },
    });
    expect(formatStatus(result)).toBe("✅");
  });

  it("should return ❌ for failed judgement", () => {
    const result = createResult({
      judgement: { passed: false, score: 40, reasoning: "Bad" },
    });
    expect(formatStatus(result)).toBe("❌");
  });
});

// =============================================================================
// generateMarkdown tests
// =============================================================================

describe("generateMarkdown", () => {
  it("should generate markdown header", () => {
    const judged = createJudgedResults();
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("# Eval Report");
    expect(markdown).toContain("**Generated:** 2026-02-05T12:00:00.000Z");
    expect(markdown).toContain("**Git Commit:** abc123");
    expect(markdown).toContain("**Model:** test-model");
  });

  it("should generate summary table", () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          judgement: { passed: true, score: 85, reasoning: "Good" },
        }),
      ],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("| Metric | Value |");
    expect(markdown).toContain("| Total Cases | 1 |");
    expect(markdown).toContain("| Passed | 1 |");
  });

  it("should generate category table", () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          category: "identity",
          judgement: { passed: true, score: 85, reasoning: "Good" },
        }),
      ],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("## By Category");
    expect(markdown).toContain("| identity |");
  });

  it("should generate detailed results", () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          caseName: "Self-identification",
          input: "Who are you?",
          output: "I am Tomato",
          judgement: {
            passed: true,
            score: 90,
            reasoning: "Excellent response",
          },
        }),
      ],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("## Detailed Results");
    expect(markdown).toContain("### ✅ Self-identification");
    expect(markdown).toContain("**Input:**");
    expect(markdown).toContain("Who are you?");
    expect(markdown).toContain("**Output:**");
    expect(markdown).toContain("I am Tomato");
    expect(markdown).toContain("**Judgement:** ✅ PASSED (Score: 90)");
    expect(markdown).toContain("> Excellent response");
  });

  it("should show quick check result", () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          quickCheck: {
            ran: true,
            passed: true,
            details: "containsAny: found [Tomato]",
          },
        }),
      ],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain(
      "**Quick Check:** ✅ containsAny: found [Tomato]",
    );
  });

  it("should show error", () => {
    const judged = createJudgedResults({
      results: [createResult({ error: "Connection refused" })],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("- **Error:** Connection refused");
  });

  it("should handle empty output", () => {
    const judged = createJudgedResults({
      results: [createResult({ output: "" })],
    });
    const report = createReport(judged);
    const markdown = generateMarkdown(report);

    expect(markdown).toContain("(empty)");
  });
});

// =============================================================================
// loadJudgedResults tests
// =============================================================================

describe("loadJudgedResults", () => {
  const testDir = "./test-load-temp";
  const testFile = join(testDir, "test.json");

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  it("should load judged results from file", async () => {
    const judged = createJudgedResults();

    await Bun.write(testFile, JSON.stringify(judged));

    const loaded = await loadJudgedResults(testFile);

    expect(loaded.timestamp).toBe(judged.timestamp);
    expect(loaded.gitCommit).toBe(judged.gitCommit);
    expect(loaded.model).toBe(judged.model);
  });

  it("should throw on missing file", async () => {
    await expect(loadJudgedResults("./nonexistent.json")).rejects.toThrow();
  });
});

// =============================================================================
// saveReport tests
// =============================================================================

describe("saveReport", () => {
  const testDir = "./test-save-temp";

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  it("should save report to file", async () => {
    const judged = createJudgedResults();
    const report = createReport(judged);

    const filepath = await saveReport(report, testDir);

    expect(filepath).toContain("report-");
    expect(filepath).toContain(".md");

    const file = Bun.file(filepath);
    expect(await file.exists()).toBe(true);

    const content = await file.text();
    expect(content).toContain("# Eval Report");
  });
});

// =============================================================================
// generateReport integration tests
// =============================================================================

describe("generateReport", () => {
  const testDir = "./test-report-temp";
  const inputFile = join(testDir, "judged.json");

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  it("should generate report from file", async () => {
    const judged = createJudgedResults({
      results: [
        createResult({
          judgement: { passed: true, score: 85, reasoning: "Good" },
        }),
      ],
    });

    await Bun.write(inputFile, JSON.stringify(judged));

    const result = await generateReport(inputFile);

    expect(result.report.summary.total).toBe(1);
    expect(result.report.summary.passed).toBe(1);
    expect(result.outputPath).toContain("report-");

    const file = Bun.file(result.outputPath);
    expect(await file.exists()).toBe(true);
  });

  it("should use custom output directory", async () => {
    const judged = createJudgedResults();
    const customDir = join(testDir, "custom-output");

    await Bun.write(inputFile, JSON.stringify(judged));

    const result = await generateReport(inputFile, { outputDir: customDir });

    expect(result.outputPath).toContain("custom-output");
  });
});
