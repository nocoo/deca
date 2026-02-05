import { describe, expect, it } from "bun:test";

import type { Provider } from "./provider";
import { selectProviders } from "./selector";
import type { ExecRequest } from "./types";

const createProvider = (
  type: Provider["type"],
  overrides?: Partial<Provider>,
): Provider => ({
  type,
  isAvailable: async () => true,
  capabilities: {
    isolation: "process",
    networking: true,
    workspace: true,
  },
  executor: {
    exec: async () => ({
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      elapsedMs: 1,
    }),
  },
  ...overrides,
});

describe("selectProviders", () => {
  it("respects forced provider", () => {
    const providers = [createProvider("native"), createProvider("codex")];
    const request: ExecRequest = { command: "echo", provider: "native" };
    const selected = selectProviders(providers, request);
    expect(selected.map((p) => p.type)).toEqual(["native"]);
  });

  it("filters by network needs", () => {
    const providers = [
      createProvider("codex", {
        capabilities: {
          isolation: "process",
          networking: false,
          workspace: true,
        },
      }),
      createProvider("native"),
    ];
    const request: ExecRequest = { command: "curl", needsNetwork: true };
    const selected = selectProviders(providers, request);
    expect(selected.map((p) => p.type)).toEqual(["native"]);
  });

  it("filters by isolation needs", () => {
    const providers = [
      createProvider("native", {
        capabilities: {
          isolation: "none",
          networking: true,
          workspace: true,
        },
      }),
      createProvider("codex"),
    ];
    const request: ExecRequest = { command: "ls", needsIsolation: true };
    const selected = selectProviders(providers, request);
    expect(selected.map((p) => p.type)).toEqual(["codex"]);
  });
});
