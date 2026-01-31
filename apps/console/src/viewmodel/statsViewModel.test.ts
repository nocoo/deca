import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStatsViewModel } from "./statsViewModel";

describe("statsViewModel", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorage,
      writable: true,
    });
  });

  it("errors when key missing", async () => {
    const viewModel = createStatsViewModel(
      async () => new Response("unauthorized", { status: 401 }),
    );
    await viewModel.actions.refresh();
    const state = viewModel.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("missing_api_key");
  });

  it("loads providers and stats", async () => {
    window.localStorage.setItem("deca.console.key", "sk-test");
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            providers: [
              {
                type: "claude",
                capabilities: {
                  isolation: "none",
                  networking: true,
                  workspace: true,
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const viewModel = createStatsViewModel(fetcher);
    await viewModel.actions.refresh();
    const state = viewModel.getState();
    expect(state.providers).toContain("claude");
    expect(state.totalRuns).toBeGreaterThan(0);
  });
});
