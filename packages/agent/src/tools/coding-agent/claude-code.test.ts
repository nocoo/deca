import { describe, expect, it } from "bun:test";
import {
  extractModifiedFiles,
  parseClaudeStreamOutput,
  summarizeResult,
} from "./claude-code.js";

describe("claude-code parser", () => {
  describe("parseClaudeStreamOutput", () => {
    it("should parse valid NDJSON lines", () => {
      const output = [
        '{"type":"system","subtype":"init","session_id":"s1","tools":[],"model":"claude-3"}',
        '{"type":"result","subtype":"success","result":"Done","duration_ms":1000}',
      ].join("\n");

      const { messages, parseErrors } = parseClaudeStreamOutput(output);

      expect(messages.length).toBe(2);
      expect(parseErrors.length).toBe(0);
      expect(messages[0].type).toBe("system");
      expect(messages[1].type).toBe("result");
    });

    it("should skip empty lines", () => {
      const output =
        '{"type":"result","subtype":"success","result":"OK","duration_ms":100}\n\n\n';

      const { messages, parseErrors } = parseClaudeStreamOutput(output);

      expect(messages.length).toBe(1);
      expect(parseErrors.length).toBe(0);
    });

    it("should collect parse errors for invalid JSON", () => {
      const output = [
        '{"type":"system","subtype":"init","session_id":"s1","tools":[],"model":"claude-3"}',
        "invalid json line",
        '{"type":"result","subtype":"success","result":"Done","duration_ms":1000}',
      ].join("\n");

      const { messages, parseErrors } = parseClaudeStreamOutput(output);

      expect(messages.length).toBe(2);
      expect(parseErrors.length).toBe(1);
      expect(parseErrors[0]).toContain("Failed to parse");
    });

    it("should handle empty output", () => {
      const { messages, parseErrors } = parseClaudeStreamOutput("");

      expect(messages.length).toBe(0);
      expect(parseErrors.length).toBe(0);
    });
  });

  describe("extractModifiedFiles", () => {
    it("should extract files from 'wrote' patterns", () => {
      const messages = [
        {
          type: "assistant" as const,
          message: {
            content: [
              { type: "text" as const, text: "I wrote file.ts successfully" },
            ],
          },
        },
      ];

      const files = extractModifiedFiles(messages);

      expect(files).toContain("file.ts");
    });

    it("should extract files from 'created' patterns", () => {
      const messages = [
        {
          type: "assistant" as const,
          message: {
            content: [
              {
                type: "text" as const,
                text: "Created new.js and edited old.ts",
              },
            ],
          },
        },
      ];

      const files = extractModifiedFiles(messages);

      expect(files).toContain("new.js");
      expect(files).toContain("old.ts");
    });

    it("should deduplicate files", () => {
      const messages = [
        {
          type: "assistant" as const,
          message: {
            content: [
              { type: "text" as const, text: "Modified file.ts" },
              { type: "text" as const, text: "Updated file.ts again" },
            ],
          },
        },
      ];

      const files = extractModifiedFiles(messages);

      expect(files.length).toBe(1);
      expect(files[0]).toBe("file.ts");
    });

    it("should handle messages without assistant type", () => {
      const messages = [
        {
          type: "system" as const,
          subtype: "init" as const,
          session_id: "s1",
          tools: [],
          model: "claude-3",
        },
        {
          type: "result" as const,
          subtype: "success" as const,
          result: "Done",
          duration_ms: 100,
        },
      ];

      const files = extractModifiedFiles(messages);

      expect(files.length).toBe(0);
    });

    it("should handle empty messages", () => {
      const files = extractModifiedFiles([]);

      expect(files.length).toBe(0);
    });
  });

  describe("summarizeResult", () => {
    it("should extract success result", () => {
      const messages = [
        {
          type: "system" as const,
          subtype: "init" as const,
          session_id: "s1",
          tools: [],
          model: "claude-3-opus",
        },
        {
          type: "result" as const,
          subtype: "success" as const,
          result: "Task completed",
          duration_ms: 5000,
          total_cost_usd: 0.05,
        },
      ];

      const result = summarizeResult(messages);

      expect(result.success).toBe(true);
      expect(result.result).toBe("Task completed");
      expect(result.durationMs).toBe(5000);
      expect(result.costUsd).toBe(0.05);
      expect(result.model).toBe("claude-3-opus");
      expect(result.sessionId).toBe("s1");
      expect(result.errors.length).toBe(0);
    });

    it("should extract error result", () => {
      const messages = [
        {
          type: "system" as const,
          subtype: "init" as const,
          session_id: "s1",
          tools: [],
          model: "claude-3",
        },
        {
          type: "result" as const,
          subtype: "error" as const,
          result: "Something failed",
          duration_ms: 1000,
        },
      ];

      const result = summarizeResult(messages);

      expect(result.success).toBe(false);
      expect(result.result).toBe("Something failed");
      expect(result.errors).toContain("Something failed");
    });

    it("should handle missing optional fields", () => {
      const messages = [
        {
          type: "result" as const,
          subtype: "success" as const,
          result: "Done",
          duration_ms: 100,
        },
      ];

      const result = summarizeResult(messages);

      expect(result.success).toBe(true);
      expect(result.model).toBeUndefined();
      expect(result.sessionId).toBeUndefined();
      expect(result.costUsd).toBeUndefined();
    });

    it("should handle empty messages", () => {
      const result = summarizeResult([]);

      expect(result.success).toBe(false);
      expect(result.result).toBe("");
      expect(result.durationMs).toBe(0);
    });
  });
});
