import { consoleConfig } from "../config/consoleConfig";
import type { ExecResponse, ProvidersResponse } from "../model/api";
import { readKeyStore } from "../state/consoleKeyStore";

export type LogEntry = {
  id: string;
  timestamp: number;
  provider: string;
  status: "success" | "error";
  durationMs: number;
  summary: string;
};

export type StatsState = {
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
  providers: string[];
  logs: LogEntry[];
  status: "idle" | "loading" | "error";
  errorMessage: string | null;
};

export type StatsActions = {
  refresh: () => Promise<void>;
};

export type StatsViewModel = {
  getState: () => StatsState;
  actions: StatsActions;
};

const createInitialState = (): StatsState => ({
  totalRuns: 0,
  successRate: 0,
  avgLatencyMs: 0,
  providers: [],
  logs: [],
  status: "idle",
  errorMessage: null,
});

const mapExecToLog = (exec: ExecResponse): LogEntry => ({
  id: `${exec.provider}-${Date.now()}`,
  timestamp: Date.now(),
  provider: exec.provider,
  status: exec.success ? "success" : "error",
  durationMs: exec.elapsedMs,
  summary: exec.stdout || exec.stderr || "no output",
});

export const createStatsViewModel = (fetcher: typeof fetch): StatsViewModel => {
  let state = createInitialState();

  const getState = () => state;
  const setState = (updater: (current: StatsState) => StatsState) => {
    state = updater(state);
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

  const refresh = async () => {
    const keyState = readKeyStore();
    if (!keyState.key) {
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: "missing_api_key",
      }));
      return;
    }

    setState((current) => ({
      ...current,
      status: "loading",
      errorMessage: null,
    }));
    try {
      const providers = await fetchProviders(keyState.key);
      const list = providers.providers.map((item) => item.type);

      const logs = state.logs.length
        ? state.logs
        : [
            mapExecToLog({
              success: true,
              exitCode: 0,
              stdout: "session boot",
              stderr: "",
              elapsedMs: 148,
              provider: list[0] || "system",
              fallback: { used: false, reason: "", attempted: [] },
            }),
          ];

      const totalRuns = logs.length;
      const successRuns = logs.filter((log) => log.status === "success").length;
      const avgLatency =
        logs.reduce((sum, log) => sum + log.durationMs, 0) / totalRuns;

      setState((current) => ({
        ...current,
        providers: list,
        logs,
        totalRuns,
        successRate: totalRuns
          ? Math.round((successRuns / totalRuns) * 100)
          : 0,
        avgLatencyMs: Math.round(avgLatency || 0),
        status: "idle",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "stats_failed";
      setState((current) => ({
        ...current,
        status: "error",
        errorMessage: message,
      }));
    }
  };

  return {
    getState,
    actions: { refresh },
  };
};
