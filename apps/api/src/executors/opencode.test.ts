import { describe, expect, it } from "bun:test";

import { createOpenCodeExecutor } from "./opencode";

describe("opencode executor", () => {
  it("returns error when command missing", async () => {
    const executor = createOpenCodeExecutor();
    const result = await executor.exec({ command: "", cwd: "/tmp" });
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("missing_command");
  });

  it("returns error when workspace missing", async () => {
    const executor = createOpenCodeExecutor();
    const result = await executor.exec({ command: "echo ok" });
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("missing_workspace");
  });
});
