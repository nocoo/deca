/**
 * Eval Reporter
 *
 * Reads judged results JSON and generates markdown report.
 * This script does NOT use LLM. It only formats data.
 *
 * Usage:
 *   bun run reporter.ts <judged-file.json> [--output=<path>]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  CategoryStats,
  EvalReport,
  EvalResult,
  JudgedResults,
  ReportSummary,
} from "./types.js";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_OUTPUT_DIR = "./reports";

export interface ReporterConfig {
  /** Output directory for reports */
  outputDir: string;
}

export interface ReporterResult {
  /** Output file path */
  outputPath: string;

  /** Generated report */
  report: EvalReport;
}

// =============================================================================
// Core Reporter Functions
// =============================================================================

/**
 * Load judged results from file
 */
export async function loadJudgedResults(
  filepath: string,
): Promise<JudgedResults> {
  const content = await readFile(filepath, "utf-8");
  return JSON.parse(content) as JudgedResults;
}

/**
 * Calculate summary statistics
 */
export function calculateSummary(results: EvalResult[]): ReportSummary {
  const total = results.length;

  if (total === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      avgScore: 0,
    };
  }

  const withJudgement = results.filter((r) => r.judgement);
  const passed = withJudgement.filter((r) => r.judgement?.passed).length;
  const failed = total - passed;

  const scores = withJudgement
    .map((r) => r.judgement?.score ?? 0)
    .filter((s) => s > 0);

  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    total,
    passed,
    failed,
    passRate: passed / total,
    avgScore: Math.round(avgScore * 100) / 100,
  };
}

/**
 * Calculate statistics by category
 */
export function calculateByCategory(
  results: EvalResult[],
): Record<string, CategoryStats> {
  const categories: Record<string, EvalResult[]> = {};

  for (const result of results) {
    const cat = result.category;
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push(result);
  }

  const stats: Record<string, CategoryStats> = {};

  for (const [category, categoryResults] of Object.entries(categories)) {
    const summary = calculateSummary(categoryResults);
    stats[category] = {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      passRate: summary.passRate,
      avgScore: summary.avgScore,
    };
  }

  return stats;
}

/**
 * Create EvalReport from JudgedResults
 */
export function createReport(judged: JudgedResults): EvalReport {
  return {
    timestamp: judged.timestamp,
    gitCommit: judged.gitCommit,
    model: judged.model,
    gatewayUrl: judged.gatewayUrl,
    summary: calculateSummary(judged.results),
    byCategory: calculateByCategory(judged.results),
    results: judged.results,
  };
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format status emoji
 */
export function formatStatus(result: EvalResult): string {
  if (result.error) return "❌";
  if (!result.judgement) return "⏳";
  return result.judgement.passed ? "✅" : "❌";
}

/**
 * Generate markdown report
 */
export function generateMarkdown(report: EvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push("# Eval Report");
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push(`**Git Commit:** ${report.gitCommit}`);
  lines.push(`**Model:** ${report.model}`);
  lines.push(`**Gateway:** ${report.gatewayUrl}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Cases | ${report.summary.total} |`);
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Pass Rate | ${formatPercent(report.summary.passRate)} |`);
  lines.push(`| Avg Score | ${report.summary.avgScore} |`);
  lines.push("");

  // By Category
  if (Object.keys(report.byCategory).length > 0) {
    lines.push("## By Category");
    lines.push("");
    lines.push(
      "| Category | Total | Passed | Failed | Pass Rate | Avg Score |",
    );
    lines.push(
      "|----------|-------|--------|--------|-----------|-----------|",
    );

    for (const [category, stats] of Object.entries(report.byCategory)) {
      lines.push(
        `| ${category} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${formatPercent(stats.passRate)} | ${stats.avgScore} |`,
      );
    }
    lines.push("");
  }

  // Detailed Results
  lines.push("## Detailed Results");
  lines.push("");

  for (const result of report.results) {
    const status = formatStatus(result);
    lines.push(`### ${status} ${result.caseName}`);
    lines.push("");
    lines.push(`- **ID:** ${result.caseId}`);
    lines.push(`- **Category:** ${result.category}`);
    lines.push(`- **Target:** ${result.targetPrompt}`);
    lines.push(`- **Duration:** ${result.durationMs.toFixed(0)}ms`);

    if (result.error) {
      lines.push(`- **Error:** ${result.error}`);
    }

    lines.push("");
    lines.push("**Input:**");
    lines.push("```");
    lines.push(result.input);
    lines.push("```");
    lines.push("");

    lines.push("**Output:**");
    lines.push("```");
    lines.push(result.output || "(empty)");
    lines.push("```");
    lines.push("");

    // Quick Check
    if (result.quickCheck.ran) {
      const qcStatus = result.quickCheck.passed ? "✅" : "❌";
      lines.push(
        `**Quick Check:** ${qcStatus} ${result.quickCheck.details || ""}`,
      );
      lines.push("");
    }

    // Judgement
    if (result.judgement) {
      const jStatus = result.judgement.passed ? "✅ PASSED" : "❌ FAILED";
      lines.push(
        `**Judgement:** ${jStatus} (Score: ${result.judgement.score})`,
      );
      lines.push("");
      lines.push(`> ${result.judgement.reasoning}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Save report to file
 */
export async function saveReport(
  report: EvalReport,
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const timestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `report-${timestamp}.md`;
  const filepath = join(outputDir, filename);

  const markdown = generateMarkdown(report);
  await writeFile(filepath, markdown);

  return filepath;
}

/**
 * Main reporter function
 */
export async function generateReport(
  inputPath: string,
  options: {
    outputDir?: string;
  } = {},
): Promise<ReporterResult> {
  const config: ReporterConfig = {
    outputDir: options.outputDir || dirname(inputPath) || DEFAULT_OUTPUT_DIR,
  };

  // Load judged results
  const judged = await loadJudgedResults(inputPath);

  // Create report
  const report = createReport(judged);

  // Save to file
  const outputPath = await saveReport(report, config.outputDir);

  return {
    outputPath,
    report,
  };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Eval Reporter - Generate markdown report from judged results

Usage:
  bun run reporter.ts <judged-file.json> [options]

Options:
  --output=<dir>  Output directory (default: same as input)
  --help, -h      Show this help

Examples:
  bun run reporter.ts reports/judged-2026-02-05.json
  bun run reporter.ts reports/judged-2026-02-05.json --output=./output
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Parse args
  let inputPath: string | undefined;
  let outputDir: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--output=")) {
      outputDir = arg.slice("--output=".length);
    } else if (!arg.startsWith("-")) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    console.error("❌ Error: Input file path required");
    process.exit(1);
  }

  console.log("📊 Eval Reporter starting...");
  console.log(`   Input:  ${inputPath}`);
  if (outputDir) {
    console.log(`   Output: ${outputDir}`);
  }
  console.log("");

  try {
    const result = await generateReport(inputPath, { outputDir });

    console.log("📈 Report Generated:");
    console.log(`   Total:     ${result.report.summary.total}`);
    console.log(`   Passed:    ${result.report.summary.passed}`);
    console.log(`   Failed:    ${result.report.summary.failed}`);
    console.log(
      `   Pass Rate: ${formatPercent(result.report.summary.passRate)}`,
    );
    console.log(`   Avg Score: ${result.report.summary.avgScore}`);
    console.log("");
    console.log(`   Output: ${result.outputPath}`);
  } catch (error) {
    console.error("❌ Reporter failed:", error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
