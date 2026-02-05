/**
 * Eval System Types
 *
 * Core type definitions for the Deca Prompt evaluation system.
 * These types define the contract between:
 * - Test cases (defined in code)
 * - Runner script (executes tests, outputs JSON)
 * - LLM Judge (reads JSON, fills judgement)
 * - Reporter script (reads judged JSON, outputs report)
 */

// =============================================================================
// Test Case Definition
// =============================================================================

/**
 * A single evaluation test case
 */
export interface EvalCase {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this test validates */
  description: string;

  /** Target prompt file being tested (e.g., "IDENTITY.md") */
  targetPrompt: string;

  /** Category for grouping (e.g., "identity", "personality", "behavior") */
  category: string;

  /** Message to send to the Agent */
  input: string;

  /** Evaluation criteria for LLM Judge */
  criteria: string;

  /** Optional reference answer for comparison */
  reference?: string;

  /** Optional scoring rubric (1-5 scale descriptions) */
  rubric?: Rubric;

  /** Quick check rules (code-based, no LLM) */
  quickCheck?: QuickCheck;

  /** Score threshold to pass (0-100, default 70) */
  passThreshold?: number;
}

/**
 * Scoring rubric with descriptions for each level
 */
export interface Rubric {
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

/**
 * Quick check rules executed by code (no LLM)
 */
export interface QuickCheck {
  /** Output must contain at least one of these (OR logic) */
  containsAny?: string[];

  /** Output must contain all of these (AND logic) */
  containsAll?: string[];

  /** Output must not contain any of these */
  notContains?: string[];

  /** Output must match this regex pattern */
  matchPattern?: string;

  /** Minimum output length */
  minLength?: number;

  /** Maximum output length */
  maxLength?: number;
}

// =============================================================================
// Execution Result (Runner Output)
// =============================================================================

/**
 * Result of executing a single test case
 * Written by Runner, read by LLM Judge
 */
export interface EvalResult {
  /** Case ID */
  caseId: string;

  /** Case name */
  caseName: string;

  /** Target prompt file */
  targetPrompt: string;

  /** Category */
  category: string;

  /** Original input message */
  input: string;

  /** Agent's response */
  output: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Quick check result */
  quickCheck: QuickCheckResult;

  /** LLM Judge evaluation (filled by LLM) */
  judgement?: Judgement;

  /** Error message if execution failed */
  error?: string;
}

/**
 * Quick check execution result
 */
export interface QuickCheckResult {
  /** Whether quick check was executed */
  ran: boolean;

  /** Whether quick check passed (null if not ran) */
  passed: boolean | null;

  /** Details about what passed/failed */
  details?: string;
}

/**
 * LLM Judge evaluation result
 */
export interface Judgement {
  /** Whether the test passed */
  passed: boolean;

  /** Score from 0-100 */
  score: number;

  /** Reasoning for the score */
  reasoning: string;
}

// =============================================================================
// Final Report (Reporter Output)
// =============================================================================

/**
 * Complete evaluation report
 */
export interface EvalReport {
  /** Report generation timestamp (ISO 8601) */
  timestamp: string;

  /** Git commit hash */
  gitCommit: string;

  /** Model used for testing */
  model: string;

  /** Gateway URL used */
  gatewayUrl: string;

  /** Summary statistics */
  summary: ReportSummary;

  /** Statistics by category */
  byCategory: Record<string, CategoryStats>;

  /** All individual results */
  results: EvalResult[];
}

/**
 * Report summary statistics
 */
export interface ReportSummary {
  /** Total number of test cases */
  total: number;

  /** Number of passed cases */
  passed: number;

  /** Number of failed cases */
  failed: number;

  /** Pass rate (0-1) */
  passRate: number;

  /** Average score (0-100) */
  avgScore: number;
}

/**
 * Statistics for a category
 */
export interface CategoryStats {
  /** Total cases in category */
  total: number;

  /** Passed cases */
  passed: number;

  /** Failed cases */
  failed: number;

  /** Pass rate (0-1) */
  passRate: number;

  /** Average score (0-100) */
  avgScore: number;
}

// =============================================================================
// Pending Results (Intermediate Format)
// =============================================================================

/**
 * Pending results file structure
 * Output by Runner, input for LLM Judge
 */
export interface PendingResults {
  /** File creation timestamp */
  timestamp: string;

  /** Git commit hash */
  gitCommit: string;

  /** Gateway URL used */
  gatewayUrl: string;

  /** Model identifier */
  model: string;

  /** Results awaiting LLM judgement */
  results: EvalResult[];
}

// =============================================================================
// Judged Results (LLM Output)
// =============================================================================

/**
 * Judged results file structure
 * Output by LLM Judge, input for Reporter
 */
export interface JudgedResults {
  /** Original timestamp */
  timestamp: string;

  /** Git commit hash */
  gitCommit: string;

  /** Gateway URL used */
  gatewayUrl: string;

  /** Model identifier */
  model: string;

  /** Results with judgements filled */
  results: EvalResult[];

  /** Judge metadata */
  judgedAt: string;

  /** Judge model (who did the judging) */
  judgedBy: string;
}
