/**
 * Deca Storage Package
 *
 * Unified storage access for configuration, credentials, and data.
 */

// Types
export type {
  PathResolver,
  PathResolverOptions,
  DecaConfig,
  ConfigManager,
  CredentialStore,
  CredentialManager,
  ProviderId,
  ProviderCredential,
  ResolvedProvider,
  ModelConfig,
} from "./types";

export { LLM_PROVIDER_IDS } from "./types";

// Paths
export { resolvePaths, hasProjectDir, STATE_DIR_NAME } from "./paths";

// Config
export { createConfigManager } from "./config";

// Credentials
export { createCredentialManager } from "./credentials";

// Provider
export { createProviderResolver, type ProviderResolver } from "./provider";
