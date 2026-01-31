import { describe, expect, it } from "bun:test";

import { createCodexExecutor } from "./codex";

describe("codex executor", () => {
  it("returns error when command missing", async () => {
    const executor = createCodexExecutor();
    const result = await executor.exec({ command: "" });
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("missing_command");
  });
});
