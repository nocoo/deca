import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const runClaude = async (command: string, timeoutMs: number) => {
  const prompt = `Run this shell command and return only stdout.\n${command}`;
  return execFileAsync(
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
    {
      timeout: timeoutMs,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
      },
    }
  );
};
