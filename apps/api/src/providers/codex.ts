import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Provider } from "../router/provider";
import { createCodexExecutor } from "../executors/codex";

const execFileAsync = promisify(execFile);

export const createCodexProvider = (): Provider => ({
  type: "codex",
  isAvailable: async () => {
    try {
      await execFileAsync("codex", ["--version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
  capabilities: {
    isolation: "process",
    networking: false,
    workspace: true,
  },
  executor: createCodexExecutor(),
});
