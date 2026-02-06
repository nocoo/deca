/**
 * Dispatcher Types
 *
 * Unified request dispatching and concurrency control layer.
 * All request sources (Discord, HTTP, Terminal, Cron, Heartbeat) flow through the Dispatcher.
 */

import type { MessageRequest, MessageResponse } from "../types";

/**
 * Request source identifier
 */
export type RequestSource =
  | "discord"
  | "http"
  | "terminal"
  | "cron"
  | "heartbeat";

/**
 * Extended message request with source and priority
 */
export interface DispatchRequest extends MessageRequest {
  /** Request source */
  source: RequestSource;

  /** Priority (higher number = higher priority, default: 0) */
  priority?: number;

  /** Request ID for tracking and deduplication */
  requestId?: string;
}

/**
 * Dispatcher configuration
 */
export interface DispatcherConfig {
  /** Maximum concurrency (default: 1, serial execution) */
  concurrency?: number;

  /** Per-request timeout in milliseconds (default: no limit) */
  timeout?: number;

  /** Request handler (typically Agent adapter) */
  handler: DispatchHandler;

  /** Event callbacks */
  events?: DispatcherEvents;
}

/**
 * Request handler interface (compatible with MessageHandler)
 */
export interface DispatchHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Dispatcher event callbacks
 */
export interface DispatcherEvents {
  /** Triggered when request is enqueued */
  onEnqueue?: (request: DispatchRequest) => void;

  /** Triggered when request starts executing */
  onActive?: (request: DispatchRequest) => void;

  /** Triggered when request completes successfully */
  onComplete?: (request: DispatchRequest, response: MessageResponse) => void;

  /** Triggered when request fails */
  onError?: (request: DispatchRequest, error: Error) => void;

  /** Triggered when queue becomes idle */
  onIdle?: () => void;
}

/**
 * Dispatcher status
 */
export interface DispatcherStatus {
  /** Number of requests waiting in queue */
  queued: number;

  /** Number of requests currently executing */
  running: number;

  /** Maximum concurrency */
  concurrency: number;

  /** Whether queue is paused */
  isPaused: boolean;
}

/**
 * Dispatcher interface
 */
export interface Dispatcher {
  /**
   * Dispatch a request to the queue
   * @returns Promise that resolves when request completes
   */
  dispatch(request: DispatchRequest): Promise<MessageResponse>;

  /**
   * Get current dispatcher status
   */
  getStatus(): DispatcherStatus;

  /**
   * Pause queue processing
   */
  pause(): void;

  /**
   * Resume queue processing
   */
  resume(): void;

  /**
   * Clear all queued requests (does not affect running requests)
   */
  clear(): void;

  /**
   * Wait for queue to become idle
   */
  onIdle(): Promise<void>;

  /**
   * Shutdown the dispatcher
   */
  shutdown(): Promise<void>;
}
