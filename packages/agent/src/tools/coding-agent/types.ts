/**
 * Coding Agent Provider Abstraction
 *
 * Abstract interface for external coding CLI tools (claude, opencode, codex, etc.)
 * These are "heavy sub-agents" that can handle complex multi-step programming tasks.
 *
 * Design principles:
 * 1. Provider-agnostic: Same interface for different CLI tools
 * 2. Summary-focused: Return structured results, not raw streams
 * 3. Timeout-safe: All operations have configurable timeouts
 */

/**
 * Result from a coding agent execution
 */
export interface CodingAgentResult {
  /** Whether the execution completed successfully */
  success: boolean;
  /** Final result/summary from the agent */
  result: string;
  /** List of files modified during execution */
  modifiedFiles: string[];
  /** Any errors encountered */
  errors: string[];
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Cost in USD (if available) */
  costUsd?: number;
  /** Model used (if available) */
  model?: string;
  /** Session ID (if available) */
  sessionId?: string;
}

/**
 * Options for coding agent execution
 */
export interface CodingAgentOptions {
  /** The task/prompt to execute */
  prompt: string;
  /** Working directory for the agent */
  workingDir: string;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeoutMs?: number;
  /** Model to use (provider-specific) */
  model?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Provider interface for coding agents
 *
 * Implement this interface to add support for new CLI tools:
 * - ClaudeCodeProvider (claude CLI)
 * - OpenCodeProvider (opencode CLI) - future
 * - CodexProvider (codex CLI) - future
 */
export interface CodingAgentProvider {
  /** Provider name (e.g., "claude", "opencode", "codex") */
  readonly name: string;

  /**
   * Check if the CLI tool is available on this system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Execute a task using the coding agent
   */
  execute(options: CodingAgentOptions): Promise<CodingAgentResult>;
}

/**
 * Default timeout for coding agent operations (5 minutes)
 */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
