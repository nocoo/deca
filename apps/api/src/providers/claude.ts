import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Provider } from "../router/provider";
import { createClaudeExecutor } from "../executors/claude";

const execFileAsync = promisify(execFile);

export const createClaudeProvider = (): Provider => ({
  type: "claude",
  isAvailable: async () => {
    try {
      await execFileAsync("srt", ["--version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
  capabilities: {
    isolation: "process",
    networking: true,
    workspace: true,
  },
  executor: createClaudeExecutor(),
});
