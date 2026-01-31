import { describe, expect, it } from "bun:test";

import { createCodexProvider } from "./codex";

describe("codex provider", () => {
  it("reports capabilities", () => {
    const provider = createCodexProvider();
    expect(provider.capabilities.networking).toBe(false);
    expect(provider.capabilities.workspace).toBe(true);
  });
});
