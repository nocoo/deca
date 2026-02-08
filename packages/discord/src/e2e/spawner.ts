/**
 * Discord Bot Spawner for E2E Testing
 *
 * Automatically starts and stops the bot process for E2E tests.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "bun";

export interface SpawnerConfig {
  /** Working directory */
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
  /** Workspace directory for agent file operations */
  workspaceDir?: string;
  /** Enable memory system */
  enableMemory?: boolean;
  /** Memory storage directory */
  memoryDir?: string;
  /** Enable cron scheduler */
  enableCron?: boolean;
  /** Cron storage path */
  cronStoragePath?: string;
  /** HTTP server port (default: 3000) */
  httpPort?: number;
  /** Main channel ID - messages here route to main session */
  mainChannelId?: string;
  /** Main user ID - used for unified session key in main channel */
  mainUserId?: string;
}

interface LLMCredential {
  apiKey: string;
  baseUrl?: string;
  models?: { default?: string };
}

export interface BotProcess {
  /** Stop the bot process */
  stop: () => Promise<void>;
  /** Check if bot is running */
  isRunning: () => boolean;
  /** Process ID */
  pid: number;
  /** Get captured stdout (for checking logs) */
  getOutput: () => string;
}

/**
 * Spawn a Discord bot process for E2E testing.
 *
 * @param config - Spawner configuration
 * @returns Bot process handle
 */
const LLM_PROVIDERS = ["glm", "minimax"] as const;

async function loadLLMCredentials(): Promise<LLMCredential | null> {
  const credDir = join(homedir(), ".deca", "credentials");

  for (const provider of LLM_PROVIDERS) {
    const credPath = join(credDir, `${provider}.json`);
    try {
      const content = await Bun.file(credPath).text();
      return JSON.parse(content) as LLMCredential;
    } catch {
      /* empty - try next provider */
    }
  }
  return null;
}

interface TavilyCredential {
  apiKey: string;
}

async function loadTavilyCredentials(): Promise<TavilyCredential | null> {
  const credPath = join(homedir(), ".deca", "credentials", "tavily.json");
  try {
    const content = await Bun.file(credPath).text();
    return JSON.parse(content) as TavilyCredential;
  } catch {
    return null;
  }
}

export async function spawnBot(config: SpawnerConfig): Promise<BotProcess> {
  const mode = config.mode ?? "echo";
  const startupTimeout = config.startupTimeout ?? 10000;
  const debug = config.debug ?? false;

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

  let llmCreds: LLMCredential | null = null;
  if (mode === "agent") {
    llmCreds = await loadLLMCredentials();
    if (!llmCreds) {
      throw new Error(
        "Agent mode requires LLM credentials in ~/.deca/credentials/",
      );
    }
  }

  const useGateway = mode === "agent";
  const script = useGateway ? "cli.ts" : "cli.ts";
  const cwd = useGateway ? getGatewayDir() : config.cwd;
  const args: string[] = [];

  if (mode === "echo" && !useGateway) {
    args.push("--echo");
  }
  if (config.debounce) {
    args.push("--debounce");
  }
  if (config.allowBots && !useGateway) {
    args.push("--allow-bots");
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DISCORD_TOKEN: discordToken,
    FORCE_COLOR: "0",
    VERBOSE: "true", // Always enable verbose for cache stats logging
  };

  if (useGateway && llmCreds) {
    env.ANTHROPIC_API_KEY = llmCreds.apiKey;
    if (llmCreds.baseUrl) {
      env.ANTHROPIC_BASE_URL = llmCreds.baseUrl;
    }
    if (llmCreds.models?.default) {
      env.ANTHROPIC_MODEL = llmCreds.models.default;
    }
    if (config.allowBots) {
      env.DISCORD_ALLOW_BOTS = "true";
    }
    if (config.workspaceDir) {
      env.WORKSPACE_DIR = config.workspaceDir;
    }
    if (config.enableMemory) {
      env.ENABLE_MEMORY = "true";
    }
    if (config.memoryDir) {
      env.MEMORY_DIR = config.memoryDir;
    }
    if (config.enableCron) {
      env.ENABLE_CRON = "true";
    }
    if (config.cronStoragePath) {
      env.CRON_STORAGE_PATH = config.cronStoragePath;
    }
    if (config.httpPort) {
      env.HTTP_PORT = String(config.httpPort);
    }
    if (config.mainChannelId) {
      env.MAIN_CHANNEL_ID = config.mainChannelId;
    }
    if (config.mainUserId) {
      env.MAIN_USER_ID = config.mainUserId;
    }

    // Load Tavily credentials for search/research skills
    const tavilyCreds = await loadTavilyCredentials();
    if (tavilyCreds) {
      env.TAVILY_API_KEY = tavilyCreds.apiKey;
    }
  }

  if (debug) {
    console.log(`[Spawner] Starting bot in ${mode} mode...`);
    console.log(`[Spawner] CWD: ${cwd}`);
    console.log(`[Spawner] Script: ${script}`);
    console.log(`[Spawner] Args: ${args.join(" ") || "(none)"}`);
    if (useGateway) {
      console.log("[Spawner] Using gateway with LLM");
    }
  }

  let isRunning = true;
  let capturedOutput = ""; // Capture all stdout for getOutput()

  const proc = spawn({
    cmd: ["bun", "run", script, ...args],
    cwd,
    stdout: debug ? "inherit" : "pipe",
    stderr: debug ? "inherit" : "pipe",
    env,
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

    // Read stdout to detect ready state AND capture output
    const reader = proc.stdout?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      resolve(); // No stdout, assume ready after delay
      return;
    }

    let ready = false;

    const checkOutput = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = new TextDecoder().decode(value);
          capturedOutput += text; // Always capture for getOutput()

          if (!ready) {
            // Check for ready message (Discord standalone or Gateway mode)
            if (
              capturedOutput.includes("Connected to Discord") ||
              capturedOutput.includes("✅ Connected to Discord") ||
              capturedOutput.includes("✅ Connected as") ||
              capturedOutput.includes("✅ Gateway started")
            ) {
              clearTimeout(timeout);
              ready = true;
              resolve();
              // Continue reading to capture all output
            }

            // Check for error
            if (
              capturedOutput.includes("Error:") ||
              capturedOutput.includes("error:") ||
              capturedOutput.includes("❌")
            ) {
              clearTimeout(timeout);
              reader.releaseLock();
              reject(new Error(`Bot startup error: ${capturedOutput}`));
              return;
            }
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
    getOutput: () => capturedOutput,
  };
}

export function getApiDir(): string {
  return join(import.meta.dir, "..", "..");
}

export function getGatewayDir(): string {
  return join(import.meta.dir, "..", "..", "..", "gateway");
}
