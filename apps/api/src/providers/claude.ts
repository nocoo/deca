import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClaudeExecutor } from "../executors/claude";
import type { Provider } from "../router/provider";

const execFileAsync = promisify(execFile);

export const createClaudeProvider = (): Provider => ({
  type: "claude",
  isAvailable: async () => {
    try {
      await execFileAsync("claude", ["--version"], { timeout: 5000 });
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
