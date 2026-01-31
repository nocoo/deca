import { describe, expect, it } from "bun:test";

import { createClaudeExecutor } from "./claude";

describe("claude executor", () => {
  it("returns error when command missing", async () => {
    const executor = createClaudeExecutor();
    const result = await executor.exec({ command: "" });
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("missing_command");
  });
});
