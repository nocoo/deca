import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { CodingAgentResult } from "./types.js";

// ============================================================================
// Mocks
// ============================================================================

const mockIsAvailable = mock(() => Promise.resolve(true));
const mockExecute = mock(() =>
  Promise.resolve({
    success: true,
    result: "Task completed",
    modifiedFiles: [],
    errors: [],
    durationMs: 5000,
    costUsd: 0.05,
    model: "claude-4",
    sessionId: "s1",
  } satisfies CodingAgentResult),
);

mock.module("./claude-code.js", () => ({
  claudeCodeProvider: {
    name: "claude",
    isAvailable: mockIsAvailable,
    execute: mockExecute,
  },
}));

import type { ToolContext } from "../types.js";
// Import after mock setup
import { claudeCodeTool } from "./tool.js";

// ============================================================================
// Helpers
// ============================================================================

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workspaceDir: "/tmp/test-workspace",
    sessionKey: "agent:test:session:1",
    sessionId: "1",
    agentId: "test",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("claudeCodeTool", () => {
  beforeEach(() => {
    mockIsAvailable.mockReset();
    mockExecute.mockReset();
    mockIsAvailable.mockResolvedValue(true);
    mockExecute.mockResolvedValue({
      success: true,
      result: "Task completed",
      modifiedFiles: [],
      errors: [],
      durationMs: 5000,
      costUsd: 0.05,
      model: "claude-4",
      sessionId: "s1",
    });
  });

  describe("metadata", () => {
    it("should have correct name", () => {
      expect(claudeCodeTool.name).toBe("coding_agent");
    });

    it("should have description mentioning complex tasks", () => {
      expect(claudeCodeTool.description).toContain("complex");
    });

    it("should require task parameter", () => {
      expect(claudeCodeTool.inputSchema.required).toContain("task");
    });

    it("should have optional model parameter", () => {
      expect(claudeCodeTool.inputSchema.properties.model).toBeDefined();
    });

    it("should have optional timeout_seconds parameter", () => {
      expect(
        claudeCodeTool.inputSchema.properties.timeout_seconds,
      ).toBeDefined();
    });
  });

  describe("execute", () => {
    it("should return error when Claude CLI is not available", async () => {
      mockIsAvailable.mockResolvedValue(false);

      const result = await claudeCodeTool.execute(
        { task: "do something" },
        makeCtx(),
      );

      expect(result).toContain("Error: Claude CLI not found");
      expect(result).toContain("https://docs.anthropic.com");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("should execute task and format successful result", async () => {
      const result = await claudeCodeTool.execute(
        { task: "write hello world" },
        makeCtx(),
      );

      expect(result).toContain("✅ Success");
      expect(result).toContain("Task completed");
      expect(result).toContain("Model: claude-4");
      expect(result).toContain("Duration: 5.0s");
      expect(result).toContain("Cost: $0.0500");
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it("should pass correct options to provider", async () => {
      const ctx = makeCtx({ workspaceDir: "/my/project" });
      const abortController = new AbortController();
      const ctxWithAbort = { ...ctx, abortSignal: abortController.signal };

      await claudeCodeTool.execute(
        { task: "refactor code", model: "claude-4-opus", timeout_seconds: 600 },
        ctxWithAbort,
      );

      expect(mockExecute).toHaveBeenCalledWith({
        prompt: "refactor code",
        workingDir: "/my/project",
        model: "claude-4-opus",
        timeoutMs: 600000,
        abortSignal: abortController.signal,
      });
    });

    it("should pass undefined timeoutMs when timeout_seconds not provided", async () => {
      await claudeCodeTool.execute({ task: "fix bug" }, makeCtx());

      const callArgs = mockExecute.mock.calls[0][0];
      expect(callArgs.timeoutMs).toBeUndefined();
    });

    it("should format result with modified files", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: "Refactored 3 files",
        modifiedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        errors: [],
        durationMs: 12000,
        model: "claude-4",
      });

      const result = await claudeCodeTool.execute(
        { task: "refactor" },
        makeCtx(),
      );

      expect(result).toContain("## Modified Files");
      expect(result).toContain("- src/a.ts");
      expect(result).toContain("- src/b.ts");
      expect(result).toContain("- src/c.ts");
    });

    it("should format result with errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        result: "Partial failure",
        modifiedFiles: [],
        errors: ["Type error in foo.ts", "Build failed"],
        durationMs: 3000,
      });

      const result = await claudeCodeTool.execute(
        { task: "build project" },
        makeCtx(),
      );

      expect(result).toContain("❌ Failed");
      expect(result).toContain("## Errors");
      expect(result).toContain("- Type error in foo.ts");
      expect(result).toContain("- Build failed");
    });

    it("should show '(no result)' when result is empty", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: "",
        modifiedFiles: [],
        errors: [],
        durationMs: 100,
      });

      const result = await claudeCodeTool.execute({ task: "noop" }, makeCtx());

      expect(result).toContain("(no result)");
    });

    it("should omit duration line when durationMs is 0", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: "Done",
        modifiedFiles: [],
        errors: [],
        durationMs: 0,
      });

      const result = await claudeCodeTool.execute({ task: "quick" }, makeCtx());

      expect(result).not.toContain("Duration:");
    });

    it("should omit cost line when costUsd is undefined", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: "Done",
        modifiedFiles: [],
        errors: [],
        durationMs: 1000,
      });

      const result = await claudeCodeTool.execute({ task: "test" }, makeCtx());

      expect(result).not.toContain("Cost:");
    });

    it("should omit model line when model is undefined", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: "Done",
        modifiedFiles: [],
        errors: [],
        durationMs: 1000,
      });

      const result = await claudeCodeTool.execute({ task: "test" }, makeCtx());

      expect(result).not.toContain("Model:");
    });

    it("should catch provider errors and return error message", async () => {
      mockExecute.mockRejectedValue(new Error("Connection timeout"));

      const result = await claudeCodeTool.execute({ task: "fail" }, makeCtx());

      expect(result).toBe("Error: Connection timeout");
    });

    it("should handle non-Error throws from provider", async () => {
      mockExecute.mockRejectedValue("string error");

      const result = await claudeCodeTool.execute({ task: "fail" }, makeCtx());

      expect(result).toContain("Error:");
    });
  });
});
