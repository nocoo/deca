import type {
  AuthKeyResponse,
  CapabilitiesResponse,
  ExecResponse,
  HealthResponse,
  ProvidersResponse,
} from "../model/api";

export type ConsoleState = {
  title: string;
  providers: string[];
  selectedProvider: string;
  script: string;
  result: string;
  apiKey: string;
  loading: boolean;
  providersLoaded: boolean;
};

export type ConsoleViewModel = {
  getState: () => ConsoleState;
  setTitle: (value: string) => void;
  setScript: (value: string) => void;
  setSelectedProvider: (value: string) => void;
  setResult: (value: string) => void;
  setApiKey: (value: string) => void;
  setLoading: (value: boolean) => void;
  setProviders: (value: string[]) => void;
  setProvidersLoaded: (value: boolean) => void;
  fetchHealth: () => Promise<HealthResponse>;
  fetchCapabilities: () => Promise<CapabilitiesResponse>;
  fetchProviders: () => Promise<ProvidersResponse>;
  execScript: () => Promise<ExecResponse>;
  fetchAuthKey: () => Promise<AuthKeyResponse>;
};

export type ConsoleConfig = {
  apiBaseUrl: string;
  apiKey: string;
};

const createInitialState = (): ConsoleState => ({
  title: "Deca Console",
  providers: [],
  selectedProvider: "",
  script: 'display dialog "Hello from Deca"',
  result: "",
  apiKey: "",
  loading: false,
  providersLoaded: false,
});

export const createConsoleViewModel = (
  fetcher: typeof fetch,
  config: ConsoleConfig,
): ConsoleViewModel => {
  const apiBaseUrl = config.apiBaseUrl;
  let state: ConsoleState = createInitialState();

  const getState = () => state;
  const setTitle = (value: string) => {
    state = { ...state, title: value };
  };
  const setScript = (value: string) => {
    state = { ...state, script: value };
  };
  const setSelectedProvider = (value: string) => {
    state = { ...state, selectedProvider: value };
  };
  const setResult = (value: string) => {
    state = { ...state, result: value };
  };
  const setApiKey = (value: string) => {
    state = { ...state, apiKey: value };
  };
  const setLoading = (value: boolean) => {
    state = { ...state, loading: value };
  };
  const setProviders = (value: string[]) => {
    state = { ...state, providers: value };
  };
  const setProvidersLoaded = (value: boolean) => {
    state = { ...state, providersLoaded: value };
  };

  const fetchHealth = async () => {
    const response = await fetcher(`${apiBaseUrl}/health`);
    if (!response.ok) {
      throw new Error("health_check_failed");
    }
    return (await response.json()) as HealthResponse;
  };

  const fetchCapabilities = async () => {
    const response = await fetcher(`${apiBaseUrl}/capabilities`, {
      headers: { "x-deca-key": config.apiKey },
    });
    if (!response.ok) {
      throw new Error("capabilities_failed");
    }
    return (await response.json()) as CapabilitiesResponse;
  };

  const fetchProviders = async () => {
    const response = await fetcher(`${apiBaseUrl}/providers`, {
      headers: { "x-deca-key": config.apiKey },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "providers_failed");
    }
    return (await response.json()) as ProvidersResponse;
  };

  const execScript = async () => {
    const response = await fetcher(`${apiBaseUrl}/exec`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-deca-key": config.apiKey,
      },
      body: JSON.stringify({
        command: state.script,
        provider: state.selectedProvider || undefined,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "exec_failed");
    }
    return (await response.json()) as ExecResponse;
  };

  const fetchAuthKey = async () => {
    const response = await fetcher(`${apiBaseUrl}/auth/key`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "auth_key_failed");
    }
    return (await response.json()) as AuthKeyResponse;
  };

  return {
    getState,
    setTitle,
    setScript,
    setSelectedProvider,
    setResult,
    setApiKey,
    setLoading,
    setProviders,
    setProvidersLoaded,
    fetchHealth,
    fetchCapabilities,
    fetchProviders,
    execScript,
    fetchAuthKey,
  };
};

export const getDefaultConsoleState = () => createInitialState();
