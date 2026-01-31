export type HealthResponse = {
  ok: boolean;
};

export type ProviderCapabilities = {
  isolation: 'none' | 'process' | 'container' | 'vm';
  networking: boolean;
  workspace: boolean;
};

export type ProviderInfo = {
  type: string;
  available?: boolean;
  capabilities: ProviderCapabilities;
};

export type CapabilitiesResponse = {
  providers: ProviderInfo[];
};

export type ProvidersResponse = {
  providers: ProviderInfo[];
};

export type ExecResponse = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  provider: string;
  fallback: {
    used: boolean;
    reason: string;
    attempted: string[];
  };
};

export type AuthKeyResponse = {
  key: string;
  header: string;
};
