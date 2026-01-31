import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearKeyStore, readKeyStore, writeKeyStore } from "./consoleKeyStore";

const setupLocalStorage = () => {
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
};

describe("consoleKeyStore", () => {
  beforeEach(() => {
    setupLocalStorage();
  });

  it("returns empty state when no key", () => {
    const state = readKeyStore();
    expect(state.key).toBe("");
    expect(state.lastFetchedAt).toBeNull();
  });

  it("writes and reads key", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    writeKeyStore("sk-test");
    const state = readKeyStore();
    expect(state.key).toBe("sk-test");
    expect(state.lastFetchedAt).toBe(now);
  });

  it("clears key store", () => {
    writeKeyStore("sk-test");
    clearKeyStore();
    const state = readKeyStore();
    expect(state.key).toBe("");
    expect(state.lastFetchedAt).toBeNull();
  });
});
