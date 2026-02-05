/**
 * Graceful Shutdown Manager
 *
 * Tracks pending tasks and waits for them to complete during shutdown.
 */

/**
 * Graceful shutdown configuration
 */
export interface GracefulShutdownConfig {
  /** Maximum time to wait for pending tasks in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Called when timeout is reached with pending task count */
  onTimeout?: (pendingCount: number) => void;
}

/**
 * Default configuration
 */
export const DEFAULT_SHUTDOWN_CONFIG = {
  timeoutMs: 30000,
};

/**
 * Graceful shutdown manager interface
 */
export interface GracefulShutdown {
  /** Track a new task, returns completion function */
  trackTask(): () => void;
  /** Wrap an async function with automatic tracking */
  wrapTask<T>(fn: () => Promise<T>): Promise<T | undefined>;
  /** Initiate shutdown, returns when all tasks complete or timeout */
  initiateShutdown(): Promise<void>;
  /** Reset shutdown state (for testing or restart) */
  reset(): void;
  /** Whether shutdown is in progress */
  readonly isShuttingDown: boolean;
  /** Number of pending tasks */
  readonly pendingCount: number;
}

/**
 * Create a graceful shutdown manager.
 *
 * @param config - Shutdown configuration
 * @returns Graceful shutdown manager
 */
export function createGracefulShutdown(
  config?: GracefulShutdownConfig,
): GracefulShutdown {
  const timeoutMs = config?.timeoutMs ?? DEFAULT_SHUTDOWN_CONFIG.timeoutMs;
  const onTimeout = config?.onTimeout;

  let pendingCount = 0;
  let isShuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  /**
   * Check if all tasks are complete and resolve shutdown if so.
   */
  function checkComplete(): void {
    if (isShuttingDown && pendingCount === 0 && resolveShutdown) {
      resolveShutdown();
    }
  }

  return {
    trackTask(): () => void {
      // Reject new tasks during shutdown
      if (isShuttingDown) {
        return () => {}; // Return noop
      }

      pendingCount++;

      let completed = false;
      return () => {
        if (completed) return; // Prevent double-completion
        completed = true;
        pendingCount--;
        checkComplete();
      };
    },

    async wrapTask<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (isShuttingDown) {
        return undefined;
      }

      const done = this.trackTask();

      try {
        return await fn();
      } finally {
        done();
      }
    },

    async initiateShutdown(): Promise<void> {
      if (shutdownPromise) {
        return shutdownPromise;
      }

      isShuttingDown = true;

      // If no pending tasks, resolve immediately
      if (pendingCount === 0) {
        return Promise.resolve();
      }

      // Create shutdown promise
      shutdownPromise = new Promise<void>((resolve) => {
        resolveShutdown = resolve;

        // Set up timeout
        setTimeout(() => {
          if (pendingCount > 0) {
            onTimeout?.(pendingCount);
            resolve();
          }
        }, timeoutMs);
      });

      return shutdownPromise;
    },

    reset(): void {
      pendingCount = 0;
      isShuttingDown = false;
      shutdownPromise = null;
      resolveShutdown = null;
    },

    get isShuttingDown(): boolean {
      return isShuttingDown;
    },

    get pendingCount(): number {
      return pendingCount;
    },
  };
}
