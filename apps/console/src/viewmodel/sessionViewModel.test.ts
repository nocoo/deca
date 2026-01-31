import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionViewModel } from "./sessionViewModel";

describe("sessionViewModel", () => {
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

  it("starts session and loads providers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo) => {
      const url = input.toString();
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/providers")) {
        return new Response(
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
        );
      }
      return new Response("not_found", { status: 404 });
    });

    window.localStorage.setItem("deca.console.key", "sk-test");
    const viewModel = createSessionViewModel(fetcher);
    await viewModel.actions.startSession();

    const state = viewModel.getState();
    expect(state.status).toBe("ready");
    expect(state.providers).toContain("claude");
    expect(state.healthOk).toBe(true);
  });

  it("marks missing key but stays ready", async () => {
    const fetcher = vi.fn(async (input: RequestInfo) => {
      const url = input.toString();
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("not_found", { status: 404 });
    });

    const viewModel = createSessionViewModel(fetcher);
    await viewModel.actions.startSession();
    const state = viewModel.getState();
    expect(state.status).toBe("ready");
    expect(state.events).toContain("missing_api_key");
  });
});
