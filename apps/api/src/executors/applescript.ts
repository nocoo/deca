import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Executor } from "../router/provider";
import type { ExecRequest } from "../router/types";

const execFileAsync = promisify(execFile);

export const createAppleScriptExecutor = (): Executor => ({
  exec: async (request: ExecRequest) => {
    if (!request.command) {
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "missing_script",
        elapsedMs: 0,
      };
    }

    const start = performance.now();
    try {
      const { stdout, stderr } = await execFileAsync("osascript", [
        "-e",
        request.command,
      ]);
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
        stderr: err.stderr?.trim() ?? err.message ?? "applescript_failed",
        elapsedMs,
      };
    }
  },
});
