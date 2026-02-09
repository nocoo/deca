/**
 * LLM-as-Judge for Behavioral Tests
 *
 * Uses the same Agent infrastructure to verify agent responses semantically,
 * replacing brittle keyword matching with natural language criteria.
 *
 * The judge agent is a stripped-down Agent instance:
 * - No tools (pure text reasoning)
 * - No memory/context/skills/heartbeat
 * - Temporary session directory (no pollution)
 * - Single turn (maxTurns: 1)
 *
 * Usage:
 *   const result = await verify(
 *     agentResponse,
 *     "Response should identify the off-by-one bug and suggest a fix"
 *   );
 *   // result.passed: boolean
 *   // result.reasoning: string
 */

import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Agent } from "@deca/agent";

// =============================================================================
// Types
// =============================================================================

export interface VerifyResult {
  /** Whether the response meets the criteria */
  passed: boolean;
  /** Brief explanation of the judgement */
  reasoning: string;
}

// =============================================================================
// LLM Credentials (reuses project credential loading pattern)
// =============================================================================

interface LLMCredential {
  apiKey: string;
  baseUrl?: string;
  models?: { default?: string };
}

const LLM_PROVIDERS = ["glm", "minimax"] as const;

async function loadLLMCredentials(): Promise<LLMCredential> {
  const credDir = join(homedir(), ".deca", "credentials");

  for (const provider of LLM_PROVIDERS) {
    const credPath = join(credDir, `${provider}.json`);
    try {
      const content = await Bun.file(credPath).text();
      return JSON.parse(content) as LLMCredential;
    } catch {
      /* try next provider */
    }
  }

  throw new Error(
    "No LLM credentials found. Create ~/.deca/credentials/glm.json or minimax.json",
  );
}

// =============================================================================
// Judge Agent
// =============================================================================

const JUDGE_SYSTEM_PROMPT = `You are a test verification judge. Your job is to determine whether an AI agent's response meets the given evaluation criteria.

## Rules
1. Be lenient on format, style, and language (the response may be in Chinese or English)
2. Be strict on substance — the response must genuinely address what the criteria require
3. Focus on semantic meaning, not exact wording
4. A response that fulfills the intent of the criteria should pass, even if phrased differently

## Output Format
Output ONLY valid JSON on a single line, no markdown fencing, no extra text:
{"passed":true,"reasoning":"brief explanation"}

## Examples

Input criteria: "Response should identify the off-by-one bug"
Agent response: "这段代码有一个越界问题，i <= items.length 应该改为 i < items.length"
Output: {"passed":true,"reasoning":"Correctly identifies the off-by-one boundary error in the loop condition"}

Input criteria: "Response should contain test cases with assertions"
Agent response: "Hello! How can I help you today?"
Output: {"passed":false,"reasoning":"Response is a generic greeting with no test cases or assertions"}`;

let judgeAgent: Agent | null = null;
let judgeSessionDir: string | null = null;
let callCounter = 0;

/**
 * Get or create the singleton judge agent.
 * Lazy-initialized on first verify() call.
 */
async function getJudgeAgent(): Promise<Agent> {
  if (judgeAgent) return judgeAgent;

  const creds = await loadLLMCredentials();

  // Use a temporary directory for judge sessions (auto-cleaned)
  judgeSessionDir = join(
    process.cwd(),
    "tmp",
    "judge-sessions",
    `run-${Date.now()}`,
  );
  mkdirSync(judgeSessionDir, { recursive: true });

  judgeAgent = new Agent({
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    model: creds.models?.default,
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    tools: [],
    enableMemory: false,
    enableContext: false,
    enableSkills: false,
    enableHeartbeat: false,
    sessionDir: judgeSessionDir,
    maxTurns: 1,
  });

  return judgeAgent;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Use LLM to verify an agent response against natural language criteria.
 *
 * @param response - The agent's actual response text
 * @param criteria - Natural language description of what a passing response looks like
 * @returns Whether the response meets the criteria, with reasoning
 *
 * @example
 * ```ts
 * const result = await verify(
 *   agentResponse,
 *   "Response should be a code review identifying the off-by-one bug and suggesting improvements"
 * );
 * if (!result.passed) {
 *   console.log(`Failed: ${result.reasoning}`);
 * }
 * ```
 */
export async function verify(
  response: string,
  criteria: string,
): Promise<VerifyResult> {
  const agent = await getJudgeAgent();

  // Unique session key per call (no cross-contamination)
  const sessionKey = `judge-${Date.now()}-${++callCounter}`;

  const userMessage = `## Evaluation Criteria
${criteria}

## Agent Response
${response}`;

  try {
    const result = await agent.run(sessionKey, userMessage);
    const parsed = parseJudgeOutput(result.text);

    // Clean up session immediately
    await agent.reset(sessionKey);

    return parsed;
  } catch (error) {
    // Clean up on error too
    try {
      await agent.reset(sessionKey);
    } catch {
      /* ignore cleanup errors */
    }

    return {
      passed: false,
      reasoning: `Judge error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clean up judge resources. Call this when all tests are done.
 */
export function cleanupJudge(): void {
  if (judgeSessionDir) {
    try {
      rmSync(judgeSessionDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    judgeSessionDir = null;
  }
  judgeAgent = null;
}

// =============================================================================
// Output Parsing
// =============================================================================

/**
 * Parse the judge's JSON output, handling common LLM quirks.
 */
function parseJudgeOutput(text: string): VerifyResult {
  const trimmed = text.trim();

  // Try direct parse first
  try {
    const obj = JSON.parse(trimmed);
    return normalizeResult(obj);
  } catch {
    /* try extraction */
  }

  // Extract JSON from markdown fencing or surrounding text
  const jsonMatch = trimmed.match(
    /\{[^{}]*"passed"\s*:\s*(?:true|false)[^{}]*\}/,
  );
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return normalizeResult(obj);
    } catch {
      /* fall through */
    }
  }

  // Last resort: look for passed/failed indicators in raw text
  const lower = trimmed.toLowerCase();
  if (lower.includes('"passed":true') || lower.includes('"passed": true')) {
    return { passed: true, reasoning: trimmed.slice(0, 200) };
  }
  if (lower.includes('"passed":false') || lower.includes('"passed": false')) {
    return { passed: false, reasoning: trimmed.slice(0, 200) };
  }

  return {
    passed: false,
    reasoning: `Could not parse judge output: ${trimmed.slice(0, 200)}`,
  };
}

function normalizeResult(obj: Record<string, unknown>): VerifyResult {
  return {
    passed: Boolean(obj.passed),
    reasoning:
      typeof obj.reasoning === "string"
        ? obj.reasoning
        : "No reasoning provided",
  };
}
