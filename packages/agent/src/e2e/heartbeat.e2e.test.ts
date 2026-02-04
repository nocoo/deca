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
import { HeartbeatManager, type HeartbeatTask } from "../heartbeat/manager.js";

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
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any leftover HEARTBEAT.md
    const heartbeatPath = join(testDir, "HEARTBEAT.md");
    if (existsSync(heartbeatPath)) {
      rmSync(heartbeatPath);
    }
  });

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
    manager.onTasks(async (tasks, _request) => {
      receivedTasks.push(...tasks);
      return { status: "ok", tasks, text: `Processed ${tasks.length} tasks` };
    });

    const tasks = await manager.trigger();

    expect(tasks).toHaveLength(2);
    expect(receivedTasks).toHaveLength(2);
    expect(tasks[0]?.description).toContain("Check server status");
    expect(tasks[1]?.description).toContain("Review logs");

    console.log("✅ Heartbeat triggered with tasks:");
    for (const task of tasks) {
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

    const tasks = await manager.trigger();

    expect(tasks).toHaveLength(0);
    expect(callbackCalled).toBe(false);

    console.log("✅ Correctly skipped - no pending tasks");
  });

  it("should integrate Heartbeat tasks into Agent conversation", async () => {
    if (!credentials) {
      console.log("⏭️ Skipping: No credentials available");
      return;
    }

    // Create HEARTBEAT.md with tasks
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
      maxTurns: 3,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: true, // Enable heartbeat integration
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

    console.log(`✅ Heartbeat-enabled conversation completed in ${elapsed}ms`);
    console.log(`   Turns: ${result.turns}`);
  }, 60000);

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
    // Completed tasks might not be included in prompt

    console.log("✅ Built tasks prompt:");
    console.log(prompt?.slice(0, 500));
  });
});
