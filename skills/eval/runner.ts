/**
 * Eval Runner
 *
 * Executes eval cases against the Gateway HTTP API.
 * Outputs pending results JSON for LLM judging.
 *
 * Usage:
 *   bun run runner.ts [--gateway-url=<url>] [--output=<path>] [--case=<id>]
 *
 * This script does NOT use LLM. It only executes HTTP calls and code-based checks.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { allCases, getCaseById } from "./cases/index.js";
import {
  type EvalCase,
  type EvalResult,
  type PendingResults,
  createQuickCheckResult,
} from "./types.js";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_GATEWAY_URL = "http://localhost:7014";
const DEFAULT_OUTPUT_DIR = "./reports";

export interface RunnerConfig {
  /** Gateway HTTP URL */
  gatewayUrl: string;

  /** Output directory for results */
  outputDir: string;

  /** API key for gateway (optional) */
  apiKey?: string;

  /** Model identifier for metadata */
  model: string;

  /** Timeout per request in ms (default: 30000) */
  timeout: number;
}

export interface RunnerResult {
  /** Output file path */
  outputPath: string;

  /** Number of cases executed */
  executed: number;

  /** Number of execution errors */
  errors: number;

  /** Pending results object */
  results: PendingResults;
}

// =============================================================================
// Core Runner Functions
// =============================================================================

/**
 * Get current git commit hash
 */
export async function getGitCommit(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    return output.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Execute a single eval case
 */
export async function executeCase(
  evalCase: EvalCase,
  config: RunnerConfig,
): Promise<EvalResult> {
  const startTime = performance.now();

  try {
    // Make HTTP request to gateway
    const response = await fetchWithTimeout(
      `${config.gatewayUrl}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "X-API-Key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          message: evalCase.input,
          sessionId: `eval-${evalCase.id}-${Date.now()}`,
          senderId: "eval-runner",
        }),
      },
      config.timeout,
    );

    const durationMs = performance.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        targetPrompt: evalCase.targetPrompt,
        category: evalCase.category,
        input: evalCase.input,
        output: "",
        durationMs,
        quickCheck: { ran: false, passed: null },
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      response: string;
      success: boolean;
      error?: string;
    };

    if (!data.success) {
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        targetPrompt: evalCase.targetPrompt,
        category: evalCase.category,
        input: evalCase.input,
        output: data.response || "",
        durationMs,
        quickCheck: { ran: false, passed: null },
        error: data.error || "Gateway returned success=false",
      };
    }

    const output = data.response;

    // Run quick check
    const quickCheck = createQuickCheckResult(evalCase.quickCheck, output);

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      targetPrompt: evalCase.targetPrompt,
      category: evalCase.category,
      input: evalCase.input,
      output,
      durationMs,
      quickCheck,
    };
  } catch (error) {
    const durationMs = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      targetPrompt: evalCase.targetPrompt,
      category: evalCase.category,
      input: evalCase.input,
      output: "",
      durationMs,
      quickCheck: { ran: false, passed: null },
      error: errorMessage,
    };
  }
}

/**
 * Fetch with timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Run all cases or a subset
 */
export async function runCases(
  cases: EvalCase[],
  config: RunnerConfig,
  onProgress?: (completed: number, total: number, result: EvalResult) => void,
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const evalCase = cases[i];
    const result = await executeCase(evalCase, config);
    results.push(result);
    onProgress?.(i + 1, cases.length, result);
  }

  return results;
}

/**
 * Create pending results object
 */
export async function createPendingResults(
  results: EvalResult[],
  config: RunnerConfig,
): Promise<PendingResults> {
  const gitCommit = await getGitCommit();

  return {
    timestamp: new Date().toISOString(),
    gitCommit,
    gatewayUrl: config.gatewayUrl,
    model: config.model,
    results,
  };
}

/**
 * Save pending results to file
 */
export async function savePendingResults(
  pending: PendingResults,
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const timestamp = pending.timestamp.replace(/[:.]/g, "-");
  const filename = `pending-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  await writeFile(filepath, JSON.stringify(pending, null, 2));

  return filepath;
}

/**
 * Main runner function
 */
export async function run(options: {
  gatewayUrl?: string;
  outputDir?: string;
  apiKey?: string;
  model?: string;
  timeout?: number;
  caseId?: string;
  onProgress?: (completed: number, total: number, result: EvalResult) => void;
}): Promise<RunnerResult> {
  const config: RunnerConfig = {
    gatewayUrl: options.gatewayUrl || DEFAULT_GATEWAY_URL,
    outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
    apiKey: options.apiKey,
    model: options.model || "unknown",
    timeout: options.timeout || 30000,
  };

  // Select cases
  let casesToRun: EvalCase[];
  if (options.caseId) {
    const singleCase = getCaseById(options.caseId);
    if (!singleCase) {
      throw new Error(`Case not found: ${options.caseId}`);
    }
    casesToRun = [singleCase];
  } else {
    casesToRun = allCases;
  }

  // Run cases
  const results = await runCases(casesToRun, config, options.onProgress);

  // Count errors
  const errors = results.filter((r) => r.error).length;

  // Create pending results
  const pending = await createPendingResults(results, config);

  // Save to file
  const outputPath = await savePendingResults(pending, config.outputDir);

  return {
    outputPath,
    executed: results.length,
    errors,
    results: pending,
  };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse args
  let gatewayUrl = DEFAULT_GATEWAY_URL;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let caseId: string | undefined;
  let apiKey: string | undefined;
  let model = "unknown";

  for (const arg of args) {
    if (arg.startsWith("--gateway-url=")) {
      gatewayUrl = arg.slice("--gateway-url=".length);
    } else if (arg.startsWith("--output=")) {
      outputDir = arg.slice("--output=".length);
    } else if (arg.startsWith("--case=")) {
      caseId = arg.slice("--case=".length);
    } else if (arg.startsWith("--api-key=")) {
      apiKey = arg.slice("--api-key=".length);
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Eval Runner - Execute eval cases against Gateway

Usage:
  bun run runner.ts [options]

Options:
  --gateway-url=<url>  Gateway URL (default: http://localhost:7014)
  --output=<dir>       Output directory (default: ./reports)
  --case=<id>          Run single case by ID
  --api-key=<key>      API key for gateway
  --model=<name>       Model identifier for metadata
  --help, -h           Show this help

Examples:
  bun run runner.ts
  bun run runner.ts --case=identity-001
  bun run runner.ts --gateway-url=http://localhost:7014
`);
      process.exit(0);
    }
  }

  console.log("🔄 Eval Runner starting...");
  console.log(`   Gateway: ${gatewayUrl}`);
  console.log(`   Output:  ${outputDir}`);
  if (caseId) {
    console.log(`   Case:    ${caseId}`);
  }
  console.log("");

  try {
    const result = await run({
      gatewayUrl,
      outputDir,
      caseId,
      apiKey,
      model,
      onProgress: (completed, total, res) => {
        const status = res.error ? "❌" : res.quickCheck.passed ? "✅" : "⚠️";
        console.log(`[${completed}/${total}] ${status} ${res.caseName}`);
      },
    });

    console.log("");
    console.log("📊 Results:");
    console.log(`   Executed: ${result.executed}`);
    console.log(`   Errors:   ${result.errors}`);
    console.log(`   Output:   ${result.outputPath}`);
    console.log("");
    console.log("Next step: Run LLM judgement on the pending results file.");
  } catch (error) {
    console.error("❌ Runner failed:", error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
