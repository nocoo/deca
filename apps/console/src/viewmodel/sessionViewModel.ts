import { consoleConfig } from "../config/consoleConfig";
import type { HealthResponse, ProvidersResponse } from "../model/api";
import { readKeyStore } from "../state/consoleKeyStore";

export type SessionState = {
  sessionId: string;
  status: "idle" | "starting" | "ready" | "error";
  events: string[];
  providers: string[];
  healthOk: boolean | null;
  errorMessage: string | null;
  startedAt: number | null;
};

export type SessionActions = {
  startSession: () => Promise<void>;
};

export type SessionViewModel = {
  getState: () => SessionState;
  actions: SessionActions;
};

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createInitialState = (): SessionState => ({
  sessionId: "",
  status: "idle",
  events: [],
  providers: [],
  healthOk: null,
  errorMessage: null,
  startedAt: null,
});

export const createSessionViewModel = (
  fetcher: typeof fetch,
): SessionViewModel => {
  let state = createInitialState();

  const getState = () => state;
  const setState = (updater: (current: SessionState) => SessionState) => {
    state = updater(state);
  };

  const fetchHealth = async () => {
    const response = await fetcher(`${consoleConfig.apiBaseUrl}/health`);
    if (!response.ok) {
      throw new Error("health_check_failed");
    }
    return (await response.json()) as HealthResponse;
  };

  const fetchProviders = async (apiKey: string) => {
    const response = await fetcher(`${consoleConfig.apiBaseUrl}/providers`, {
      headers: { "x-deca-key": apiKey },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "providers_failed");
    }
    return (await response.json()) as ProvidersResponse;
  };

  const startSession = async () => {
    const sessionId = createSessionId();
    setState((current) => ({
      ...current,
      sessionId,
      status: "starting",
      startedAt: Date.now(),
      errorMessage: null,
      events: ["session_created"],
    }));

    try {
      const health = await fetchHealth();
      setState((current) => ({
        ...current,
        healthOk: health.ok,
        events: [...current.events, "health_check_ok"],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        healthOk: false,
        events: [...current.events, "health_check_failed"],
      }));
    }

    const keyState = readKeyStore();
    if (!keyState.key) {
      setState((current) => ({
        ...current,
        status: "ready",
        events: [...current.events, "missing_api_key"],
      }));
      return;
    }

    try {
      const providers = await fetchProviders(keyState.key);
      setState((current) => ({
        ...current,
        providers: providers.providers.map((item) => item.type),
        status: "ready",
        events: [...current.events, "providers_loaded"],
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "providers_failed";
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: message,
        events: [...current.events, "providers_failed"],
      }));
    }
  };

  return {
    getState,
    actions: {
      startSession,
    },
  };
};
