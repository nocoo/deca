import {
  type ConfigManager,
  type CredentialManager,
  LLM_PROVIDER_IDS,
  type ProviderCredential,
  type ProviderId,
  type ResolvedProvider,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export interface ProviderResolver {
  resolve(): Promise<ResolvedProvider | null>;
  resolveOrThrow(): Promise<ResolvedProvider>;
  list(): Promise<ProviderId[]>;
}

function isValidProviderId(id: string): id is ProviderId {
  return LLM_PROVIDER_IDS.includes(id as ProviderId);
}

export function createProviderResolver(
  configManager: ConfigManager,
  credentialManager: CredentialManager,
  env: NodeJS.ProcessEnv = process.env,
): ProviderResolver {
  async function getAvailableProviders(): Promise<ProviderId[]> {
    const allCredentials = await credentialManager.list();
    return allCredentials.filter((id) =>
      LLM_PROVIDER_IDS.includes(id as ProviderId),
    ) as ProviderId[];
  }

  async function resolveProviderId(): Promise<ProviderId | null> {
    const envProvider = env.DECA_PROVIDER;
    if (envProvider && isValidProviderId(envProvider)) {
      const credential = await credentialManager.get(envProvider);
      if (credential) {
        return envProvider;
      }
    }

    const config = await configManager.load();
    if (config.activeProvider) {
      const credential = await credentialManager.get(config.activeProvider);
      if (credential) {
        return config.activeProvider;
      }
    }

    const available = await getAvailableProviders();
    return available.length > 0 ? available[0] : null;
  }

  async function resolve(): Promise<ResolvedProvider | null> {
    const providerId = await resolveProviderId();
    if (!providerId) {
      return null;
    }

    const credential = (await credentialManager.get(
      providerId,
    )) as ProviderCredential | null;
    if (!credential) {
      return null;
    }

    return {
      id: providerId,
      apiKey: credential.apiKey,
      baseUrl: credential.baseUrl,
      model: credential.models?.default ?? DEFAULT_MODEL,
      headers: credential.headers,
    };
  }

  async function resolveOrThrow(): Promise<ResolvedProvider> {
    const result = await resolve();
    if (!result) {
      throw new Error(
        "No provider configured. Create ~/.deca/credentials/<provider>.json",
      );
    }
    return result;
  }

  async function list(): Promise<ProviderId[]> {
    return getAvailableProviders();
  }

  return {
    resolve,
    resolveOrThrow,
    list,
  };
}
