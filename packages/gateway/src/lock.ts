/**
 * Gateway Lock
 *
 * Prevents multiple Gateway instances from running simultaneously.
 * Uses a lock file to track the running process.
 *
 * Lock file location: ~/.deca/run/gateway.lock
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_LOCK_DIR = path.join(os.homedir(), ".deca", "run");
const DEFAULT_LOCK_FILE = "gateway.lock";

export type LockPayload = {
  pid: number;
  createdAt: string;
  httpPort?: number;
  startTime?: number; // Linux process start time for PID recycling detection
};

export type GatewayLockHandle = {
  lockPath: string;
  release: () => Promise<void>;
};

export type GatewayLockOptions = {
  lockDir?: string;
  lockFile?: string;
  httpPort?: number;
  /** Allow multiple gateways (skip lock) */
  allowMultiple?: boolean;
  /** Force lock acquisition even in test environment */
  forceAcquire?: boolean;
};

export class GatewayLockError extends Error {
  public readonly existingProcess?: LockPayload;

  constructor(message: string, existingProcess?: LockPayload) {
    super(message);
    this.name = "GatewayLockError";
    this.existingProcess = existingProcess;
  }
}

/**
 * Check if a process with the given PID is alive
 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    // signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read Linux process start time from /proc/<pid>/stat
 * Used to detect PID recycling
 */
function readLinuxStartTime(pid: number): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const raw = fsSync.readFileSync(`/proc/${pid}/stat`, "utf8").trim();
    const closeParen = raw.lastIndexOf(")");
    if (closeParen < 0) {
      return null;
    }
    const rest = raw.slice(closeParen + 1).trim();
    const fields = rest.split(/\s+/);
    // Field 22 (0-indexed: 19 after the first 3 fields) is starttime
    const startTime = Number.parseInt(fields[19] ?? "", 10);
    return Number.isFinite(startTime) ? startTime : null;
  } catch {
    return null;
  }
}

/**
 * Read and parse lock file payload
 */
async function readLockPayload(lockPath: string): Promise<LockPayload | null> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockPayload>;

    if (typeof parsed.pid !== "number") {
      return null;
    }
    if (typeof parsed.createdAt !== "string") {
      return null;
    }

    return {
      pid: parsed.pid,
      createdAt: parsed.createdAt,
      httpPort:
        typeof parsed.httpPort === "number" ? parsed.httpPort : undefined,
      startTime:
        typeof parsed.startTime === "number" ? parsed.startTime : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Determine if the lock owner is still alive
 */
function isLockOwnerAlive(payload: LockPayload): boolean {
  if (!isProcessAlive(payload.pid)) {
    return false;
  }

  // On Linux, verify the process start time matches to detect PID recycling
  if (process.platform === "linux" && payload.startTime !== undefined) {
    const currentStartTime = readLinuxStartTime(payload.pid);
    if (currentStartTime !== null && currentStartTime !== payload.startTime) {
      // PID was recycled - the original process is dead
      return false;
    }
  }

  return true;
}

/**
 * Format lock error message with process details
 */
export function formatLockError(payload: LockPayload): string {
  const lines = [
    "Gateway is already running!",
    "",
    "Existing process:",
    `  PID: ${payload.pid}`,
    `  Started: ${payload.createdAt}`,
  ];

  if (payload.httpPort) {
    lines.push(`  HTTP Port: ${payload.httpPort}`);
  }

  lines.push("");
  lines.push("To stop the existing gateway:");
  lines.push(`  kill ${payload.pid}`);
  lines.push("");
  lines.push("Or to allow multiple gateways (not recommended):");
  lines.push("  DECA_ALLOW_MULTI_GATEWAY=1 bun run gateway");

  return lines.join("\n");
}

/**
 * Acquire a gateway lock
 *
 * @throws {GatewayLockError} if another gateway is already running
 * @returns Lock handle with release() method, or null if in test/multi mode
 */
export async function acquireGatewayLock(
  opts: GatewayLockOptions = {},
): Promise<GatewayLockHandle | null> {
  if (opts.allowMultiple || process.env.DECA_ALLOW_MULTI_GATEWAY === "1") {
    return null;
  }

  const isTestEnv = process.env.VITEST || process.env.NODE_ENV === "test";
  if (isTestEnv && !opts.forceAcquire) {
    return null;
  }

  const lockDir = opts.lockDir ?? DEFAULT_LOCK_DIR;
  const lockFile = opts.lockFile ?? DEFAULT_LOCK_FILE;
  const lockPath = path.join(lockDir, lockFile);

  // Ensure lock directory exists
  await fs.mkdir(lockDir, { recursive: true });

  // Check for existing lock
  const existingPayload = await readLockPayload(lockPath);

  if (existingPayload) {
    if (isLockOwnerAlive(existingPayload)) {
      // Another gateway is running
      throw new GatewayLockError(
        formatLockError(existingPayload),
        existingPayload,
      );
    }

    // Lock is stale (process dead), remove it
    await fs.rm(lockPath, { force: true });
  }

  // Create new lock file
  const startTime =
    process.platform === "linux" ? readLinuxStartTime(process.pid) : null;
  const payload: LockPayload = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    httpPort: opts.httpPort,
    ...(startTime !== null && { startTime }),
  };

  try {
    // Use 'wx' flag to fail if file exists (atomic creation)
    await fs.writeFile(lockPath, JSON.stringify(payload, null, 2), {
      flag: "wx",
    });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === "EEXIST") {
      // Race condition: another process created the lock
      const racePayload = await readLockPayload(lockPath);
      throw new GatewayLockError(
        racePayload
          ? formatLockError(racePayload)
          : "Gateway lock acquisition failed (race condition)",
        racePayload ?? undefined,
      );
    }
    throw err;
  }

  // Return handle with release function
  return {
    lockPath,
    release: async () => {
      await fs.rm(lockPath, { force: true });
    },
  };
}

/**
 * Check if another gateway is running without acquiring the lock
 * Useful for status checks
 */
export async function checkGatewayRunning(
  opts: { lockDir?: string; lockFile?: string } = {},
): Promise<LockPayload | null> {
  const lockDir = opts.lockDir ?? DEFAULT_LOCK_DIR;
  const lockFile = opts.lockFile ?? DEFAULT_LOCK_FILE;
  const lockPath = path.join(lockDir, lockFile);

  const payload = await readLockPayload(lockPath);
  if (payload && isLockOwnerAlive(payload)) {
    return payload;
  }

  return null;
}
