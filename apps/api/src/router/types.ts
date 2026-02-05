export type IsolationLevel = "none" | "process" | "container" | "vm";

export type ProviderType =
  | "applescript"
  | "codex"
  | "claude"
  | "opencode"
  | "native";

export type ProviderCapabilities = {
  isolation: IsolationLevel;
  networking: boolean;
  workspace: boolean;
};

export type ExecRequest = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  needsNetwork?: boolean;
  needsIsolation?: boolean;
  needsWorkspace?: boolean;
  provider?: ProviderType;
};

export type ExecResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  provider: ProviderType;
  fallback: {
    used: boolean;
    reason: string;
    attempted: ProviderType[];
  };
};
