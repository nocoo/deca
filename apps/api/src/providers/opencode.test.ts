import { describe, expect, it } from "bun:test";

import { createOpenCodeProvider } from "./opencode";

describe("opencode provider", () => {
  it("reports capabilities", () => {
    const provider = createOpenCodeProvider();
    expect(provider.capabilities.networking).toBe(true);
    expect(provider.capabilities.workspace).toBe(true);
  });
});
