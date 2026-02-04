import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExecViewModel } from "./execViewModel";

describe("execViewModel", () => {
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

  it("loads providers", async () => {
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

    const viewModel = createExecViewModel(fetcher);
    await viewModel.actions.loadProviders();
    const state = viewModel.getState();
    expect(state.providers).toContain("claude");
  });

  it("runs script", async () => {
    window.localStorage.setItem("deca.console.key", "sk-test");
    const fetcher = vi.fn(async (input: RequestInfo) => {
      const url = input.toString();
      if (url.endsWith("/exec")) {
        return new Response(
          JSON.stringify({
            success: true,
            exitCode: 0,
            stdout: "ok",
            stderr: "",
            elapsedMs: 12,
            provider: "claude",
            fallback: { used: false, reason: "", attempted: [] },
          }),
          { status: 200 },
        );
      }
      return new Response("not_found", { status: 404 });
    });

    const viewModel = createExecViewModel(fetcher);
    viewModel.actions.setScript("echo ok");
    viewModel.actions.setWorkspace("/tmp");
    await viewModel.actions.run();
    const state = viewModel.getState();
    expect(state.output).toBe("ok");
  });
});
