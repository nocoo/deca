/**
 * Path resolution for Deca storage
 */

import { existsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";
import type { PathResolver, PathResolverOptions } from "./types";

export const STATE_DIR_NAME = ".deca";
const CONFIG_FILENAME = "config.json";
const CREDENTIALS_DIRNAME = "credentials";
const SESSIONS_DIRNAME = "sessions";
const MEMORY_DIRNAME = "memory";
const KNOWLEDGE_DIRNAME = "knowledge";
const HEARTBEAT_FILENAME = "HEARTBEAT.md";

/**
 * Expand ~ to home directory
 */
function expandTilde(path: string, homedir: string): string {
  if (path.startsWith("~")) {
    return path.replace(/^~(?=$|[/\\])/, homedir);
  }
  return path;
}

/**
 * Resolve user-level state directory
 */
function resolveStateDir(options: {
  env?: NodeJS.ProcessEnv;
  homedir: string;
}): string {
  const { env, homedir } = options;
  const override = env?.DECA_STATE_DIR?.trim();

  if (override) {
    const expanded = expandTilde(override, homedir);
    return resolve(expanded);
  }

  return join(homedir, STATE_DIR_NAME);
}

/**
 * Resolve project-level directory
 */
function resolveProjectDir(cwd: string): string | null {
  const projectDir = join(cwd, STATE_DIR_NAME);
  if (existsSync(projectDir)) {
    return projectDir;
  }
  return null;
}

/**
 * Resolve all storage paths
 */
export function resolvePaths(options?: PathResolverOptions): PathResolver {
  const env = options?.env ?? process.env;
  const homedir = options?.homedir ?? osHomedir();
  const cwd = options?.cwd ?? process.cwd();

  const stateDir = resolveStateDir({ env, homedir });
  const projectDir = resolveProjectDir(cwd);

  // Config path can be overridden
  const configPathOverride = env.DECA_CONFIG_PATH?.trim();
  const configPath = configPathOverride
    ? resolve(expandTilde(configPathOverride, homedir))
    : join(stateDir, CONFIG_FILENAME);

  return {
    stateDir,
    projectDir,
    configPath,
    credentialsDir: join(stateDir, CREDENTIALS_DIRNAME),
    sessionsDir: join(stateDir, SESSIONS_DIRNAME),
    memoryDir: join(stateDir, MEMORY_DIRNAME),
    knowledgeDir: projectDir ? join(projectDir, KNOWLEDGE_DIRNAME) : null,
    heartbeatPath: projectDir ? join(projectDir, HEARTBEAT_FILENAME) : null,
  };
}

/**
 * Check if project directory exists
 */
export function hasProjectDir(cwd?: string): boolean {
  const targetCwd = cwd ?? process.cwd();
  return existsSync(join(targetCwd, STATE_DIR_NAME));
}
