import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExecRequest } from "../router/types";
import type { Executor } from "../router/provider";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;

export const createClaudeExecutor = (): Executor => ({
  exec: async (request: ExecRequest) => {
    if (!request.command) {
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "missing_command",
        elapsedMs: 0,
      };
    }

    const start = performance.now();
    try {
      const prompt = `Run this shell command and return only stdout.\n${request.command}`;
      const { stdout, stderr } = await execFileAsync(
        "claude",
        [
          "-p",
          prompt,
          "--output-format",
          "text",
          "--permission-mode",
          "dontAsk",
          "--allowed-tools",
          "Bash",
          "--allow-dangerously-skip-permissions",
          "--dangerously-skip-permissions",
          "--no-session-persistence",
        ],
        { timeout: DEFAULT_TIMEOUT_MS }
      );
      const elapsedMs = performance.now() - start;
      return {
        success: true,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        elapsedMs,
      };
    } catch (error) {
      const elapsedMs = performance.now() - start;
      const err = error as { stderr?: string; message?: string };
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: err.stderr?.trim() ?? err.message ?? "claude_failed",
        elapsedMs,
      };
    }
  },
});
