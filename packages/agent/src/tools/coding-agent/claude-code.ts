import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type {
  CodingAgentOptions,
  CodingAgentProvider,
  CodingAgentResult,
} from "./types.js";
import { DEFAULT_TIMEOUT_MS } from "./types.js";

interface ClaudeSystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
  model: string;
}

interface ClaudeAssistantMessage {
  type: "assistant";
  message: {
    content: Array<{ type: "text"; text: string }>;
  };
}

interface ClaudeResult {
  type: "result";
  subtype: "success" | "error";
  result: string;
  duration_ms: number;
  total_cost_usd?: number;
}

type ClaudeStreamMessage =
  | ClaudeSystemInit
  | ClaudeAssistantMessage
  | ClaudeResult;

function parseClaudeStreamOutput(output: string): {
  messages: ClaudeStreamMessage[];
  parseErrors: string[];
} {
  const messages: ClaudeStreamMessage[] = [];
  const parseErrors: string[] = [];

  const lines = output.split("\n").filter((line) => line.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClaudeStreamMessage;
      messages.push(parsed);
    } catch {
      parseErrors.push(`Failed to parse: ${line.slice(0, 100)}`);
    }
  }

  return { messages, parseErrors };
}

function extractModifiedFiles(messages: ClaudeStreamMessage[]): string[] {
  const files = new Set<string>();

  for (const msg of messages) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          const filePatterns = [
            /(?:wrote|created|modified|updated|edited)\s+(?:file\s+)?["']?([^\s"']+\.[a-z]+)["']?/gi,
            /(?:writing|creating|editing)\s+(?:to\s+)?["']?([^\s"']+\.[a-z]+)["']?/gi,
          ];
          for (const pattern of filePatterns) {
            const matches = block.text.matchAll(pattern);
            for (const match of matches) {
              files.add(match[1]);
            }
          }
        }
      }
    }
  }

  return Array.from(files);
}

function summarizeResult(messages: ClaudeStreamMessage[]): CodingAgentResult {
  let success = false;
  let result = "";
  let durationMs = 0;
  let costUsd: number | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  const errors: string[] = [];

  for (const msg of messages) {
    if (msg.type === "system" && msg.subtype === "init") {
      model = msg.model;
      sessionId = msg.session_id;
    } else if (msg.type === "result") {
      success = msg.subtype === "success";
      result = msg.result;
      durationMs = msg.duration_ms;
      costUsd = msg.total_cost_usd;
      if (msg.subtype === "error") {
        errors.push(msg.result);
      }
    }
  }

  const modifiedFiles = extractModifiedFiles(messages);

  return {
    success,
    result,
    modifiedFiles,
    errors,
    durationMs,
    costUsd,
    model,
    sessionId,
  };
}

async function checkClaudeCliExists(): Promise<boolean> {
  const possiblePaths = [
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    `${process.env.HOME}/.local/bin/claude`,
  ];

  for (const p of possiblePaths) {
    try {
      await access(p);
      return true;
    } catch {
      // intentionally empty
    }
  }

  return new Promise((resolve) => {
    const child = spawn("which", ["claude"]);
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runClaudeCli(
  options: CodingAgentOptions,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    options.prompt,
  ];

  if (options.model) {
    args.unshift("--model", options.model);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: options.workingDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        clearTimeout(timer);
        reject(new Error("Aborted"));
      });
    }

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export const claudeCodeProvider: CodingAgentProvider = {
  name: "claude",

  async isAvailable(): Promise<boolean> {
    return checkClaudeCliExists();
  },

  async execute(options: CodingAgentOptions): Promise<CodingAgentResult> {
    const { stdout, stderr, code } = await runClaudeCli(options);

    if (code !== 0 && !stdout) {
      return {
        success: false,
        result: "",
        modifiedFiles: [],
        errors: [stderr || `Process exited with code ${code}`],
        durationMs: 0,
      };
    }

    const { messages, parseErrors } = parseClaudeStreamOutput(stdout);
    const result = summarizeResult(messages);

    if (parseErrors.length > 0) {
      result.errors.push(...parseErrors);
    }

    return result;
  },
};

export { parseClaudeStreamOutput, extractModifiedFiles, summarizeResult };
