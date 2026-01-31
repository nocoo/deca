import { describe, expect, it } from "bun:test";

import { createClaudeProvider } from "./claude";

describe("claude provider", () => {
  it("reports capabilities", () => {
    const provider = createClaudeProvider();
    expect(provider.capabilities.networking).toBe(true);
    expect(provider.capabilities.workspace).toBe(true);
  });
});
