import { describe, expect, it } from "vitest";
import { CronService } from "./service.js";
import { createCronTool } from "./tool.js";

describe("cron tool coverage extras", () => {
  function mkCtx() {
    return {
      workspaceDir: "/tmp",
      sessionKey: "agent:main:main",
      sessionId: "main",
      agentId: "main",
    };
  }

  it("formatDuration: <60s shows ms", async () => {
    const svc = new CronService({ onTrigger: async () => {} });
    await svc.initialize();
    const job = await svc.addJob({
      name: "ms",
      instruction: "x",
      schedule: { kind: "every", everyMs: 500 },
      enabled: true,
    });
    const tool = createCronTool(svc);
    const result = await tool.execute({ action: "list" }, mkCtx());
    expect(result).toContain("500ms");
    await svc.removeJob(job.id);
    await svc.shutdown();
  });

  it("formatDuration: hours range", async () => {
    const svc = new CronService({ onTrigger: async () => {} });
    await svc.initialize();
    const job = await svc.addJob({
      name: "hr",
      instruction: "x",
      schedule: { kind: "every", everyMs: 7200000 }, // 2 hours
      enabled: true,
    });
    const tool = createCronTool(svc);
    const result = await tool.execute({ action: "list" }, mkCtx());
    expect(result).toContain("2h");
    await svc.removeJob(job.id);
    await svc.shutdown();
  });

  it("formatDuration: days range", async () => {
    const svc = new CronService({ onTrigger: async () => {} });
    await svc.initialize();
    const job = await svc.addJob({
      name: "day",
      instruction: "x",
      schedule: { kind: "every", everyMs: 172800000 }, // 2 days
      enabled: true,
    });
    const tool = createCronTool(svc);
    const result = await tool.execute({ action: "list" }, mkCtx());
    expect(result).toContain("2d");
    await svc.removeJob(job.id);
    await svc.shutdown();
  });

  it("execute: catches non-Error rejection (string)", async () => {
    const svc = {
      getStatus: () => {
        throw "string-error";
      },
    } as unknown as CronService;
    const tool = createCronTool(svc);
    const result = await tool.execute({ action: "status" }, mkCtx());
    expect(result).toContain("Error: string-error");
  });

  it("execute: status when nextTriggerMs is null", async () => {
    const svc = new CronService({ onTrigger: async () => {} });
    await svc.initialize();
    const tool = createCronTool(svc);
    const result = await tool.execute({ action: "status" }, mkCtx());
    expect(result).toContain("none");
    await svc.shutdown();
  });
});
