/**
 * Terminal Spawner for E2E Testing
 *
 * Spawns the Terminal REPL as an independent subprocess for true E2E testing.
 * Provides stdin/stdout interaction for simulating user input.
 */

import { join } from "node:path";
import { spawn } from "bun";

export interface SpawnerConfig {
  /** Startup timeout in ms (default: 10000) */
  startupTimeout?: number;
  /** Enable debug output */
  debug?: boolean;
}

export interface TerminalProcess {
  /** Send input to the terminal and wait for response */
  send: (input: string, timeout?: number) => Promise<string>;
  /** Read all available output without sending input */
  readOutput: () => string;
  /** Stop the terminal process */
  stop: () => Promise<void>;
  /** Check if terminal is running */
  isRunning: () => boolean;
  /** Process ID */
  pid: number;
}

/**
 * Spawn a Terminal REPL process for E2E testing.
 *
 * @param config - Spawner configuration
 * @returns Terminal process handle
 */
export async function spawnTerminal(config: SpawnerConfig = {}): Promise<TerminalProcess> {
  const startupTimeout = config.startupTimeout ?? 10000;
  const debug = config.debug ?? false;

  const cwd = getPackageDir();
  const script = "cli.ts";

  if (debug) {
    console.log("[Spawner] Starting Terminal REPL...");
    console.log(`[Spawner] CWD: ${cwd}`);
  }

  let isRunning = true;
  let outputBuffer = "";

  const proc = spawn({
    cmd: ["bun", "run", script],
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: debug ? "inherit" : "pipe",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
  });

  // Track process exit
  proc.exited.then((code) => {
    isRunning = false;
    if (debug) {
      console.log(`[Spawner] Terminal exited with code ${code}`);
    }
  });

  // Background reader for stdout
  const reader = proc.stdout.getReader();
  let readerDone = false;

  const readLoop = async () => {
    try {
      while (!readerDone) {
        const { done, value } = await reader.read();
        if (done) {
          readerDone = true;
          break;
        }
        const text = new TextDecoder().decode(value);
        outputBuffer += text;
        if (debug) {
          process.stdout.write(`[OUT] ${text}`);
        }
      }
    } catch {
      readerDone = true;
    }
  };

  // Start reading in background
  readLoop();

  // Wait for REPL to be ready (look for prompt ">")
  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Terminal startup timeout (${startupTimeout}ms)`));
    }, startupTimeout);

    proc.exited.then((code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Terminal process exited with code ${code}`));
      }
    });

    const checkReady = setInterval(() => {
      // Look for the prompt ">" or "Terminal REPL started"
      if (outputBuffer.includes(">") || outputBuffer.includes("Terminal REPL started")) {
        clearInterval(checkReady);
        clearTimeout(timeout);
        resolve();
      }
    }, 100);
  });

  try {
    await readyPromise;
  } catch (error) {
    proc.kill();
    throw error;
  }

  if (debug) {
    console.log(`[Spawner] Terminal ready (PID: ${proc.pid})`);
  }

  // Clear startup output from buffer
  outputBuffer = "";

  /**
   * Write to stdin using Bun's FileSink API
   */
  function writeToStdin(data: string): void {
    // Bun's spawn stdin is a FileSink, use write() directly
    proc.stdin.write(data);
    proc.stdin.flush();
  }

  /**
   * Send input to terminal and wait for response
   */
  async function send(input: string, timeout = 10000): Promise<string> {
    // Clear buffer before sending
    outputBuffer = "";

    // Write to stdin
    writeToStdin(`${input}\n`);

    if (debug) {
      console.log(`[IN] ${input}`);
    }

    // Wait for response - need to see the prompt ">" after processing
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Response timeout after ${timeout}ms. Output so far: ${outputBuffer}`));
      }, timeout);

      let lastBufferLength = 0;
      let stableCount = 0;

      const checkResponse = setInterval(() => {
        // Check if output has stabilized (no new content for 2 checks)
        // AND we see the prompt
        const hasPrompt = outputBuffer.includes(">");
        
        if (outputBuffer.length === lastBufferLength && hasPrompt) {
          stableCount++;
          if (stableCount >= 2) {
            clearInterval(checkResponse);
            clearTimeout(timeoutId);
            
            const response = outputBuffer.trim();
            resolve(response);
          }
        } else {
          stableCount = 0;
          lastBufferLength = outputBuffer.length;
        }
      }, 100);
    });
  }

  return {
    send,
    readOutput: () => outputBuffer,
    stop: async () => {
      if (!isRunning) return;

      if (debug) {
        console.log(`[Spawner] Stopping terminal (PID: ${proc.pid})...`);
      }

      // Send exit command first
      try {
        writeToStdin("exit\n");
      } catch {
        // stdin might be closed
      }

      // Wait a bit for graceful exit
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (isRunning) {
        proc.kill("SIGTERM");

        const exitTimeout = 3000;
        const exitPromise = proc.exited;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Terminal stop timeout")), exitTimeout);
        });

        try {
          await Promise.race([exitPromise, timeoutPromise]);
        } catch {
          if (debug) {
            console.log("[Spawner] Force killing terminal...");
          }
          proc.kill("SIGKILL");
          await proc.exited;
        }
      }

      readerDone = true;
      isRunning = false;
    },
    isRunning: () => isRunning,
    pid: proc.pid,
  };
}

/**
 * Get the packages/terminal directory path.
 */
export function getPackageDir(): string {
  // This file is at packages/terminal/src/e2e/spawner.ts
  // packages/terminal is 2 levels up: e2e -> src -> (terminal)
  return join(import.meta.dir, "..", "..");
}
