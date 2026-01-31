import { describe, expect, it } from "vitest";

import { consoleConfig } from "../config/consoleConfig";
import { createConsoleViewModel } from "./consoleViewModel";

describe("consoleConfig", () => {
  it("falls back to local api base url", () => {
    expect(consoleConfig.apiBaseUrl).toContain("127.0.0.1");
  });
});

describe("consoleViewModel integration", () => {
  it("throws on failed providers request", async () => {
    const viewModel = createConsoleViewModel(
      async () => new Response("providers_failed", { status: 500 }),
      { apiBaseUrl: "http://127.0.0.1:7010", apiKey: "sk-test" },
    );

    await expect(viewModel.fetchProviders()).rejects.toThrow(
      "providers_failed",
    );
  });

  it("passes through exec responses", async () => {
    const payload = {
      success: true,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      elapsedMs: 10,
      provider: "claude",
      fallback: { used: false, reason: "", attempted: ["claude"] },
    };

    const viewModel = createConsoleViewModel(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
      { apiBaseUrl: "http://127.0.0.1:7010", apiKey: "sk-test" },
    );

    viewModel.setScript("echo ok");
    viewModel.setSelectedProvider("claude");
    const response = await viewModel.execScript();
    expect(response.stdout).toBe("ok");
  });
});
