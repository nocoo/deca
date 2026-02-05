import { describe, expect, it } from "bun:test";

import { createAppleScriptProvider } from "./applescript";

describe("appleScript provider", () => {
  it("reports capabilities", () => {
    const provider = createAppleScriptProvider();
    expect(provider.capabilities.networking).toBe(false);
    expect(provider.capabilities.workspace).toBe(false);
  });
});
