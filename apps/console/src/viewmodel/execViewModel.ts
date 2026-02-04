import { consoleConfig } from "../config/consoleConfig";
import type { ExecResponse, ProvidersResponse } from "../model/api";
import { readKeyStore } from "../state/consoleKeyStore";

export type ExecState = {
  provider: string;
  providers: string[];
  script: string;
  workspace: string;
  output: string;
  status: "idle" | "running" | "error";
  errorMessage: string | null;
  lastRunAt: number | null;
};

export type ExecActions = {
  setProvider: (value: string) => void;
  setScript: (value: string) => void;
  setWorkspace: (value: string) => void;
  loadProviders: () => Promise<void>;
  run: () => Promise<void>;
  clearOutput: () => void;
};

export type ExecViewModel = {
  getState: () => ExecState;
  actions: ExecActions;
};

const createInitialState = (): ExecState => ({
  provider: "",
  providers: [],
  script: "",
  workspace: "",
  output: "",
  status: "idle",
  errorMessage: null,
  lastRunAt: null,
});

export const createExecViewModel = (fetcher: typeof fetch): ExecViewModel => {
  let state = createInitialState();

  const getState = () => state;
  const setState = (updater: (current: ExecState) => ExecState) => {
    state = updater(state);
  };

  const setProvider = (value: string) => {
    setState((current) => ({ ...current, provider: value }));
  };

  const setScript = (value: string) => {
    setState((current) => ({ ...current, script: value }));
  };

  const setWorkspace = (value: string) => {
    setState((current) => ({ ...current, workspace: value }));
  };

  const clearOutput = () => {
    setState((current) => ({ ...current, output: "" }));
  };

  const loadProviders = async () => {
    const keyState = readKeyStore();
    if (!keyState.key) {
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: "missing_api_key",
      }));
      return;
    }

    const response = await fetcher(`${consoleConfig.apiBaseUrl}/providers`, {
      headers: { "x-deca-key": keyState.key },
    });
    if (!response.ok) {
      const text = await response.text();
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: text || "providers_failed",
      }));
      return;
    }

    const data = (await response.json()) as ProvidersResponse;
    const providers = data.providers.map((item) => item.type);
    setState((current) => ({
      ...current,
      providers,
      provider: current.provider || providers[0] || "",
      status: "idle",
      errorMessage: null,
    }));
  };

  const run = async () => {
    const keyState = readKeyStore();
    if (!keyState.key) {
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: "missing_api_key",
      }));
      return;
    }
    if (!state.script.trim()) {
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: "missing_script",
      }));
      return;
    }

    setState((current) => ({
      ...current,
      status: "running",
      errorMessage: null,
    }));
    const response = await fetcher(`${consoleConfig.apiBaseUrl}/exec`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-deca-key": keyState.key,
      },
      body: JSON.stringify({
        command: state.script,
        provider: state.provider || undefined,
        workspace: state.workspace || undefined,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: text || "exec_failed",
      }));
      return;
    }

    const data = (await response.json()) as ExecResponse;
    setState((current) => ({
      ...current,
      output: data.stdout || data.stderr || "no output",
      status: "idle",
      lastRunAt: Date.now(),
    }));
  };

  return {
    getState,
    actions: {
      setProvider,
      setScript,
      setWorkspace,
      loadProviders,
      run,
      clearOutput,
    },
  };
};
