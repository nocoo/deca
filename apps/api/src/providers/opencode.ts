import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createOpenCodeExecutor } from "../executors/opencode";
import type { Provider } from "../router/provider";

const execFileAsync = promisify(execFile);

export const createOpenCodeProvider = (): Provider => ({
  type: "opencode",
  isAvailable: async () => {
    try {
      await execFileAsync("opencode", ["--version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
  capabilities: {
    isolation: "none",
    networking: true,
    workspace: true,
  },
  executor: createOpenCodeExecutor(),
});
