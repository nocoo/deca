import type { ExecRequest, ProviderType } from './types';
import type { Provider } from './provider';

const defaultPriority: ProviderType[] = [
  'codex',
  'claude',
  'opencode',
  'native',
  'applescript',
];

const meetsConstraints = (provider: Provider, request: ExecRequest) => {
  if (request.needsNetwork && !provider.capabilities.networking) {
    return false;
  }
  if (request.needsIsolation && provider.capabilities.isolation === 'none') {
    return false;
  }
  if (request.needsWorkspace && !provider.capabilities.workspace) {
    return false;
  }
  return true;
};

export const selectProviders = (
  providers: Provider[],
  request: ExecRequest
): Provider[] => {
  if (request.provider) {
    const forced = providers.find((p) => p.type === request.provider);
    return forced ? [forced] : [];
  }

  const ordered = [...defaultPriority]
    .map((type) => providers.find((p) => p.type === type))
    .filter((p): p is Provider => Boolean(p));

  return ordered.filter((provider) => meetsConstraints(provider, request));
};
