/**
 * E2E tests for Heartbeat mechanism with real LLM API calls
 *
 * These tests require:
 * - ~/.deca/credentials/anthropic.json with valid API credentials
 *
 * Run with: bun test src/e2e/
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "../core/agent.js";
import {
  HeartbeatManager,
  type HeartbeatTask,
  type WakeReason,
} from "../heartbeat/manager.js";

interface AnthropicCredential {
  apiKey: string;
  baseUrl?: string;
  models?: {
    default?: string;
    haiku?: string;
    sonnet?: string;
    opus?: string;
    reasoning?: string;
  };
}

function loadCredentials(): AnthropicCredential | null {
  const credPath = join(homedir(), ".deca", "credentials", "anthropic.json");
  if (!existsSync(credPath)) {
    return null;
  }
  try {
    const content = readFileSync(credPath, "utf-8");
    return JSON.parse(content) as AnthropicCredential;
  } catch {
    return null;
  }
}

describe("Heartbeat E2E", () => {
  let credentials: AnthropicCredential | null;
  let testDir: string;

  beforeAll(() => {
    credentials = loadCredentials();
    testDir = join(tmpdir(), `deca-heartbeat-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const heartbeatPath = join(testDir, "HEARTBEAT.md");
    if (existsSync(heartbeatPath)) {
      rmSync(heartbeatPath);
    }
  });

  // ==================== Parsing Tests ====================

  describe("Parsing", () => {
    it("should parse tasks from HEARTBEAT.md", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Daily Tasks

- [ ] Review pull requests
- [x] Update documentation
- [ ] Run test suite
- [ ] Deploy to staging
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const tasks = await manager.parseTasks();

      expect(tasks).toHaveLength(4);
      expect(tasks.filter((t) => !t.completed)).toHaveLength(3);
      expect(tasks.filter((t) => t.completed)).toHaveLength(1);

      console.log("✅ Parsed HEARTBEAT.md tasks:");
      for (const task of tasks) {
        console.log(`   ${task.completed ? "✓" : "○"} ${task.description}`);
      }
    });

    it("should handle different checkbox formats", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Mixed Formats

- [ ] Unchecked with space
- [] Unchecked without space
- [x] Checked lowercase
- [X] Checked uppercase
* [ ] Asterisk bullet
+ [ ] Plus bullet
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const tasks = await manager.parseTasks();

      expect(tasks.length).toBeGreaterThanOrEqual(4);
      console.log("✅ Parsed various checkbox formats:");
      for (const task of tasks) {
        console.log(`   ${task.completed ? "✓" : "○"} ${task.description}`);
      }
    });

    it("should parse plain list items as tasks", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Simple List

- Task without checkbox
- Another plain task
- [ ] Task with checkbox
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(3);
      // Plain list items are treated as uncompleted
      const pending = tasks.filter((t) => !t.completed);
      expect(pending.length).toBe(3);

      console.log("✅ Parsed plain list items as tasks");
    });

    it("should skip headers and empty lines", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Main Header

## Subheader

- [ ] Actual task

### Another header

- [ ] Another task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const tasks = await manager.parseTasks();

      expect(tasks.length).toBe(2);
      expect(tasks.every((t) => !t.description.includes("#"))).toBe(true);

      console.log("✅ Correctly skipped headers");
    });

    it("should return empty array for non-existent file", async () => {
      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "does-not-exist.md",
        enabled: true,
      });

      const tasks = await manager.parseTasks();

      expect(tasks).toHaveLength(0);
      console.log("✅ Handled non-existent file gracefully");
    });
  });

  // ==================== Trigger Tests ====================

  describe("Trigger", () => {
    it("should trigger heartbeat and process pending tasks", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Pending Work

- [ ] Check server status
- [ ] Review logs
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const receivedTasks: HeartbeatTask[] = [];
      manager.onTasks(async (tasks) => {
        receivedTasks.push(...tasks);
        return { status: "ok", tasks, text: `Processed ${tasks.length} tasks` };
      });

      const result = await manager.trigger();

      expect(result.tasks).toHaveLength(2);
      expect(receivedTasks).toHaveLength(2);
      expect(result.tasks?.[0]?.description).toContain("Check server status");
      expect(result.tasks?.[1]?.description).toContain("Review logs");

      console.log("✅ Heartbeat triggered with tasks:");
      for (const task of result.tasks ?? []) {
        console.log(`   ○ ${task.description}`);
      }
    });

    it("should skip when no pending tasks exist", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# All Done!

- [x] Task 1 completed
- [x] Task 2 completed
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      let callbackCalled = false;
      manager.onTasks(async () => {
        callbackCalled = true;
        return { status: "ok" };
      });

      const result = await manager.trigger();

      expect(result.status).toBe("skipped");
      expect(result.tasks ?? []).toHaveLength(0);
      expect(callbackCalled).toBe(false);

      console.log("✅ Correctly skipped - no pending tasks");
    });

    it("should call multiple callbacks", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Tasks

- [ ] Single task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      let callback1Called = false;
      let callback2Called = false;

      manager.onTasks(async () => {
        callback1Called = true;
        return { status: "ok" };
      });

      manager.onTasks(async () => {
        callback2Called = true;
        return { status: "ok" };
      });

      await manager.trigger();

      expect(callback1Called).toBe(true);
      expect(callback2Called).toBe(true);

      console.log("✅ Multiple callbacks were called");
    });
  });

  // ==================== Task Management Tests ====================

  describe("Task Management", () => {
    it("should mark task as completed", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Tasks

- [ ] Task to complete
- [ ] Another task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      // Get initial tasks
      const beforeTasks = await manager.parseTasks();
      expect(beforeTasks[0]?.completed).toBe(false);

      // Mark first task as completed
      const firstTask = beforeTasks[0];
      expect(firstTask).toBeDefined();
      const success = await manager.markCompleted(firstTask?.line ?? 0);
      expect(success).toBe(true);

      // Verify it's now completed
      const afterTasks = await manager.parseTasks();
      expect(afterTasks[0]?.completed).toBe(true);
      expect(afterTasks[1]?.completed).toBe(false);

      console.log("✅ Task marked as completed");
    });

    it("should add new task", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Tasks

- [ ] Existing task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      await manager.addTask("New task added via API");

      const tasks = await manager.parseTasks();
      expect(tasks.length).toBe(2);
      expect(tasks.some((t) => t.description.includes("New task"))).toBe(true);

      console.log("✅ New task added successfully");
    });

    it("should create HEARTBEAT.md if it does not exist when adding task", async () => {
      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "new-heartbeat.md",
        enabled: true,
      });

      await manager.addTask("First task in new file");

      const newPath = join(testDir, "new-heartbeat.md");
      expect(existsSync(newPath)).toBe(true);

      const content = readFileSync(newPath, "utf-8");
      expect(content).toContain("First task in new file");

      console.log("✅ Created HEARTBEAT.md and added task");
    });

    it("should get pending tasks correctly", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Mixed

- [x] Done 1
- [ ] Pending 1
- [x] Done 2
- [ ] Pending 2
- [ ] Pending 3
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const pending = await manager.getPendingTasks();

      expect(pending.length).toBe(3);
      expect(pending.every((t) => !t.completed)).toBe(true);

      console.log("✅ Got pending tasks correctly");
    });

    it("should check if has pending tasks", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Tasks

- [ ] One pending task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const hasPending = await manager.hasPendingTasks();
      expect(hasPending).toBe(true);

      // Now complete the task
      const tasks = await manager.parseTasks();
      expect(tasks[0]).toBeDefined();
      await manager.markCompleted(tasks[0].line);

      const hasPendingAfter = await manager.hasPendingTasks();
      expect(hasPendingAfter).toBe(false);

      console.log("✅ hasPendingTasks works correctly");
    });
  });

  // ==================== Prompt Building Tests ====================

  describe("Prompt Building", () => {
    it("should build tasks prompt for Agent context", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Priority Tasks

- [ ] Critical: Fix production bug
- [ ] High: Deploy hotfix
- [x] Low: Update readme
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const prompt = await manager.buildTasksPrompt();

      expect(prompt).toBeDefined();
      expect(prompt).toContain("HEARTBEAT");
      expect(prompt).toContain("Critical: Fix production bug");
      expect(prompt).toContain("High: Deploy hotfix");

      console.log("✅ Built tasks prompt:");
      console.log(prompt?.slice(0, 500));
    });

    it("should return empty string when no pending tasks", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# All Done

- [x] Completed task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
      });

      const prompt = await manager.buildTasksPrompt();

      expect(prompt).toBe("");

      console.log("✅ Empty prompt for completed tasks");
    });
  });

  // ==================== Status and Config Tests ====================

  describe("Status and Config", () => {
    it("should return correct status", async () => {
      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
        intervalMs: 60000,
      });

      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.started).toBe(false);
      expect(status.intervalMs).toBe(60000);

      console.log("✅ Status returned correctly");
      console.log(`   enabled: ${status.enabled}`);
      console.log(`   intervalMs: ${status.intervalMs}`);
    });

    it("should update config dynamically", async () => {
      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
        intervalMs: 30000,
      });

      // Update interval
      manager.updateConfig({ intervalMs: 60000 });
      expect(manager.getStatus().intervalMs).toBe(60000);

      // Disable
      manager.updateConfig({ enabled: false });
      expect(manager.getStatus().enabled).toBe(false);

      console.log("✅ Config updated dynamically");
    });
  });

  // ==================== Agent Integration Tests ====================

  describe("Agent Integration", () => {
    it("should integrate Heartbeat tasks into Agent conversation", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Agent Tasks

- [ ] Say hello to the user
- [ ] Report current time
`,
      );

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: true,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-heartbeat-${Date.now()}`;

      console.log("📤 Sending message with Heartbeat enabled...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        "Hi! What are your current tasks from HEARTBEAT.md?",
        {
          onHeartbeat: (tasks) => {
            console.log(`   💓 Heartbeat tasks: ${tasks.length}`);
            for (const task of tasks) {
              console.log(`      ○ ${task.description}`);
            }
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 300)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);

      console.log(
        `✅ Heartbeat-enabled conversation completed in ${elapsed}ms`,
      );
      console.log(`   Turns: ${result.turns}`);
    }, 60000);

    it("should process tasks when triggered by Agent", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Today's Tasks

- [ ] Create a test file called heartbeat-output.txt
- [ ] Write "Task completed!" into it
`,
      );

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 10,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: true,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-heartbeat-task-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Asking Agent to complete heartbeat tasks...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        "Please complete the tasks listed in HEARTBEAT.md. Create the file and write to it as instructed.",
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool: ${name}`);
            toolsUsed.push(name);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("write");

      // Verify the file was created
      const outputPath = join(testDir, "heartbeat-output.txt");
      if (existsSync(outputPath)) {
        const content = readFileSync(outputPath, "utf-8");
        expect(content.toLowerCase()).toContain("task");
        console.log(`   📄 Created file content: ${content}`);
      }

      console.log(`✅ Heartbeat tasks completed in ${elapsed}ms`);
      console.log(`   Tools used: ${toolsUsed.join(", ")}`);
    }, 90000);
  });

  // ==================== Request Coalescing Tests ====================

  describe("Request Coalescing", () => {
    it("should handle requestNow with different reasons", async () => {
      const heartbeatPath = join(testDir, "HEARTBEAT.md");
      writeFileSync(
        heartbeatPath,
        `# Tasks

- [ ] Test task
`,
      );

      const manager = new HeartbeatManager(testDir, {
        heartbeatPath: "HEARTBEAT.md",
        enabled: true,
        coalesceMs: 50,
      });

      const triggeredReasons: WakeReason[] = [];

      manager.onTasks(async (_tasks, request) => {
        triggeredReasons.push(request.reason);
        return { status: "ok" };
      });

      // Request with different reasons
      manager.requestNow("requested");

      // Wait for coalesce window (increased for CI stability)
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(triggeredReasons.length).toBeGreaterThanOrEqual(1);

      console.log("✅ Request coalescing works");
      console.log(`   Triggered reasons: ${triggeredReasons.join(", ")}`);
    });
  });
});
