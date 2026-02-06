import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSessionKey } from "./session-key.js";
import type { ContentBlock, Message } from "./session.js";

type StreamConfig = {
  deltas: string[];
  finalContent: ContentBlock[];
};

const streamQueue: StreamConfig[] = [];
let lastStreamParams:
  | {
      system: string;
      tools: Array<{ name: string }>;
      messages: Array<{ role: string; content: unknown }>;
    }
  | undefined;
let summaryText = "Summary";

function createStream(config: StreamConfig) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of config.deltas) {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text },
        };
      }
    },
    async finalMessage() {
      return { content: config.finalContent };
    },
  };
}

function attachMockClient(agent: Agent) {
  const client = {
    messages: {
      stream: (params: {
        system: string;
        tools: Array<{ name: string }>;
        messages: Array<{ role: string; content: unknown }>;
      }) => {
        lastStreamParams = params;
        const config =
          streamQueue.shift() ??
          ({ deltas: [], finalContent: [] } as StreamConfig);
        return createStream(config);
      },
      create: async () => ({
        content: [{ type: "text" as const, text: summaryText }],
      }),
    },
  };

  (agent as unknown as { client: typeof client }).client = client;
}

import { Agent } from "./agent.js";

describe("Agent", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-test-"));
    streamQueue.length = 0;
    lastStreamParams = undefined;
    summaryText = "Summary";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("builds system prompt with context, skills, memory, sandbox and filters tools", async () => {
    await fs.writeFile(path.join(tempDir, "AGENTS.md"), "CTX");
    await fs.writeFile(
      path.join(tempDir, "HEARTBEAT.md"),
      "- [ ] Pending task",
    );

    streamQueue.push({
      deltas: ["o", "k"],
      finalContent: [{ type: "text", text: "ok" }],
    });

    const tools = [
      {
        name: "read",
        description: "read",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => "",
      },
      {
        name: "write",
        description: "write",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => "",
      },
      {
        name: "edit",
        description: "edit",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => "",
      },
      {
        name: "exec",
        description: "exec",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => "",
      },
      {
        name: "memory_search",
        description: "memory",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => "",
      },
    ];

    const agent = new Agent({
      apiKey: "test-key",
      model: "mock-model",
      tools,
      sessionDir: tempDir,
      workspaceDir: tempDir,
      promptDir: tempDir,
      memoryDir: path.join(tempDir, "memory"),
      enableContext: true,
      enableSkills: true,
      enableHeartbeat: true,
      enableMemory: true,
      sandbox: { enabled: true, allowExec: false, allowWrite: false },
      maxTurns: 1,
    });

    attachMockClient(agent);
    const result = await agent.run("session-1", "hello");

    expect(result.text).toBe("ok");
    expect(lastStreamParams?.system).toContain("## 工作区文件");
    expect(lastStreamParams?.system).toContain("## AGENTS.md");
    expect(lastStreamParams?.system).toContain("CTX");
    expect(lastStreamParams?.system).toContain("## 可用技能");
    expect(lastStreamParams?.system).toContain("记忆");
    expect(lastStreamParams?.system).toContain("沙箱");

    const toolNames = lastStreamParams?.tools.map((t) => t.name) ?? [];
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("memory_search");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("write");
    expect(toolNames).not.toContain("edit");

    const history = agent.getHistory("session-1");
    expect(history[0]?.content).toContain("待办任务");
  });

  it("applies skill match and triggers callback", async () => {
    const skillDir = path.join(tempDir, "skills");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "skill.md"),
      "---\n" +
        "id: skill-1\n" +
        "name: Custom Skill\n" +
        'triggers: ["do"]\n' +
        "---\n" +
        "SKILL PROMPT",
    );

    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "done" }],
    });

    const onSkillMatch = mock(() => {});

    const agent = new Agent({
      apiKey: "test-key",
      model: "mock-model",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      promptDir: tempDir,
      enableSkills: true,
      enableContext: false,
      enableMemory: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });

    attachMockClient(agent);
    const result = await agent.run("session-skill", "do something", {
      onSkillMatch,
    });

    expect(result.skillTriggered).toBe("skill-1");
    expect(onSkillMatch).toHaveBeenCalledTimes(1);

    const history = agent.getHistory("session-skill");
    expect(history[0]?.content).toBe("SKILL PROMPT\n\n用户请求: something");
  });

  it("handles tool calls with errors and unknown tools", async () => {
    streamQueue.push({
      deltas: ["r"],
      finalContent: [
        { type: "text", text: "result" },
        { type: "tool_use", id: "t1", name: "explode", input: {} },
        { type: "tool_use", id: "t2", name: "missing", input: {} },
      ],
    });
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "done" }],
    });

    const tools = [
      {
        name: "explode",
        description: "explode",
        inputSchema: { type: "object", properties: {} } as const,
        execute: async () => {
          throw new Error("boom");
        },
      },
    ];

    const agent = new Agent({
      apiKey: "test-key",
      model: "mock-model",
      tools,
      sessionDir: tempDir,
      workspaceDir: tempDir,
      promptDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 2,
    });

    attachMockClient(agent);
    const result = await agent.run("session-tools", "run tools");
    expect(result.toolCalls).toBe(2);

    const history = agent.getHistory("session-tools");
    const toolResultMessage = history.find(
      (msg) =>
        Array.isArray(msg.content) &&
        msg.content.some((block) => block.type === "tool_result"),
    );
    expect(toolResultMessage).toBeDefined();
    const blocks = (toolResultMessage?.content ?? []) as ContentBlock[];
    const contents = blocks
      .filter((block) => block.type === "tool_result")
      .map((block) => block.content ?? "");
    expect(contents.some((text) => text.includes("执行错误: boom"))).toBe(true);
    expect(contents.some((text) => text.includes("未知工具: missing"))).toBe(
      true,
    );
  });

  it("adds memory when enabled and response produced", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "final" }],
    });

    const memoryDir = path.join(tempDir, "memory");
    const agent = new Agent({
      apiKey: "test-key",
      model: "mock-model",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      promptDir: tempDir,
      memoryDir,
      enableContext: false,
      enableMemory: true,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });

    attachMockClient(agent);
    await agent.run("session-memory", "remember this");

    const entries = await agent.getMemory().getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toContain("Q: remember this");
    expect(entries[0]?.content).toContain("A: final");
  });

  it("injects compaction summary into model messages", async () => {
    summaryText = "summary";
    const sessionKey = resolveSessionKey({
      agentId: "main",
      sessionId: "compact",
    });
    const sessionPath = path.join(
      tempDir,
      `${encodeURIComponent(sessionKey)}.jsonl`,
    );
    const oldMessages: Message[] = [
      { role: "user", content: "x".repeat(2000), timestamp: Date.now() - 3 },
      {
        role: "assistant",
        content: "y".repeat(2000),
        timestamp: Date.now() - 2,
      },
      { role: "user", content: "z".repeat(2000), timestamp: Date.now() - 1 },
    ];
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(
      sessionPath,
      `${oldMessages.map((msg) => JSON.stringify(msg)).join("\n")}\n`,
    );

    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
    });

    const agent = new Agent({
      apiKey: "test-key",
      model: "mock-model",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      promptDir: tempDir,
      contextTokens: 40,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });

    attachMockClient(agent);
    await agent.run("compact", "hello");

    const firstMessage = lastStreamParams?.messages[0];
    expect(firstMessage?.content).toBe("【历史摘要】\nsummary");
  });

  describe("getStatus", () => {
    it("returns basic status without session key", async () => {
      const agent = new Agent({
        apiKey: "test-key",
        model: "test-model",
        agentId: "test-agent",
        sessionDir: tempDir,
        workspaceDir: tempDir,
        promptDir: tempDir,
        contextTokens: 128000,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      const status = await agent.getStatus();

      expect(status.model).toBe("test-model");
      expect(status.agentId).toBe("test-agent");
      expect(status.contextTokens).toBe(128000);
      expect(status.session).toBeUndefined();
    });

    it("returns session stats when session key provided", async () => {
      streamQueue.push({
        deltas: ["hi"],
        finalContent: [{ type: "text", text: "hi" }],
      });

      const agent = new Agent({
        apiKey: "test-key",
        model: "test-model",
        agentId: "test-agent",
        sessionDir: tempDir,
        workspaceDir: tempDir,
        promptDir: tempDir,
        contextTokens: 64000,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        maxTurns: 1,
      });

      attachMockClient(agent);
      await agent.run("status-session", "hello");

      const status = await agent.getStatus("status-session");

      expect(status.model).toBe("test-model");
      expect(status.agentId).toBe("test-agent");
      expect(status.contextTokens).toBe(64000);
      expect(status.session).toBeDefined();
      expect(status.session?.key).toBe("agent:test-agent:status-session");
      expect(status.session?.messageCount).toBe(2);
      expect(status.session?.userMessages).toBe(1);
      expect(status.session?.assistantMessages).toBe(1);
    });
  });
});
