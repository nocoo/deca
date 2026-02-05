/**
 * HTTP Server Spawner for E2E Testing
 *
 * Spawns the HTTP server as an independent subprocess for true E2E testing.
 */

import { join } from "node:path";
import { type Subprocess, spawn } from "bun";

export interface SpawnerConfig {
  /** Port to run server on (default: random) */
  port?: number;
  /** API key for authentication */
  apiKey?: string;
  /** Startup timeout in ms (default: 10000) */
  startupTimeout?: number;
  /** Enable debug output */
  debug?: boolean;
}

export interface ServerProcess {
  /** Stop the server process */
  stop: () => Promise<void>;
  /** Check if server is running */
  isRunning: () => boolean;
  /** Process ID */
  pid: number;
  /** Actual port the server is listening on */
  port: number;
  /** Base URL for requests */
  baseUrl: string;
}

/**
 * Spawn an HTTP server process for E2E testing.
 *
 * @param config - Spawner configuration
 * @returns Server process handle
 */
export async function spawnServer(config: SpawnerConfig = {}): Promise<ServerProcess> {
  const startupTimeout = config.startupTimeout ?? 10000;
  const debug = config.debug ?? false;
  
  // Use a random port if not specified
  const port = config.port ?? (40000 + Math.floor(Math.random() * 10000));

  const cwd = getPackageDir();
  const script = "cli.ts";

  if (debug) {
    console.log(`[Spawner] Starting HTTP server on port ${port}...`);
    console.log(`[Spawner] CWD: ${cwd}`);
  }

  let isRunning = true;
  let actualPort = port;

  const env: Record<string, string> = {
    ...process.env,
    PORT: String(port),
    FORCE_COLOR: "0",
  };

  if (config.apiKey) {
    env.API_KEY = config.apiKey;
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
      console.log(`[Spawner] Server exited with code ${code}`);
    }
  });

  // Wait for server to be ready
  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server startup timeout (${startupTimeout}ms)`));
    }, startupTimeout);

    // Track early exit
    proc.exited.then((code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });

    // If in debug mode, poll for readiness
    if (debug) {
      const checkInterval = setInterval(async () => {
        if (!isRunning) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          reject(new Error("Server process died during startup"));
          return;
        }

        // Try to connect to health endpoint
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          if (response.ok) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // Not ready yet
        }
      }, 200);
      return;
    }

    // Read stdout to detect ready state
    const reader = proc.stdout?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      // Fall back to polling
      pollForReady(port, timeout, resolve, reject);
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

          // Check for ready message: "Server listening on http://..."
          const portMatch = output.match(/listening on http:\/\/[^:]+:(\d+)/);
          if (portMatch) {
            actualPort = Number.parseInt(portMatch[1], 10);
            clearTimeout(timeout);
            reader.releaseLock();
            resolve();
            return;
          }

          // Check for error
          if (output.includes("Error:") || output.includes("error:") || output.includes("❌")) {
            clearTimeout(timeout);
            reader.releaseLock();
            reject(new Error(`Server startup error: ${output}`));
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
    proc.kill();
    throw error;
  }

  if (debug) {
    console.log(`[Spawner] Server ready on port ${actualPort} (PID: ${proc.pid})`);
  }

  return {
    stop: async () => {
      if (!isRunning) return;

      if (debug) {
        console.log(`[Spawner] Stopping server (PID: ${proc.pid})...`);
      }

      proc.kill("SIGTERM");

      const exitTimeout = 5000;
      const exitPromise = proc.exited;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Server stop timeout")), exitTimeout);
      });

      try {
        await Promise.race([exitPromise, timeoutPromise]);
      } catch {
        if (debug) {
          console.log("[Spawner] Force killing server...");
        }
        proc.kill("SIGKILL");
        await proc.exited;
      }

      isRunning = false;
    },
    isRunning: () => isRunning,
    pid: proc.pid,
    port: actualPort,
    baseUrl: `http://127.0.0.1:${actualPort}`,
  };
}

/**
 * Poll for server readiness via health endpoint.
 */
function pollForReady(
  port: number,
  timeout: ReturnType<typeof setTimeout>,
  resolve: () => void,
  reject: (error: Error) => void,
): void {
  const checkInterval = setInterval(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve();
      }
    } catch {
      // Not ready yet
    }
  }, 100);

  // Clean up on timeout
  setTimeout(() => {
    clearInterval(checkInterval);
  }, 15000);
}

/**
 * Get the packages/http directory path.
 */
export function getPackageDir(): string {
  // This file is at packages/http/src/e2e/spawner.ts
  // packages/http is 2 levels up: e2e -> src -> (http)
  return join(import.meta.dir, "..", "..");
}
