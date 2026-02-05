/**
 * Reconnection Manager
 *
 * Handles automatic reconnection with exponential backoff and jitter.
 */

/**
 * Reconnection configuration
 */
export interface ReconnectConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitterFactor?: number;
  /** Called on successful reconnect with attempt count */
  onReconnect?: (attempts: number) => void;
  /** Called when max retries exceeded */
  onMaxRetries?: (lastError: Error) => void;
}

/**
 * Default reconnection configuration
 */
export const DEFAULT_RECONNECT_CONFIG: Required<
  Omit<ReconnectConfig, "onReconnect" | "onMaxRetries">
> = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.1,
};

/**
 * Reconnection manager interface
 */
export interface ReconnectManager {
  /** Schedule a reconnection attempt */
  schedule(): void;
  /** Stop any pending reconnection */
  stop(): void;
  /** Whether a reconnection is pending */
  readonly isRunning: boolean;
  /** Current attempt count */
  readonly attempts: number;
}

/**
 * Create a reconnection manager.
 *
 * @param connect - Function to call for reconnection
 * @param config - Reconnection configuration
 * @returns Reconnection manager
 */
export function createReconnectManager(
  connect: () => Promise<void>,
  config?: ReconnectConfig,
): ReconnectManager {
  const maxRetries = config?.maxRetries ?? DEFAULT_RECONNECT_CONFIG.maxRetries;
  const baseDelayMs =
    config?.baseDelayMs ?? DEFAULT_RECONNECT_CONFIG.baseDelayMs;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_RECONNECT_CONFIG.maxDelayMs;
  const jitterFactor =
    config?.jitterFactor ?? DEFAULT_RECONNECT_CONFIG.jitterFactor;
  const onReconnect = config?.onReconnect;
  const onMaxRetries = config?.onMaxRetries;

  let attempts = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;

  /**
   * Calculate delay with exponential backoff and jitter.
   */
  function calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter: delay * (1 ± jitterFactor)
    const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);

    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  /**
   * Attempt reconnection.
   */
  async function attemptReconnect(): Promise<void> {
    attempts++;
    isRunning = true;

    try {
      await connect();

      // Success - reset state
      const successAttempts = attempts;
      attempts = 0;
      isRunning = false;
      timeoutId = null;

      onReconnect?.(successAttempts);
    } catch (error) {
      // Check if we've exceeded max retries
      if (attempts >= maxRetries) {
        isRunning = false;
        timeoutId = null;
        onMaxRetries?.(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }

      // Schedule next attempt
      const delay = calculateDelay(attempts);
      timeoutId = setTimeout(() => {
        attemptReconnect();
      }, delay);
    }
  }

  return {
    schedule(): void {
      // Don't schedule if already running
      if (isRunning) {
        return;
      }

      // Calculate initial delay
      const delay = calculateDelay(attempts + 1);

      isRunning = true;
      timeoutId = setTimeout(() => {
        attemptReconnect();
      }, delay);
    },

    stop(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      isRunning = false;
      attempts = 0;
    },

    get isRunning(): boolean {
      return isRunning;
    },

    get attempts(): number {
      return attempts;
    },
  };
}
