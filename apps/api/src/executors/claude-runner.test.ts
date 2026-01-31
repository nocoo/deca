import { describe, expect, it } from "bun:test";

import { runClaude } from "./claude-runner";

describe("claude runner", () => {
  it("is callable", async () => {
    await expect(runClaude("echo claude_ok", 1)).rejects.toBeTruthy();
  });
});
