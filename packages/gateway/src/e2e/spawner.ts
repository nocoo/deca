/**
 * Gateway Spawner for E2E Testing
 *
 * Spawns the Gateway as an independent subprocess with real Agent (LLM) integration.
 */

import { type Subprocess, spawn } from "bun";
import { join } from "node:path";
import {
  type AnthropicCredentials,
  type DiscordCredentials,
  requireAnthropicCredentials,
} from "./credentials";

export interface SpawnerConfig {
  /** Anthropic credentials (loaded automatically if not provided) */
  anthropic?: AnthropicCredentials;
  /** Discord credentials (optional, for Discord channel) */
  discord?: DiscordCredentials;
  /** HTTP port (default: random) */
  httpPort?: number;
  /** Enable terminal channel */
  enableTerminal?: boolean;
  /** Use echo mode instead of real agent */
  echoMode?: boolean;
  /** Startup timeout in ms (default: 15000) */
  startupTimeout?: number;
  /** Enable debug output */
  debug?: boolean;
}

export interface GatewayProcess {
  /** Stop the gateway process */
  stop: () => Promise<void>;
  /** Check if gateway is running */
  isRunning: () => boolean;
  /** Process ID */
  pid: number;
  /** HTTP port (if HTTP channel enabled) */
  httpPort: number;
  /** HTTP base URL */
  httpBaseUrl: string;
  /** Active channels */
  channels: string[];
}

/**
 * Spawn a Gateway process for E2E testing.
 *
 * @param config - Spawner configuration
 * @returns Gateway process handle
 */
export async function spawnGateway(
  config: SpawnerConfig = {},
): Promise<GatewayProcess> {
  const startupTimeout = config.startupTimeout ?? 15000;
  const debug = config.debug ?? false;
  const httpPort = config.httpPort ?? 40000 + Math.floor(Math.random() * 10000);

  const cwd = getPackageDir();
  const script = "cli.ts";

  if (debug) {
    console.log(`[Gateway Spawner] Starting gateway on port ${httpPort}...`);
    console.log(`[Gateway Spawner] CWD: ${cwd}`);
  }

  let isRunning = true;
  const channels: string[] = ["http"];

  // Build environment
  const env: Record<string, string> = {
    ...process.env,
    HTTP_PORT: String(httpPort),
    FORCE_COLOR: "0",
  };

  // Agent credentials
  if (!config.echoMode) {
    const anthropic = config.anthropic ?? requireAnthropicCredentials();
    env.ANTHROPIC_API_KEY = anthropic.apiKey;
    if (anthropic.baseUrl) {
      env.ANTHROPIC_BASE_URL = anthropic.baseUrl;
    }
  } else {
    env.ECHO_MODE = "true";
  }

  // Discord channel
  if (config.discord) {
    env.DISCORD_TOKEN = config.discord.botToken;
    env.DISCORD_ALLOW_BOTS = "true"; // Allow bot messages for E2E testing
    channels.push("discord");
  }

  // Terminal channel
  if (config.enableTerminal) {
    env.TERMINAL = "true";
    channels.push("terminal");
  }

  if (debug) {
    console.log(`[Gateway Spawner] Channels: ${channels.join(", ")}`);
    console.log(`[Gateway Spawner] Echo mode: ${config.echoMode ?? false}`);
  }

  const proc = spawn({
    cmd: ["bun", "run", script],
    cwd,
    stdout: debug ? "inherit" : "pipe",
    stderr: debug ? "inherit" : "pipe",
    env,
  });

  // Track process exit
  proc.exited.then((code) => {
    isRunning = false;
    if (debug) {
      console.log(`[Gateway Spawner] Gateway exited with code ${code}`);
    }
  });

  // Wait for gateway to be ready
  const readyPromise = waitForGatewayReady(proc, httpPort, startupTimeout, debug);

  try {
    await readyPromise;
  } catch (error) {
    proc.kill();
    throw error;
  }

  if (debug) {
    console.log(
      `[Gateway Spawner] Gateway ready on port ${httpPort} (PID: ${proc.pid})`,
    );
  }

  return {
    stop: async () => {
      if (!isRunning) return;

      if (debug) {
        console.log(`[Gateway Spawner] Stopping gateway (PID: ${proc.pid})...`);
      }

      proc.kill("SIGTERM");

      const exitTimeout = 5000;
      const exitPromise = proc.exited;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Gateway stop timeout")), exitTimeout);
      });

      try {
        await Promise.race([exitPromise, timeoutPromise]);
      } catch {
        if (debug) {
          console.log("[Gateway Spawner] Force killing gateway...");
        }
        proc.kill("SIGKILL");
        await proc.exited;
      }

      isRunning = false;
    },
    isRunning: () => isRunning,
    pid: proc.pid,
    httpPort,
    httpBaseUrl: `http://127.0.0.1:${httpPort}`,
    channels,
  };
}

/**
 * Wait for gateway to be ready by polling the health endpoint.
 */
async function waitForGatewayReady(
  proc: Subprocess,
  port: number,
  timeout: number,
  debug: boolean,
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 200;

  while (Date.now() - startTime < timeout) {
    // Check if process died
    if (proc.exitCode !== null) {
      throw new Error(`Gateway process exited with code ${proc.exitCode}`);
    }

    // Try health endpoint
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        if (debug) {
          console.log(
            `[Gateway Spawner] Health check passed after ${Date.now() - startTime}ms`,
          );
        }
        return;
      }
    } catch {
      // Not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Gateway startup timeout (${timeout}ms)`);
}

/**
 * Get the packages/gateway directory path.
 */
export function getPackageDir(): string {
  // This file is at packages/gateway/src/e2e/spawner.ts
  // packages/gateway is 2 levels up: e2e -> src -> (gateway)
  return join(import.meta.dir, "..", "..");
}
