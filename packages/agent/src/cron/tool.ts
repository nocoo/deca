import type { Tool, ToolContext } from "../tools/types.js";
import type { CronService } from "./service.js";
import type { CronSchedule } from "./types.js";

export type CronToolAction = "status" | "list" | "add" | "remove" | "run";

export interface CronToolInput {
  action: CronToolAction;
  name?: string;
  instruction?: string;
  schedule?: CronSchedule;
  jobId?: string;
}

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "at":
      return `at ${new Date(schedule.atMs).toISOString()}`;
    case "every":
      return `every ${formatDuration(schedule.everyMs)}`;
    case "cron":
      return schedule.expr;
  }
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${ms}ms`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / 86400000)}d`;
}

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
- Add one-time: { action: "add", name: "reminder", schedule: { kind: "at", atMs: 1707300000000 }, instruction: "Remind user" }
- Add daily 9am: { action: "add", name: "morning", schedule: { kind: "cron", expr: "0 9 * * *" }, instruction: "Morning report" }`,

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
            atMs: { type: "number", description: "Timestamp for at type" },
            everyMs: { type: "number", description: "Interval for every type" },
            expr: {
              type: "string",
              description: "Cron expression for cron type",
            },
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

            const lines = jobs.map((job) => {
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
            return removed
              ? `Job removed: ${input.jobId}`
              : `Job not found: ${input.jobId}`;
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
