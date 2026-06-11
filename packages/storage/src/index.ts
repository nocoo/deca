/**
 * Deca Storage Package
 *
 * Unified storage access for configuration, credentials, and data.
 */

// Config
export { createConfigManager } from "./config";
// Credentials
export { createCredentialManager } from "./credentials";

// Paths
export { hasProjectDir, resolvePaths, STATE_DIR_NAME } from "./paths";
// Provider
export { createProviderResolver, type ProviderResolver } from "./provider";
// Types
export type {
  ConfigManager,
  CredentialManager,
  CredentialStore,
  DecaConfig,
  ModelConfig,
  PathResolver,
  PathResolverOptions,
  ProviderCredential,
  ProviderId,
  ResolvedProvider,
} from "./types";
export { LLM_PROVIDER_IDS } from "./types";
