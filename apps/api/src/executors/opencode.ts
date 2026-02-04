import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Executor } from "../router/provider";
import type { ExecRequest } from "../router/types";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;

export const createOpenCodeExecutor = (): Executor => ({
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

    if (!request.cwd) {
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "missing_workspace",
        elapsedMs: 0,
      };
    }

    const start = performance.now();
    try {
      const prompt = `Run this shell command and return only stdout.\n${request.command}`;
      const { stdout, stderr } = await execFileAsync(
        "opencode",
        [
          "run",
          prompt,
          "--agent",
          "build",
          "--model",
          "zai-coding-plan/glm-4.7",
        ],
        {
          timeout: DEFAULT_TIMEOUT_MS,
          cwd: request.cwd,
          env: {
            ...process.env,
            ...(request.env ?? {}),
          },
        },
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
        stderr: err.stderr?.trim() ?? err.message ?? "opencode_failed",
        elapsedMs,
      };
    }
  },
});
