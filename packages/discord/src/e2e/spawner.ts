/**
 * Discord Bot Spawner for E2E Testing
 *
 * Automatically starts and stops the bot process for E2E tests.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { type Subprocess, spawn } from "bun";

export interface SpawnerConfig {
  /** Working directory (apps/api) */
  cwd: string;
  /** Bot mode: "echo" or "agent" */
  mode?: "echo" | "agent";
  /** Enable debounce for message merging */
  debounce?: boolean;
  /** Allow processing bot/webhook messages (for E2E testing) */
  allowBots?: boolean;
  /** Startup timeout in ms (default: 10000) */
  startupTimeout?: number;
  /** Enable debug output */
  debug?: boolean;
}

export interface BotProcess {
  /** Stop the bot process */
  stop: () => Promise<void>;
  /** Check if bot is running */
  isRunning: () => boolean;
  /** Process ID */
  pid: number;
}

/**
 * Spawn a Discord bot process for E2E testing.
 *
 * @param config - Spawner configuration
 * @returns Bot process handle
 */
export async function spawnBot(config: SpawnerConfig): Promise<BotProcess> {
  const mode = config.mode ?? "echo";
  const startupTimeout = config.startupTimeout ?? 10000;
  const debug = config.debug ?? false;

  // Build command - use cli.ts at package root
  const script = "cli.ts";
  const args: string[] = [];

  if (mode === "echo") {
    args.push("--echo");
  }
  if (config.debounce) {
    args.push("--debounce");
  }
  if (config.allowBots) {
    args.push("--allow-bots");
  }

  // Load Discord token from credentials
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  let discordToken: string | undefined;
  try {
    const content = await Bun.file(credPath).text();
    const creds = JSON.parse(content);
    discordToken = creds.botToken;
  } catch {
    throw new Error(`Failed to load Discord token from ${credPath}`);
  }

  if (!discordToken) {
    throw new Error("Missing botToken in discord.json");
  }

  if (debug) {
    console.log(`[Spawner] Starting bot in ${mode} mode...`);
    console.log(`[Spawner] CWD: ${config.cwd}`);
    console.log(`[Spawner] Args: ${args.join(" ")}`);
  }

  let isRunning = true;

  const proc = spawn({
    cmd: ["bun", "run", script, ...args],
    cwd: config.cwd,
    stdout: debug ? "inherit" : "pipe",
    stderr: debug ? "inherit" : "pipe",
    env: {
      ...process.env,
      DISCORD_TOKEN: discordToken,
      // Prevent bot from requiring interactive input
      FORCE_COLOR: "0",
    },
  });

  // Track process exit
  proc.exited.then((code) => {
    isRunning = false;
    if (debug) {
      console.log(`[Spawner] Bot exited with code ${code}`);
    }
  });

  // Wait for bot to be ready
  // Look for "Connected to Discord as" in output
  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Bot startup timeout (${startupTimeout}ms)`));
    }, startupTimeout);

    // Track early exit
    proc.exited.then((code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Bot process exited with code ${code}`));
      }
    });

    // If we're in debug mode, stdout goes to inherit, so we can't read it
    // In that case, wait for "Connected" message via a different mechanism
    if (debug) {
      // Poll for connection by checking if process is still running
      const checkInterval = setInterval(() => {
        if (!isRunning) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          reject(new Error("Bot process died during startup"));
        }
      }, 500);

      // Give some time for connection
      setTimeout(() => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        if (isRunning) {
          resolve();
        } else {
          reject(new Error("Bot process not running after startup delay"));
        }
      }, 5000);
      return;
    }

    // Read stdout to detect ready state
    const reader = proc.stdout?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      resolve(); // No stdout, assume ready after delay
      return;
    }

    let output = "";

    const checkOutput = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = new TextDecoder().decode(value);
          output += text;

          // Check for ready message
          if (
            output.includes("Connected to Discord") ||
            output.includes("✅ Connected to Discord") ||
            output.includes("✅ Connected as")
          ) {
            clearTimeout(timeout);
            reader.releaseLock();
            resolve();
            return;
          }

          // Check for error
          if (output.includes("Error:") || output.includes("error:") || output.includes("❌")) {
            clearTimeout(timeout);
            reader.releaseLock();
            reject(new Error(`Bot startup error: ${output}`));
            return;
          }
        }
      } catch {
        // Reader closed
      }
    };

    checkOutput();
  });

  try {
    await readyPromise;
  } catch (error) {
    // Kill the process if startup failed
    proc.kill();
    throw error;
  }

  if (debug) {
    console.log(`[Spawner] Bot ready (PID: ${proc.pid})`);
  }

  return {
    stop: async () => {
      if (!isRunning) return;

      if (debug) {
        console.log(`[Spawner] Stopping bot (PID: ${proc.pid})...`);
      }

      // Send SIGTERM for graceful shutdown
      proc.kill("SIGTERM");

      // Wait for exit with timeout
      const exitTimeout = 5000;
      const exitPromise = proc.exited;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Bot stop timeout")), exitTimeout);
      });

      try {
        await Promise.race([exitPromise, timeoutPromise]);
      } catch {
        // Force kill if graceful shutdown fails
        if (debug) {
          console.log("[Spawner] Force killing bot...");
        }
        proc.kill("SIGKILL");
        await proc.exited;
      }

      isRunning = false;
    },
    isRunning: () => isRunning,
    pid: proc.pid,
  };
}

/**
 * Get the packages/discord directory path.
 */
export function getApiDir(): string {
  // This file is at packages/discord/src/e2e/spawner.ts
  // So packages/discord is 2 levels up: e2e -> src -> (discord)
  return join(import.meta.dir, "..", "..");
}
