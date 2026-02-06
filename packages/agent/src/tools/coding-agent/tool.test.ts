import { describe, expect, it } from "bun:test";
import { claudeCodeTool } from "./tool.js";

describe("claudeCodeTool", () => {
  describe("metadata", () => {
    it("should have correct name", () => {
      expect(claudeCodeTool.name).toBe("claude_code");
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
});
