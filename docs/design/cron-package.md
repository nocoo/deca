# @deca/cron - Simplified Design

> Lightweight cron scheduler for Deca AI Agent - Simple, File-based, Enough

## Overview

Cron functionality is integrated into `@deca/agent` (not a separate package). It provides scheduled task execution through:

1. **CronService** - Single setTimeout scheduler with JSON file persistence
2. **cronTool** - LLM Tool interface (part of builtinTools)
3. **HeartbeatManager integration** - Uses existing `WakeReason = "cron"` mechanism

**Design Philosophy: "Enough is enough"** - Inspired by OpenClaw's minimal implementation.

---

## Architecture

```
Gateway Process
└── Agent
    ├── HeartbeatManager (existing)
    │   └── requestNow("cron", source)  ← trigger point
    │
    └── CronService (new)
        ├── Storage: ~/.deca/cron.json
        ├── Scheduler: Single setTimeout (tracks next trigger only)
        └── On trigger → HeartbeatManager.requestNow("cron")

Tool System
└── builtinTools
    └── cronTool (actions: status, list, add, remove, run)
```

### Key Simplifications (vs Original Design)

| Aspect | Original (Over-engineered) | Simplified |
|--------|---------------------------|------------|
| Storage | SQLite + 2 tables | **JSON file** |
| Scheduler | One croner instance per job | **Single setTimeout** |
| Types | 12+ type definitions | **3 core types** |
| Tool actions | 8 actions | **5 actions** |
| Run history | CronJobRun table | **None** (logs suffice) |
| Package | Separate @deca/cron | **Inside @deca/agent** |

---

## File Structure

```
packages/agent/src/
├── cron/
│   ├── index.ts              # Public exports
│   ├── types.ts              # CronSchedule, CronJob
│   ├── service.ts            # CronService class
│   ├── service.test.ts
│   ├── tool.ts               # cronTool definition
│   └── tool.test.ts
│
├── heartbeat/
│   └── manager.ts            # Existing - WakeReason = "cron"
│
└── tools/
    └── builtin.ts            # Add cronTool to builtinTools
```

---

## Type Definitions

```typescript
// packages/agent/src/cron/types.ts

/**
 * Schedule configuration - 3 types only
 */
export type CronSchedule =
  | { kind: "at"; atMs: number }        // One-time: absolute timestamp
  | { kind: "every"; everyMs: number }  // Interval: milliseconds
  | { kind: "cron"; expr: string };     // Cron expression: "0 9 * * *"

/**
 * Cron job definition - minimal fields
 */
export interface CronJob {
  id: string;
  name: string;
  instruction: string;     // What Agent should do when triggered
  schedule: CronSchedule;
  enabled: boolean;
  nextRunAtMs?: number;    // Calculated, not persisted for "every"
  lastRunAtMs?: number;
  createdAtMs: number;
}

/**
 * Callback when job triggers
 */
export type CronTriggerCallback = (job: CronJob) => Promise<void>;

/**
 * CronService configuration
 */
export interface CronServiceConfig {
  /** JSON file path (default: ~/.deca/cron.json) */
  storagePath?: string;
  /** Callback when job triggers */
  onTrigger: CronTriggerCallback;
}
```

---

## CronService Implementation

```typescript
// packages/agent/src/cron/service.ts

import fs from "node:fs/promises";
import path from "node:path";
import type { CronJob, CronSchedule, CronServiceConfig } from "./types";

/**
 * CronService - Single setTimeout scheduler
 *
 * Design:
 * 1. Load jobs from JSON on init
 * 2. Calculate next trigger time across ALL jobs
 * 3. Set ONE setTimeout for that time
 * 4. On trigger: execute job, recalculate, reschedule
 */
export class CronService {
  private jobs: Map<string, CronJob> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config: Required<CronServiceConfig>;
  private storagePath: string;

  constructor(config: CronServiceConfig) {
    this.config = {
      storagePath: config.storagePath ?? path.join(
        process.env.HOME ?? "",
        ".deca",
        "cron.json"
      ),
      onTrigger: config.onTrigger,
    };
    this.storagePath = this.config.storagePath;
  }

  // ============== Lifecycle ==============

  async initialize(): Promise<void> {
    await this.load();
    this.scheduleNext();
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ============== Public API ==============

  async addJob(job: Omit<CronJob, "id" | "createdAtMs">): Promise<CronJob> {
    const newJob: CronJob = {
      ...job,
      id: crypto.randomUUID(),
      createdAtMs: Date.now(),
      nextRunAtMs: this.calculateNextRun(job.schedule),
    };

    this.jobs.set(newJob.id, newJob);
    await this.save();
    this.scheduleNext();

    return newJob;
  }

  async removeJob(jobId: string): Promise<boolean> {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      await this.save();
      this.scheduleNext();
    }
    return deleted;
  }

  async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    await this.triggerJob(job);
  }

  listJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  getStatus(): { jobCount: number; nextTriggerMs: number | null } {
    const next = this.findNextJob();
    return {
      jobCount: this.jobs.size,
      nextTriggerMs: next?.nextRunAtMs ?? null,
    };
  }

  // ============== Scheduling ==============

  private scheduleNext(): void {
    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const next = this.findNextJob();
    if (!next || !next.nextRunAtMs) return;

    const delay = Math.max(0, next.nextRunAtMs - Date.now());

    this.timer = setTimeout(async () => {
      await this.triggerJob(next);
      this.scheduleNext();
    }, delay);
  }

  private findNextJob(): CronJob | null {
    let earliest: CronJob | null = null;

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (!job.nextRunAtMs) continue;

      if (!earliest || job.nextRunAtMs < earliest.nextRunAtMs!) {
        earliest = job;
      }
    }

    return earliest;
  }

  private async triggerJob(job: CronJob): Promise<void> {
    const now = Date.now();

    // Update job state
    job.lastRunAtMs = now;
    job.nextRunAtMs = this.calculateNextRun(job.schedule, now);

    // For "at" jobs, disable after execution
    if (job.schedule.kind === "at") {
      job.enabled = false;
    }

    await this.save();

    // Execute callback
    try {
      await this.config.onTrigger(job);
    } catch (err) {
      console.error(`[Cron] Job ${job.id} trigger failed:`, err);
    }
  }

  private calculateNextRun(schedule: CronSchedule, fromMs = Date.now()): number | undefined {
    switch (schedule.kind) {
      case "at":
        return schedule.atMs > fromMs ? schedule.atMs : undefined;

      case "every":
        return fromMs + schedule.everyMs;

      case "cron":
        return this.parseCronNext(schedule.expr, fromMs);
    }
  }

  /**
   * Simple cron parser - handles common patterns
   * For complex expressions, consider using "croner" library
   */
  private parseCronNext(expr: string, fromMs: number): number {
    // Simplified: delegate to croner or implement basic patterns
    // For v1, support: "* * * * *" (every minute), "0 * * * *" (every hour), etc.
    
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expr}`);
    }

    // For now, use a simple "every minute" fallback
    // TODO: Implement full cron parsing or use croner
    const next = new Date(fromMs);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);

    return next.getTime();
  }

  // ============== Persistence ==============

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, "utf-8");
      const data = JSON.parse(content) as { jobs: CronJob[] };

      this.jobs.clear();
      for (const job of data.jobs) {
        this.jobs.set(job.id, job);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[Cron] Failed to load jobs:", err);
      }
      // File doesn't exist - start with empty jobs
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    const data = { jobs: Array.from(this.jobs.values()) };
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }
}
```

---

## Tool Definition

```typescript
// packages/agent/src/cron/tool.ts

import type { Tool, ToolContext } from "../tools/types";
import type { CronService } from "./service";
import type { CronSchedule } from "./types";

export type CronToolAction = "status" | "list" | "add" | "remove" | "run";

export interface CronToolInput {
  action: CronToolAction;

  // For add
  name?: string;
  instruction?: string;
  schedule?: CronSchedule;

  // For remove/run
  jobId?: string;
}

/**
 * Create cron tool with injected service
 */
export function createCronTool(cronService: CronService): Tool<CronToolInput> {
  return {
    name: "cron",

    description: `Manage scheduled tasks that run automatically.

Actions:
- status: Get scheduler status (job count, next trigger time)
- list: List all scheduled jobs
- add: Create a new scheduled job
- remove: Delete a job
- run: Manually trigger a job immediately

Schedule Types:
- "at": One-time at specific timestamp (atMs: milliseconds since epoch)
- "every": Recurring at interval (everyMs: interval in milliseconds)
- "cron": Standard cron expression (expr: "0 9 * * *")

Examples:
- Add hourly task: { action: "add", name: "hourly-check", schedule: { kind: "every", everyMs: 3600000 }, instruction: "Check system status" }
- Add one-time: { action: "add", name: "reminder", schedule: { kind: "at", atMs: 1707300000000 }, instruction: "Remind user about meeting" }
- Add daily 9am: { action: "add", name: "morning", schedule: { kind: "cron", expr: "0 9 * * *" }, instruction: "Generate morning report" }`,

    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "list", "add", "remove", "run"],
          description: "Action to perform",
        },
        name: {
          type: "string",
          description: "Job name (required for add)",
        },
        instruction: {
          type: "string",
          description: "What to do when triggered (required for add)",
        },
        schedule: {
          type: "object",
          description: "Schedule configuration",
          properties: {
            kind: { type: "string", enum: ["at", "every", "cron"] },
            atMs: { type: "number", description: "Timestamp for 'at' type" },
            everyMs: { type: "number", description: "Interval for 'every' type" },
            expr: { type: "string", description: "Cron expression for 'cron' type" },
          },
        },
        jobId: {
          type: "string",
          description: "Job ID (required for remove/run)",
        },
      },
      required: ["action"],
    },

    async execute(input: CronToolInput, _ctx: ToolContext): Promise<string> {
      try {
        switch (input.action) {
          case "status": {
            const status = cronService.getStatus();
            const nextStr = status.nextTriggerMs
              ? new Date(status.nextTriggerMs).toISOString()
              : "none";
            return `Cron Status:\n- Jobs: ${status.jobCount}\n- Next trigger: ${nextStr}`;
          }

          case "list": {
            const jobs = cronService.listJobs();
            if (jobs.length === 0) return "No scheduled jobs.";

            const lines = jobs.map(job => {
              const scheduleStr = formatSchedule(job.schedule);
              const statusStr = job.enabled ? "enabled" : "disabled";
              return `- ${job.name} (${job.id})\n  Schedule: ${scheduleStr}\n  Status: ${statusStr}`;
            });
            return `Scheduled Jobs (${jobs.length}):\n${lines.join("\n\n")}`;
          }

          case "add": {
            if (!input.name) return "Error: 'name' is required";
            if (!input.instruction) return "Error: 'instruction' is required";
            if (!input.schedule) return "Error: 'schedule' is required";

            const job = await cronService.addJob({
              name: input.name,
              instruction: input.instruction,
              schedule: input.schedule,
              enabled: true,
            });

            return `Job created:\n- ID: ${job.id}\n- Name: ${job.name}\n- Schedule: ${formatSchedule(job.schedule)}`;
          }

          case "remove": {
            if (!input.jobId) return "Error: 'jobId' is required";
            const removed = await cronService.removeJob(input.jobId);
            return removed ? `Job removed: ${input.jobId}` : `Job not found: ${input.jobId}`;
          }

          case "run": {
            if (!input.jobId) return "Error: 'jobId' is required";
            await cronService.runJob(input.jobId);
            return `Job triggered: ${input.jobId}`;
          }

          default:
            return `Unknown action: ${input.action}`;
        }
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "at":
      return `at ${new Date(schedule.atMs).toISOString()}`;
    case "every":
      return `every ${schedule.everyMs}ms`;
    case "cron":
      return schedule.expr;
  }
}
```

---

## Integration

### 1. Gateway initializes CronService

```typescript
// packages/gateway/src/adapter.ts

import { CronService } from "@deca/agent";

const cronService = new CronService({
  onTrigger: async (job) => {
    // Inject instruction into Agent via HeartbeatManager
    heartbeatManager.requestNow("cron", `cron:${job.id}`);
    
    // Or directly enqueue system event
    agent.enqueueSystemEvent({
      type: "cron",
      instruction: job.instruction,
      jobId: job.id,
      jobName: job.name,
    });
  },
});

await cronService.initialize();
```

### 2. cronTool added to builtinTools

```typescript
// packages/agent/src/tools/builtin.ts

import { createCronTool } from "../cron";

// Option A: Static export (requires service injection at runtime)
export const builtinTools = [
  readTool,
  writeTool,
  // ... other tools
];

// Option B: Factory function
export function createBuiltinTools(cronService?: CronService): Tool[] {
  const tools = [...coreTools];
  if (cronService) {
    tools.push(createCronTool(cronService));
  }
  return tools;
}
```

---

## Atomic Commit Plan

### Phase 1: Types (1 commit)

```
feat(agent): add cron type definitions

- Add CronSchedule, CronJob, CronServiceConfig types
- Add CronTriggerCallback type
- Export from packages/agent/src/cron/index.ts
```

### Phase 2: CronService (2 commits)

```
feat(agent): implement CronService with JSON storage

- Single setTimeout scheduler
- JSON file persistence (~/.deca/cron.json)
- CRUD operations for jobs
```

```
test(agent): add CronService unit tests

- Test job lifecycle (add, remove, list)
- Test scheduling logic
- Test persistence (load/save)
```

### Phase 3: cronTool (2 commits)

```
feat(agent): implement cronTool

- Actions: status, list, add, remove, run
- Integrate with CronService
```

```
test(agent): add cronTool unit tests

- Test each action handler
- Test input validation
- Test error cases
```

### Phase 4: Integration (2 commits)

```
feat(agent): add cronTool to builtinTools

- Export createCronTool from @deca/agent
- Add factory function for tool creation
```

```
feat(gateway): integrate CronService

- Initialize on startup
- Wire up onTrigger → HeartbeatManager
- Shutdown on exit
```

### Phase 5: Docs (1 commit)

```
docs(agent): update cron design document

- Replace original over-engineered design
- Add simplified architecture diagram
- Update commit plan
```

---

## Test Strategy

### Unit Tests (90%+ coverage)

| File | Test Focus |
|------|------------|
| `service.test.ts` | Job CRUD, scheduling, persistence |
| `tool.test.ts` | Action handlers, input validation |

### Key Test Cases

```typescript
// service.test.ts
describe("CronService", () => {
  it("should add and list jobs");
  it("should remove job");
  it("should calculate next run for 'at' schedule");
  it("should calculate next run for 'every' schedule");
  it("should trigger callback at scheduled time");
  it("should disable 'at' job after execution");
  it("should persist jobs to JSON file");
  it("should load jobs from JSON file on init");
});

// tool.test.ts
describe("cronTool", () => {
  it("should return status");
  it("should list all jobs");
  it("should add job with valid input");
  it("should reject add without required fields");
  it("should remove existing job");
  it("should run job manually");
});
```

---

## Dependencies

```json
{
  "dependencies": {
    // No new dependencies for v1
    // Optional: "croner" for full cron expression support
  }
}
```

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Package location | `@deca/agent` (not separate package) |
| Tool registration | `builtinTools` default inclusion |
| Cron expression parsing | Simple patterns first, add `croner` if needed |
| Run history | Not stored (logs suffice for v1) |

---

## Next Steps

1. ✅ Design document updated
2. [ ] Implement Phase 1: Types
3. [ ] Implement Phase 2: CronService
4. [ ] Implement Phase 3: cronTool
5. [ ] Implement Phase 4: Integration
6. [ ] Run tests, ensure 90%+ coverage
