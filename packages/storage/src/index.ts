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
} from "./types";

// Paths
export { resolvePaths, hasProjectDir, STATE_DIR_NAME } from "./paths";

// Config
export { createConfigManager } from "./config";

// Credentials
export { createCredentialManager } from "./credentials";
