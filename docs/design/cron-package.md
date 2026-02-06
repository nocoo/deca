# @deca/cron - Design Document

> Cron job scheduler package for Deca AI Agent system

## Overview

`@deca/cron` is an independent package that provides scheduled task execution capabilities for the Deca ecosystem. It exposes functionality through an LLM Tool interface, allowing AI agents to create, manage, and execute scheduled tasks.

**Key Principles:**
- **Independent Package** - Standalone with minimal dependencies
- **Tool-First Design** - Primary interface is an LLM Tool
- **SQLite Persistence** - Uses @deca/storage patterns
- **Type-Safe** - Full TypeScript with strict mode

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      @deca/gateway                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     @deca/agent                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │                   Tool System                       │││
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ │││
│  │  │  │  read   │ │  exec   │ │  ...    │ │  cron     │ │││
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┬─┘ │││
│  │  └─────────────────────────────────────────────────┼───┘││
│  └────────────────────────────────────────────────────┼────┘│
└───────────────────────────────────────────────────────┼─────┘
                                                        │
┌───────────────────────────────────────────────────────▼─────┐
│                       @deca/cron                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    CronService                          ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ ││
│  │  │  Scheduler  │  │   Storage   │  │  Job Executor   │ ││
│  │  │  (croner)   │  │  (SQLite)   │  │  (Callback)     │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     cronTool                            ││
│  │  Actions: status | list | add | update | remove | run  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
packages/cron/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # Core type definitions
│   │
│   ├── service/              # CronService implementation
│   │   ├── index.ts          # Re-exports
│   │   ├── service.ts        # Main CronService class
│   │   ├── service.test.ts   # Unit tests
│   │   ├── scheduler.ts      # Cron expression parsing & scheduling
│   │   ├── scheduler.test.ts
│   │   ├── storage.ts        # SQLite persistence layer
│   │   └── storage.test.ts
│   │
│   ├── tool/                 # LLM Tool interface
│   │   ├── index.ts
│   │   ├── cron-tool.ts      # Tool definition
│   │   └── cron-tool.test.ts
│   │
│   └── e2e/                  # End-to-end tests
│       ├── scheduler.e2e.ts  # Real scheduling tests
│       └── tool.e2e.ts       # Tool integration tests
```

---

## Type Definitions

### Core Types

```typescript
// src/types.ts

/**
 * Schedule type enumeration
 */
export type ScheduleType = "at" | "every" | "cron";

/**
 * Job execution mode
 */
export type ExecutionMode = "main" | "isolated";

/**
 * Job status
 */
export type JobStatus = "active" | "paused" | "completed" | "failed";

/**
 * Schedule configuration - union type for different schedule types
 */
export type CronSchedule =
  | { type: "at"; time: string }        // ISO 8601 datetime
  | { type: "every"; interval: string } // Duration string (e.g., "5m", "1h")
  | { type: "cron"; expression: string; timezone?: string };

/**
 * Job payload - what the agent should do when triggered
 */
export interface CronPayload {
  /**
   * Natural language instruction for the agent
   */
  instruction: string;
  
  /**
   * Optional context to include
   */
  context?: Record<string, unknown>;
}

/**
 * Cron job definition
 */
export interface CronJob {
  id: string;
  name: string;
  schedule: CronSchedule;
  payload: CronPayload;
  mode: ExecutionMode;
  status: JobStatus;
  
  // Metadata
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  nextRunAt?: string;  // ISO 8601, calculated
  lastRunAt?: string;  // ISO 8601
  runCount: number;
  
  // Optional fields
  description?: string;
  maxRuns?: number;    // Auto-complete after N runs
  expiresAt?: string;  // Auto-delete after this time
}

/**
 * Job run history record
 */
export interface CronJobRun {
  id: string;
  jobId: string;
  triggeredAt: string;
  completedAt?: string;
  status: "pending" | "running" | "success" | "failed";
  result?: string;
  error?: string;
}

/**
 * Callback invoked when a job triggers
 */
export type JobTriggerCallback = (job: CronJob) => Promise<void>;

/**
 * CronService configuration
 */
export interface CronServiceConfig {
  /**
   * SQLite database path (defaults to ~/.deca/cron.db)
   */
  dbPath?: string;
  
  /**
   * Callback when a job triggers
   */
  onJobTrigger: JobTriggerCallback;
  
  /**
   * Check interval for missed jobs (default: 60000ms)
   */
  checkInterval?: number;
}
```

### Tool Types

```typescript
// src/tool/types.ts

export type CronToolAction =
  | "status"   // Get scheduler status
  | "list"     // List all jobs
  | "add"      // Create new job
  | "update"   // Modify existing job
  | "remove"   // Delete a job
  | "run"      // Manually trigger a job
  | "pause"    // Pause a job
  | "resume";  // Resume a paused job

export interface CronToolInput {
  action: CronToolAction;
  
  // For add/update
  name?: string;
  schedule?: CronSchedule;
  payload?: CronPayload;
  mode?: ExecutionMode;
  description?: string;
  maxRuns?: number;
  expiresAt?: string;
  
  // For update/remove/run/pause/resume
  jobId?: string;
  
  // For list
  status?: JobStatus;
  limit?: number;
}

export interface CronToolContext {
  cronService: CronService;
  sessionKey: string;
}
```

---

## Service Implementation

### CronService

```typescript
// src/service/service.ts

import { Cron } from "croner";
import type { CronJob, CronServiceConfig, CronSchedule } from "../types";

export class CronService {
  private db: CronStorage;
  private schedulers: Map<string, Cron> = new Map();
  private config: CronServiceConfig;
  
  constructor(config: CronServiceConfig) {
    this.config = config;
    this.db = new CronStorage(config.dbPath);
  }
  
  /**
   * Initialize service - load jobs from storage and start schedulers
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
    const jobs = await this.db.listJobs({ status: "active" });
    for (const job of jobs) {
      this.scheduleJob(job);
    }
  }
  
  /**
   * Shutdown service - stop all schedulers
   */
  async shutdown(): Promise<void> {
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop();
    }
    this.schedulers.clear();
    await this.db.close();
  }
  
  /**
   * Add a new cron job
   */
  async addJob(job: Omit<CronJob, "id" | "createdAt" | "updatedAt" | "runCount">): Promise<CronJob> {
    const newJob = await this.db.createJob(job);
    if (newJob.status === "active") {
      this.scheduleJob(newJob);
    }
    return newJob;
  }
  
  /**
   * Update an existing job
   */
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob> {
    // Stop existing scheduler
    this.unscheduleJob(jobId);
    
    // Update in storage
    const updated = await this.db.updateJob(jobId, updates);
    
    // Restart scheduler if active
    if (updated.status === "active") {
      this.scheduleJob(updated);
    }
    
    return updated;
  }
  
  /**
   * Remove a job
   */
  async removeJob(jobId: string): Promise<void> {
    this.unscheduleJob(jobId);
    await this.db.deleteJob(jobId);
  }
  
  /**
   * List jobs with optional filters
   */
  async listJobs(filter?: { status?: JobStatus; limit?: number }): Promise<CronJob[]> {
    return this.db.listJobs(filter);
  }
  
  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    return this.db.getJob(jobId);
  }
  
  /**
   * Manually trigger a job
   */
  async runJob(jobId: string): Promise<void> {
    const job = await this.db.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    await this.triggerJob(job);
  }
  
  /**
   * Pause a job
   */
  async pauseJob(jobId: string): Promise<CronJob> {
    this.unscheduleJob(jobId);
    return this.db.updateJob(jobId, { status: "paused" });
  }
  
  /**
   * Resume a paused job
   */
  async resumeJob(jobId: string): Promise<CronJob> {
    const job = await this.db.updateJob(jobId, { status: "active" });
    this.scheduleJob(job);
    return job;
  }
  
  /**
   * Get scheduler status
   */
  getStatus(): { activeJobs: number; schedulers: number } {
    return {
      activeJobs: this.schedulers.size,
      schedulers: this.schedulers.size,
    };
  }
  
  // --- Private Methods ---
  
  private scheduleJob(job: CronJob): void {
    const cronExpr = this.toCronExpression(job.schedule);
    const timezone = job.schedule.type === "cron" ? job.schedule.timezone : undefined;
    
    const scheduler = new Cron(cronExpr, { timezone }, async () => {
      await this.triggerJob(job);
    });
    
    this.schedulers.set(job.id, scheduler);
  }
  
  private unscheduleJob(jobId: string): void {
    const scheduler = this.schedulers.get(jobId);
    if (scheduler) {
      scheduler.stop();
      this.schedulers.delete(jobId);
    }
  }
  
  private async triggerJob(job: CronJob): Promise<void> {
    // Update last run time
    await this.db.updateJob(job.id, {
      lastRunAt: new Date().toISOString(),
      runCount: job.runCount + 1,
    });
    
    // Record run history
    const run = await this.db.createRun({
      jobId: job.id,
      triggeredAt: new Date().toISOString(),
      status: "pending",
    });
    
    try {
      // Invoke callback
      await this.config.onJobTrigger(job);
      await this.db.updateRun(run.id, { status: "success", completedAt: new Date().toISOString() });
    } catch (error) {
      await this.db.updateRun(run.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
    }
    
    // Check if job should complete
    if (job.maxRuns && job.runCount + 1 >= job.maxRuns) {
      await this.updateJob(job.id, { status: "completed" });
    }
  }
  
  private toCronExpression(schedule: CronSchedule): string {
    switch (schedule.type) {
      case "at":
        return this.dateToCron(schedule.time);
      case "every":
        return this.intervalToCron(schedule.interval);
      case "cron":
        return schedule.expression;
    }
  }
  
  private dateToCron(isoDate: string): string {
    const d = new Date(isoDate);
    return `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
  }
  
  private intervalToCron(interval: string): string {
    // Parse interval like "5m", "1h", "30s"
    const match = interval.match(/^(\d+)(s|m|h|d)$/);
    if (!match) throw new Error(`Invalid interval: ${interval}`);
    
    const [, value, unit] = match;
    const num = parseInt(value, 10);
    
    switch (unit) {
      case "s": return `*/${num} * * * * *`;  // Every N seconds
      case "m": return `*/${num} * * * *`;    // Every N minutes
      case "h": return `0 */${num} * * *`;    // Every N hours
      case "d": return `0 0 */${num} * *`;    // Every N days
      default: throw new Error(`Unknown unit: ${unit}`);
    }
  }
}
```

### Storage Layer

```typescript
// src/service/storage.ts

import { Database } from "bun:sqlite";
import type { CronJob, CronJobRun, JobStatus } from "../types";

export class CronStorage {
  private db: Database;
  
  constructor(dbPath: string = "~/.deca/cron.db") {
    const expandedPath = dbPath.replace("~", Bun.env.HOME || "");
    this.db = new Database(expandedPath, { create: true });
  }
  
  async initialize(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,       -- JSON
        payload TEXT NOT NULL,        -- JSON
        mode TEXT NOT NULL DEFAULT 'main',
        status TEXT NOT NULL DEFAULT 'active',
        description TEXT,
        max_runs INTEGER,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        next_run_at TEXT,
        last_run_at TEXT,
        run_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cron_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT,
        FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
      )
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_runs_job_id ON cron_runs(job_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON cron_jobs(status)`);
  }
  
  async close(): Promise<void> {
    this.db.close();
  }
  
  async createJob(job: Omit<CronJob, "id" | "createdAt" | "updatedAt" | "runCount">): Promise<CronJob> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    this.db.run(`
      INSERT INTO cron_jobs (id, name, schedule, payload, mode, status, description, max_runs, expires_at, created_at, updated_at, run_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      id,
      job.name,
      JSON.stringify(job.schedule),
      JSON.stringify(job.payload),
      job.mode,
      job.status,
      job.description || null,
      job.maxRuns || null,
      job.expiresAt || null,
      now,
      now,
    ]);
    
    return this.getJob(id) as Promise<CronJob>;
  }
  
  async getJob(id: string): Promise<CronJob | null> {
    const row = this.db.query(`SELECT * FROM cron_jobs WHERE id = ?`).get(id);
    return row ? this.rowToJob(row) : null;
  }
  
  async listJobs(filter?: { status?: JobStatus; limit?: number }): Promise<CronJob[]> {
    let sql = "SELECT * FROM cron_jobs";
    const params: unknown[] = [];
    
    if (filter?.status) {
      sql += " WHERE status = ?";
      params.push(filter.status);
    }
    
    sql += " ORDER BY created_at DESC";
    
    if (filter?.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }
    
    const rows = this.db.query(sql).all(...params);
    return rows.map(this.rowToJob);
  }
  
  async updateJob(id: string, updates: Partial<CronJob>): Promise<CronJob> {
    const sets: string[] = [];
    const params: unknown[] = [];
    
    if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
    if (updates.schedule !== undefined) { sets.push("schedule = ?"); params.push(JSON.stringify(updates.schedule)); }
    if (updates.payload !== undefined) { sets.push("payload = ?"); params.push(JSON.stringify(updates.payload)); }
    if (updates.mode !== undefined) { sets.push("mode = ?"); params.push(updates.mode); }
    if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
    if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
    if (updates.lastRunAt !== undefined) { sets.push("last_run_at = ?"); params.push(updates.lastRunAt); }
    if (updates.runCount !== undefined) { sets.push("run_count = ?"); params.push(updates.runCount); }
    
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);
    
    this.db.run(`UPDATE cron_jobs SET ${sets.join(", ")} WHERE id = ?`, params);
    return this.getJob(id) as Promise<CronJob>;
  }
  
  async deleteJob(id: string): Promise<void> {
    this.db.run("DELETE FROM cron_jobs WHERE id = ?", [id]);
  }
  
  async createRun(run: Omit<CronJobRun, "id">): Promise<CronJobRun> {
    const id = crypto.randomUUID();
    this.db.run(`
      INSERT INTO cron_runs (id, job_id, triggered_at, status)
      VALUES (?, ?, ?, ?)
    `, [id, run.jobId, run.triggeredAt, run.status]);
    return { id, ...run };
  }
  
  async updateRun(id: string, updates: Partial<CronJobRun>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    
    if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
    if (updates.completedAt !== undefined) { sets.push("completed_at = ?"); params.push(updates.completedAt); }
    if (updates.result !== undefined) { sets.push("result = ?"); params.push(updates.result); }
    if (updates.error !== undefined) { sets.push("error = ?"); params.push(updates.error); }
    
    params.push(id);
    this.db.run(`UPDATE cron_runs SET ${sets.join(", ")} WHERE id = ?`, params);
  }
  
  async listRuns(jobId: string, limit = 10): Promise<CronJobRun[]> {
    const rows = this.db.query(`
      SELECT * FROM cron_runs WHERE job_id = ? ORDER BY triggered_at DESC LIMIT ?
    `).all(jobId, limit);
    return rows.map(this.rowToRun);
  }
  
  private rowToJob(row: Record<string, unknown>): CronJob {
    return {
      id: row.id as string,
      name: row.name as string,
      schedule: JSON.parse(row.schedule as string),
      payload: JSON.parse(row.payload as string),
      mode: row.mode as CronJob["mode"],
      status: row.status as CronJob["status"],
      description: row.description as string | undefined,
      maxRuns: row.max_runs as number | undefined,
      expiresAt: row.expires_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      nextRunAt: row.next_run_at as string | undefined,
      lastRunAt: row.last_run_at as string | undefined,
      runCount: row.run_count as number,
    };
  }
  
  private rowToRun(row: Record<string, unknown>): CronJobRun {
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      triggeredAt: row.triggered_at as string,
      completedAt: row.completed_at as string | undefined,
      status: row.status as CronJobRun["status"],
      result: row.result as string | undefined,
      error: row.error as string | undefined,
    };
  }
}
```

---

## Tool Definition

```typescript
// src/tool/cron-tool.ts

import type { Tool, ToolContext } from "@deca/agent";
import type { CronService } from "../service";
import type { CronToolInput, CronSchedule, CronPayload } from "../types";

/**
 * Extended tool context with CronService
 */
export interface CronToolContext extends ToolContext {
  cronService: CronService;
}

/**
 * Create the cron tool with injected service
 */
export function createCronTool(cronService: CronService): Tool<CronToolInput> {
  return {
    name: "cron",
    
    description: `Manage scheduled tasks that run automatically at specified times.

Actions:
- status: Get scheduler status (active jobs count)
- list: List all scheduled jobs (optional: filter by status, limit results)
- add: Create a new scheduled job
- update: Modify an existing job
- remove: Delete a job
- run: Manually trigger a job immediately
- pause: Pause a job (stops scheduling)
- resume: Resume a paused job

Schedule Types:
- "at": One-time execution at a specific datetime (ISO 8601)
- "every": Recurring execution at intervals (e.g., "5m", "1h", "1d")
- "cron": Standard cron expression with optional timezone

Examples:
- Add daily reminder: { action: "add", name: "daily-report", schedule: { type: "every", interval: "24h" }, payload: { instruction: "Generate daily report" } }
- Add specific time: { action: "add", name: "meeting-prep", schedule: { type: "at", time: "2026-02-07T09:00:00Z" }, payload: { instruction: "Prepare meeting notes" } }
- Add cron job: { action: "add", name: "weekly-backup", schedule: { type: "cron", expression: "0 2 * * 0", timezone: "America/Los_Angeles" }, payload: { instruction: "Run weekly backup" } }`,

    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "list", "add", "update", "remove", "run", "pause", "resume"],
          description: "The action to perform",
        },
        jobId: {
          type: "string",
          description: "Job ID (required for update, remove, run, pause, resume)",
        },
        name: {
          type: "string",
          description: "Job name (required for add)",
        },
        schedule: {
          type: "object",
          description: "Schedule configuration",
          properties: {
            type: { type: "string", enum: ["at", "every", "cron"] },
            time: { type: "string", description: "ISO 8601 datetime (for 'at' type)" },
            interval: { type: "string", description: "Interval string like '5m', '1h' (for 'every' type)" },
            expression: { type: "string", description: "Cron expression (for 'cron' type)" },
            timezone: { type: "string", description: "Timezone (for 'cron' type)" },
          },
        },
        payload: {
          type: "object",
          description: "Job payload",
          properties: {
            instruction: { type: "string", description: "What the agent should do" },
            context: { type: "object", description: "Additional context data" },
          },
          required: ["instruction"],
        },
        mode: {
          type: "string",
          enum: ["main", "isolated"],
          description: "Execution mode: 'main' injects into current session, 'isolated' runs in new session",
        },
        description: {
          type: "string",
          description: "Optional job description",
        },
        maxRuns: {
          type: "number",
          description: "Maximum number of runs before auto-completing",
        },
        expiresAt: {
          type: "string",
          description: "ISO 8601 datetime when job should be deleted",
        },
        status: {
          type: "string",
          enum: ["active", "paused", "completed", "failed"],
          description: "Filter jobs by status (for list action)",
        },
        limit: {
          type: "number",
          description: "Maximum number of jobs to return (for list action)",
        },
      },
      required: ["action"],
    },

    async execute(input: CronToolInput, ctx: ToolContext): Promise<string> {
      try {
        switch (input.action) {
          case "status":
            return handleStatus(cronService);
          
          case "list":
            return handleList(cronService, input);
          
          case "add":
            return handleAdd(cronService, input);
          
          case "update":
            return handleUpdate(cronService, input);
          
          case "remove":
            return handleRemove(cronService, input);
          
          case "run":
            return handleRun(cronService, input);
          
          case "pause":
            return handlePause(cronService, input);
          
          case "resume":
            return handleResume(cronService, input);
          
          default:
            return `Unknown action: ${input.action}`;
        }
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

// --- Action Handlers ---

async function handleStatus(service: CronService): Promise<string> {
  const status = service.getStatus();
  return `Cron Scheduler Status:
- Active Jobs: ${status.activeJobs}
- Running Schedulers: ${status.schedulers}`;
}

async function handleList(service: CronService, input: CronToolInput): Promise<string> {
  const jobs = await service.listJobs({
    status: input.status,
    limit: input.limit,
  });
  
  if (jobs.length === 0) {
    return "No scheduled jobs found.";
  }
  
  const lines = jobs.map(job => {
    const scheduleStr = formatSchedule(job.schedule);
    return `- ${job.name} (${job.id})
  Status: ${job.status}
  Schedule: ${scheduleStr}
  Runs: ${job.runCount}${job.lastRunAt ? ` (last: ${job.lastRunAt})` : ""}`;
  });
  
  return `Scheduled Jobs (${jobs.length}):\n${lines.join("\n\n")}`;
}

async function handleAdd(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.name) return "Error: 'name' is required for add action";
  if (!input.schedule) return "Error: 'schedule' is required for add action";
  if (!input.payload) return "Error: 'payload' is required for add action";
  
  const job = await service.addJob({
    name: input.name,
    schedule: input.schedule as CronSchedule,
    payload: input.payload as CronPayload,
    mode: input.mode || "main",
    status: "active",
    description: input.description,
    maxRuns: input.maxRuns,
    expiresAt: input.expiresAt,
  });
  
  return `Job created successfully:
- ID: ${job.id}
- Name: ${job.name}
- Schedule: ${formatSchedule(job.schedule)}
- Mode: ${job.mode}`;
}

async function handleUpdate(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.jobId) return "Error: 'jobId' is required for update action";
  
  const updates: Record<string, unknown> = {};
  if (input.name) updates.name = input.name;
  if (input.schedule) updates.schedule = input.schedule;
  if (input.payload) updates.payload = input.payload;
  if (input.mode) updates.mode = input.mode;
  if (input.description !== undefined) updates.description = input.description;
  
  const job = await service.updateJob(input.jobId, updates);
  return `Job updated: ${job.name} (${job.id})`;
}

async function handleRemove(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.jobId) return "Error: 'jobId' is required for remove action";
  
  await service.removeJob(input.jobId);
  return `Job removed: ${input.jobId}`;
}

async function handleRun(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.jobId) return "Error: 'jobId' is required for run action";
  
  await service.runJob(input.jobId);
  return `Job triggered: ${input.jobId}`;
}

async function handlePause(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.jobId) return "Error: 'jobId' is required for pause action";
  
  const job = await service.pauseJob(input.jobId);
  return `Job paused: ${job.name} (${job.id})`;
}

async function handleResume(service: CronService, input: CronToolInput): Promise<string> {
  if (!input.jobId) return "Error: 'jobId' is required for resume action";
  
  const job = await service.resumeJob(input.jobId);
  return `Job resumed: ${job.name} (${job.id})`;
}

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.type) {
    case "at":
      return `at ${schedule.time}`;
    case "every":
      return `every ${schedule.interval}`;
    case "cron":
      return `${schedule.expression}${schedule.timezone ? ` (${schedule.timezone})` : ""}`;
  }
}
```

---

## Gateway Integration

### Option 1: Register in Agent's builtinTools (Recommended)

```typescript
// packages/agent/src/tools/builtin.ts

import { createCronTool } from "@deca/cron";

// CronService needs to be injected at runtime
export function createBuiltinTools(cronService?: CronService): Tool[] {
  const tools = [readTool, writeTool, editTool, execTool, listTool, grepTool, ...];
  
  if (cronService) {
    tools.push(createCronTool(cronService));
  }
  
  return tools;
}
```

### Option 2: Inject via Gateway Adapter

```typescript
// packages/gateway/src/adapter.ts

import { CronService, createCronTool } from "@deca/cron";

export function createAgentAdapter(config: AgentAdapterConfig): AgentAdapter {
  // Initialize CronService
  const cronService = new CronService({
    dbPath: config.cronDbPath,
    onJobTrigger: async (job) => {
      // Inject job instruction into agent session
      await agent.enqueueSystemMessage(job.payload.instruction);
    },
  });
  
  const agentConfig: AgentConfig = {
    apiKey: config.apiKey,
    model: config.model,
    tools: [
      ...builtinTools,
      createCronTool(cronService),
    ],
  };
  
  const agent = new Agent(agentConfig);
  
  // Initialize cron service
  cronService.initialize();
  
  return { 
    agent, 
    cronService,
    async handle(request) { ... },
    async shutdown() {
      await cronService.shutdown();
    }
  };
}
```

---

## Atomic Commit Plan

### Phase 1: Package Scaffolding (1 commit)

```
feat(cron): scaffold @deca/cron package

- Create packages/cron/ directory structure
- Add package.json with dependencies
- Add tsconfig.json
- Add empty src/index.ts
```

### Phase 2: Type Definitions (1 commit)

```
feat(cron): add core type definitions

- Add CronSchedule, CronJob, CronJobRun types
- Add CronServiceConfig, JobTriggerCallback
- Add CronToolAction, CronToolInput types
- Export all types from index.ts
```

### Phase 3: Storage Layer (2 commits)

```
feat(cron): implement CronStorage class

- Create SQLite schema for jobs and runs
- Implement CRUD operations for jobs
- Implement run history tracking
- Add storage.test.ts with unit tests
```

```
test(cron): add storage layer tests

- Test job creation, update, delete
- Test run history recording
- Test filtering and pagination
```

### Phase 4: Scheduler (2 commits)

```
feat(cron): implement schedule parsing

- Add dateToCron, intervalToCron helpers
- Integrate croner library
- Add scheduler.test.ts
```

```
feat(cron): implement CronService class

- Initialize/shutdown lifecycle
- Job scheduling with croner
- Trigger callback invocation
- Add service.test.ts
```

### Phase 5: Tool Definition (2 commits)

```
feat(cron): implement cron tool

- Define tool schema with all actions
- Implement action handlers
- Add cron-tool.test.ts
```

```
test(cron): add tool integration tests

- Test each action with mock service
- Test error handling
- Test input validation
```

### Phase 6: Gateway Integration (2 commits)

```
feat(gateway): integrate CronService

- Add cronService to AgentAdapter
- Initialize on startup, shutdown on exit
- Wire up onJobTrigger callback
```

```
feat(agent): add cron tool to builtin tools

- Export createCronTool from @deca/cron
- Conditionally include based on config
- Update docs/07-agent-tools.md
```

### Phase 7: E2E Tests (1 commit)

```
test(cron): add e2e tests

- Test real scheduling with short intervals
- Test job persistence across restarts
- Test LLM tool invocation
```

### Phase 8: Documentation (1 commit)

```
docs(cron): add package documentation

- Create docs/modules/cron.md
- Update AGENTS.md with cron package
- Add usage examples
```

---

## Test Strategy

### Unit Tests (90%+ coverage target)

| File | Test Focus |
|------|------------|
| `storage.test.ts` | CRUD operations, filtering, pagination |
| `scheduler.test.ts` | Schedule parsing, cron expression generation |
| `service.test.ts` | Job lifecycle, trigger callbacks (mocked timer) |
| `cron-tool.test.ts` | Action handlers, input validation, error cases |

### Integration Tests

```typescript
// src/service/service.test.ts

describe("CronService", () => {
  let service: CronService;
  let triggerSpy: jest.Mock;
  
  beforeEach(async () => {
    triggerSpy = jest.fn();
    service = new CronService({
      dbPath: ":memory:",
      onJobTrigger: triggerSpy,
    });
    await service.initialize();
  });
  
  afterEach(async () => {
    await service.shutdown();
  });
  
  it("should create and list jobs", async () => {
    const job = await service.addJob({
      name: "test-job",
      schedule: { type: "every", interval: "1h" },
      payload: { instruction: "Do something" },
      mode: "main",
      status: "active",
    });
    
    const jobs = await service.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe("test-job");
  });
  
  it("should trigger job on schedule", async () => {
    // Use fake timers
    jest.useFakeTimers();
    
    await service.addJob({
      name: "fast-job",
      schedule: { type: "every", interval: "1s" },
      payload: { instruction: "Quick task" },
      mode: "main",
      status: "active",
    });
    
    // Advance time
    jest.advanceTimersByTime(1500);
    
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });
});
```

### E2E Tests

```typescript
// src/e2e/scheduler.e2e.ts

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CronService } from "../service";

describe("CronService E2E", () => {
  let service: CronService;
  const triggers: string[] = [];
  
  beforeAll(async () => {
    service = new CronService({
      dbPath: "/tmp/cron-test.db",
      onJobTrigger: async (job) => {
        triggers.push(job.id);
      },
    });
    await service.initialize();
  });
  
  afterAll(async () => {
    await service.shutdown();
    // Clean up test db
    await Bun.file("/tmp/cron-test.db").unlink();
  });
  
  it("should execute job at scheduled time", async () => {
    // Add job that runs in 2 seconds
    const runAt = new Date(Date.now() + 2000).toISOString();
    const job = await service.addJob({
      name: "e2e-test",
      schedule: { type: "at", time: runAt },
      payload: { instruction: "E2E test" },
      mode: "main",
      status: "active",
    });
    
    // Wait for execution
    await Bun.sleep(3000);
    
    expect(triggers).toContain(job.id);
  });
});
```

---

## Dependencies

```json
{
  "dependencies": {
    "croner": "^8.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@biomejs/biome": "1.8.3"
  },
  "peerDependencies": {
    "@deca/agent": "workspace:*"
  }
}
```

---

## Open Questions

1. **Execution Mode Implementation**: How should `isolated` mode work?
   - Option A: Spawn new Agent instance
   - Option B: Use `sessions_spawn` tool internally
   - Option C: Defer to Gateway's session management

2. **Heartbeat Integration**: Should we implement OpenClaw-style heartbeat?
   - Pros: Request merging, smoother scheduling
   - Cons: Additional complexity, may not be needed for v1

3. **Job Payload Enrichment**: What context should be included when triggering?
   - Current session state?
   - Memory search results?
   - Just the instruction?

---

## Next Steps

1. Review this design document
2. Clarify open questions
3. Begin implementation following commit plan
4. Add to gateway behavioral tests
