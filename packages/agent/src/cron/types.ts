/**
 * Cron Types - Minimal type definitions for scheduled tasks
 *
 * Design: Keep it simple - 3 schedule types, 1 job type, 1 config type
 */

/**
 * Schedule configuration - discriminated union with 3 kinds
 *
 * - "at": One-time execution at absolute timestamp
 * - "every": Recurring execution at fixed interval
 * - "cron": Standard cron expression (e.g., "0 9 * * *")
 */
export type CronSchedule =
  | { kind: "at"; atMs: number } // Absolute timestamp in milliseconds
  | { kind: "every"; everyMs: number } // Interval in milliseconds
  | { kind: "cron"; expr: string }; // Cron expression

/**
 * Cron job definition
 */
export interface CronJob {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Natural language instruction for the agent */
  instruction: string;

  /** Schedule configuration */
  schedule: CronSchedule;

  /** Whether this job is active */
  enabled: boolean;

  /** Next scheduled run time (milliseconds since epoch) */
  nextRunAtMs?: number;

  /** Last run time (milliseconds since epoch) */
  lastRunAtMs?: number;

  /** Creation time (milliseconds since epoch) */
  createdAtMs: number;
}

/**
 * Callback invoked when a job triggers
 */
export type CronTriggerCallback = (job: CronJob) => Promise<void>;

/**
 * CronService configuration
 */
export interface CronServiceConfig {
  /** JSON file path for persistence (default: ~/.deca/cron.json) */
  storagePath?: string;

  /** Callback when a job triggers (optional - can be set later via setOnTrigger) */
  onTrigger?: CronTriggerCallback;
}

/**
 * Input type for creating a new job (without auto-generated fields)
 */
export type CronJobInput = Omit<CronJob, "id" | "createdAtMs" | "nextRunAtMs">;
