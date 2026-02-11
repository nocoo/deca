/**
 * Storage types
 */

// ============== Path Types ==============

export interface PathResolver {
  /** User-level state directory (~/.deca) */
  stateDir: string;
  /** Project-level directory (<cwd>/.deca, may be null) */
  projectDir: string | null;

  /** Config file path */
  configPath: string;
  /** Credentials directory */
  credentialsDir: string;
  /** Sessions directory */
  sessionsDir: string;
  /** Memory directory */
  memoryDir: string;
  /** Knowledge directory (project-level) */
  knowledgeDir: string | null;
  /** Heartbeat file path (project-level) */
  heartbeatPath: string | null;
}

export interface PathResolverOptions {
  /** Environment variables */
  env?: NodeJS.ProcessEnv;
  /** Current working directory */
  cwd?: string;
  /** Custom home directory */
  homedir?: string;
}

// ============== Config Types ==============

export interface DecaConfig {
  /** Active LLM provider to use */
  activeProvider?: ProviderId;

  /** Model configuration */
  models?: {
    default?: string;
    providers?: {
      [name: string]: {
        baseUrl?: string;
        model?: string;
      };
    };
  };

  /** Agent configuration */
  agent?: {
    maxTurns?: number;
    enableHeartbeat?: boolean;
    heartbeatInterval?: number;
  };

  /** Channel configuration */
  channels?: {
    discord?: {
      enabled?: boolean;
      defaultChannelId?: string;
      allowedUsers?: string[];
      /** Enable debug mode - show session ID and timing info (default: true) */
      debugMode?: boolean;
    };
  };

  /** Logging configuration */
  logging?: {
    level?: "debug" | "info" | "warn" | "error";
    file?: string;
  };
}

export interface ConfigManager {
  /** Load configuration */
  load(): Promise<DecaConfig>;
  /** Save configuration */
  save(config: DecaConfig): Promise<void>;
  /** Get configuration value */
  get<K extends keyof DecaConfig>(key: K): Promise<DecaConfig[K] | undefined>;
  /** Set configuration value */
  set<K extends keyof DecaConfig>(key: K, value: DecaConfig[K]): Promise<void>;
}

// ============== Provider Types ==============

/** Supported AI provider identifiers */
export type ProviderId = "glm" | "minimax";

/** Provider IDs that are actual LLM providers (not discord/github) */
export const LLM_PROVIDER_IDS: ProviderId[] = ["glm", "minimax"];

/** Model configuration for AI providers */
export interface ModelConfig {
  /** Default model to use */
  default?: string;
  /** Model for fast/cheap operations */
  haiku?: string;
  /** Model for balanced operations */
  sonnet?: string;
  /** Model for complex operations */
  opus?: string;
  /** Model for reasoning/chain-of-thought */
  reasoning?: string;
}

/** Credential configuration for an LLM provider */
export interface ProviderCredential {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for API requests (optional, uses provider default) */
  baseUrl?: string;
  /** Model configuration */
  models?: ModelConfig;
}

/** Resolved provider configuration ready for use */
export interface ResolvedProvider {
  /** Provider identifier */
  id: ProviderId;
  /** API key */
  apiKey: string;
  /** Base URL (resolved, may be default) */
  baseUrl?: string;
  /** Model to use */
  model: string;
}

// ============== Credential Types ==============

export interface CredentialStore {
  // LLM Providers
  glm?: ProviderCredential;
  minimax?: ProviderCredential;

  // Non-LLM credentials
  discord?: {
    botToken: string;
    /**
     * Discord Application ID (from Developer Portal -> General Information).
     * Used for slash command registration.
     * Note: For bots, this equals the bot's user ID in Discord.
     */
    botApplicationId?: string;
    /** Per-server configurations keyed by environment name */
    servers?: {
      production?: {
        guildId: string;
      };
      test?: {
        guildId: string;
        testChannelId?: string;
        testChannelWebhookUrl?: string;
        mainChannelId?: string;
        mainChannelWebhookUrl?: string;
        mainUserId?: string;
      };
    };
  };
  github?: {
    token: string;
  };
  tavily?: {
    apiKey: string;
  };
}

export interface CredentialManager {
  /** Get credential */
  get<K extends keyof CredentialStore>(
    key: K,
  ): Promise<CredentialStore[K] | null>;
  /** Set credential */
  set<K extends keyof CredentialStore>(
    key: K,
    value: CredentialStore[K],
  ): Promise<void>;
  /** Delete credential */
  delete(key: keyof CredentialStore): Promise<void>;
  /** List configured credentials */
  list(): Promise<(keyof CredentialStore)[]>;
  /** Check if credential exists */
  has(key: keyof CredentialStore): Promise<boolean>;
}
