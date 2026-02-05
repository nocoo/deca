import { spawn } from "node:child_process";

type ClaudeResult = { stdout: string; stderr: string };

export const runClaude = (command: string, timeoutMs: number) =>
  new Promise<ClaudeResult>((resolve, reject) => {
    const prompt = `Run this shell command and return only stdout.\n${command}`;
    const child = spawn(
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
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude_timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `claude_exit_${code ?? "unknown"}`));
      }
    });

    child.stdin.end();
  });
