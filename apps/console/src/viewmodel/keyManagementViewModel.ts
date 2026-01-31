import { consoleConfig } from "../config/consoleConfig";
import type { AuthKeyResponse } from "../model/api";
import {
  clearKeyStore,
  readKeyStore,
  writeKeyStore,
} from "../state/consoleKeyStore";

export type KeyManagementState = {
  apiKey: string;
  status: "idle" | "loading" | "ready" | "error";
  lastFetchedAt: number | null;
  errorMessage: string | null;
};

export type KeyManagementActions = {
  loadKey: () => Promise<void>;
  resetKey: () => Promise<void>;
  setKey: (value: string) => void;
};

export type KeyManagementViewModel = {
  getState: () => KeyManagementState;
  actions: KeyManagementActions;
};

const createInitialState = (): KeyManagementState => {
  const stored = readKeyStore();
  return {
    apiKey: stored.key,
    status: stored.key ? "ready" : "idle",
    lastFetchedAt: stored.lastFetchedAt,
    errorMessage: null,
  };
};

export const createKeyManagementViewModel = (
  fetcher: typeof fetch,
): KeyManagementViewModel => {
  let state = createInitialState();

  const getState = () => state;
  const setState = (
    updater: (current: KeyManagementState) => KeyManagementState,
  ) => {
    state = updater(state);
  };

  const setKey = (value: string) => {
    setState((current) => ({
      ...current,
      apiKey: value,
      status: value ? "ready" : "idle",
      errorMessage: null,
    }));
    writeKeyStore(value);
  };

  const fetchKey = async () => {
    const response = await fetcher(`${consoleConfig.apiBaseUrl}/auth/key`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "auth_key_failed");
    }
    return (await response.json()) as AuthKeyResponse;
  };

  const loadKey = async () => {
    setState((current) => ({
      ...current,
      status: "loading",
      errorMessage: null,
    }));
    try {
      const data = await fetchKey();
      writeKeyStore(data.key);
      setState((current) => ({
        ...current,
        apiKey: data.key,
        status: "ready",
        lastFetchedAt: Date.now(),
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "auth_key_failed";
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: message,
      }));
    }
  };

  const resetKey = async () => {
    clearKeyStore();
    setState((current) => ({
      ...current,
      apiKey: "",
      status: "idle",
      lastFetchedAt: null,
      errorMessage: null,
    }));
    await loadKey();
  };

  return {
    getState,
    actions: {
      loadKey,
      resetKey,
      setKey,
    },
  };
};
