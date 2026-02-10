import type { Tool, ToolContext } from "../types.js";
import { claudeCodeProvider } from "./claude-code.js";
import type { CodingAgentResult } from "./types.js";

function formatResult(result: CodingAgentResult): string {
  const lines: string[] = [];

  lines.push(`## Status: ${result.success ? "✅ Success" : "❌ Failed"}`);

  if (result.model) {
    lines.push(`Model: ${result.model}`);
  }

  if (result.durationMs > 0) {
    lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  }

  if (result.costUsd !== undefined) {
    lines.push(`Cost: $${result.costUsd.toFixed(4)}`);
  }

  lines.push("");
  lines.push("## Result");
  lines.push(result.result || "(no result)");

  if (result.modifiedFiles.length > 0) {
    lines.push("");
    lines.push("## Modified Files");
    for (const file of result.modifiedFiles) {
      lines.push(`- ${file}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join("\n");
}

export interface ClaudeCodeInput {
  task: string;
  model?: string;
  timeout_seconds?: number;
}

export const claudeCodeTool: Tool<ClaudeCodeInput> = {
  name: "coding_agent",
  description:
    "Execute a complex programming task using an external coding agent. " +
    "Use this for multi-step tasks that require autonomous file operations, " +
    "code generation, testing, and debugging. This is a heavy operation - " +
    "only use when simpler tools (read, write, edit, exec) are insufficient.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "The programming task to execute",
      },
      model: {
        type: "string",
        description: "Model to use (optional, uses CLI default if not set)",
      },
      timeout_seconds: {
        type: "number",
        description: "Timeout in seconds (default: 300 = 5 minutes)",
      },
    },
    required: ["task"],
  },

  async execute(input: ClaudeCodeInput, ctx: ToolContext): Promise<string> {
    const isAvailable = await claudeCodeProvider.isAvailable();
    if (!isAvailable) {
      return "Error: Claude CLI not found. Please install it first: https://docs.anthropic.com/en/docs/claude-code";
    }

    try {
      const result = await claudeCodeProvider.execute({
        prompt: input.task,
        workingDir: ctx.workspaceDir,
        model: input.model,
        timeoutMs: input.timeout_seconds
          ? input.timeout_seconds * 1000
          : undefined,
        abortSignal: ctx.abortSignal,
      });

      return formatResult(result);
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};
