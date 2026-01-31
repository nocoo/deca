import type {
  ExecRequest,
  ExecResult,
  ProviderCapabilities,
  ProviderType,
} from './types';

export type Executor = {
  exec: (request: ExecRequest) => Promise<Omit<ExecResult, 'provider' | 'fallback'>>;
};

export type Provider = {
  type: ProviderType;
  isAvailable: () => Promise<boolean>;
  capabilities: ProviderCapabilities;
  executor: Executor;
};
