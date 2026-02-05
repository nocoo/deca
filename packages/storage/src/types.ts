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

// ============== Credential Types ==============

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

export interface CredentialStore {
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
    /** Model overrides for this provider */
    models?: ModelConfig;
  };
  discord?: {
    botToken: string;
    applicationId?: string;
  };
  github?: {
    token: string;
  };
  openai?: {
    apiKey: string;
    baseUrl?: string;
    /** Model overrides for this provider */
    models?: ModelConfig;
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
