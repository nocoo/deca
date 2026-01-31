import { beforeEach, describe, expect, it } from "vitest";

import { createKeyManagementViewModel } from "./keyManagementViewModel";

describe("keyManagementViewModel", () => {
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

  it("loads key from server", async () => {
    const viewModel = createKeyManagementViewModel(
      async () =>
        new Response(JSON.stringify({ key: "sk-test", header: "x-deca-key" }), {
          status: 200,
        }),
    );

    await viewModel.actions.loadKey();
    const state = viewModel.getState();
    expect(state.apiKey).toBe("sk-test");
    expect(state.status).toBe("ready");
  });

  it("handles error on load", async () => {
    const viewModel = createKeyManagementViewModel(
      async () => new Response("denied", { status: 403 }),
    );

    await viewModel.actions.loadKey();
    const state = viewModel.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("denied");
  });
});
