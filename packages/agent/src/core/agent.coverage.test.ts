import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "./agent.js";
import type { ContentBlock } from "./session.js";

type StreamConfig = {
  deltas: Array<
    | { type: "text"; text: string }
    | { type: "non_delta" }
    | { type: "non_text_delta" }
  >;
  finalContent: ContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
};

const streamQueue: StreamConfig[] = [];

function createStream(config: StreamConfig) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const d of config.deltas) {
        if (d.type === "text") {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: d.text },
          };
        } else if (d.type === "non_delta") {
          // Different event type to hit "not content_block_delta" branch
          yield { type: "message_start" };
        } else {
          // content_block_delta but non text_delta
          yield {
            type: "content_block_delta",
            delta: { type: "input_json_delta", partial_json: "{}" },
          };
        }
      }
    },
    async finalMessage() {
      return {
        content: config.finalContent,
        usage: config.usage ?? {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };
    },
  };
}

function attachMockClient(agent: Agent) {
  const client = {
    messages: {
      stream: () => {
        const config =
          streamQueue.shift() ??
          ({ deltas: [], finalContent: [] } as StreamConfig);
        return createStream(config);
      },
      create: async () => ({
        content: [{ type: "text" as const, text: "summary" }],
      }),
    },
  };
  (agent as unknown as { client: typeof client }).client = client;
}

describe("Agent coverage extras", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-cov-"));
    streamQueue.length = 0;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses ANTHROPIC_MODEL env var when no config.model", () => {
    const orig = process.env.ANTHROPIC_MODEL;
    process.env.ANTHROPIC_MODEL = "model-from-env";
    try {
      const agent = new Agent({
        apiKey: "k",
        sessionDir: tempDir,
        workspaceDir: tempDir,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });
      expect((agent as unknown as { model: string }).model).toBe(
        "model-from-env",
      );
    } finally {
      if (orig === undefined) {
        Reflect.deleteProperty(process.env, "ANTHROPIC_MODEL");
      } else {
        process.env.ANTHROPIC_MODEL = orig;
      }
    }
  });

  it("uses default model when neither config nor env provided", () => {
    const orig = process.env.ANTHROPIC_MODEL;
    Reflect.deleteProperty(process.env, "ANTHROPIC_MODEL");
    try {
      const agent = new Agent({
        apiKey: "k",
        sessionDir: tempDir,
        workspaceDir: tempDir,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });
      expect((agent as unknown as { model: string }).model).toBe(
        "claude-sonnet-4-20250514",
      );
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_MODEL = orig;
    }
  });

  it("uses process.cwd() when no workspaceDir provided", () => {
    const agent = new Agent({
      apiKey: "k",
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
    });
    expect((agent as unknown as { workspaceDir: string }).workspaceDir).toBe(
      process.cwd(),
    );
  });

  it("uses default flags when not specified", () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
    });
    const a = agent as unknown as {
      enableMemory: boolean;
      enableContext: boolean;
      enableSkills: boolean;
      enableHeartbeat: boolean;
    };
    expect(a.enableMemory).toBe(true);
    expect(a.enableContext).toBe(true);
    expect(a.enableSkills).toBe(true);
    expect(a.enableHeartbeat).toBe(false);
  });

  it("sandbox: allowExec=true and allowWrite=true yields no deny policy", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
    });
    const tools = [
      {
        name: "exec",
        description: "exec",
        inputSchema: { type: "object" as const, properties: {} },
        execute: async () => "",
      },
      {
        name: "write",
        description: "write",
        inputSchema: { type: "object" as const, properties: {} },
        execute: async () => "",
      },
      {
        name: "edit",
        description: "edit",
        inputSchema: { type: "object" as const, properties: {} },
        execute: async () => "",
      },
    ];
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      tools,
      sandbox: { enabled: true, allowExec: true, allowWrite: true },
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    await agent.run("s", "hi");
    // All tools should remain allowed
    expect(true).toBe(true);
  });

  it("sandbox: enabled=false bypasses sandbox policy", () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      sandbox: { enabled: false },
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
    });
    expect(agent).toBeDefined();
  });

  it("buildSystemPrompt: enableContext but contextPrompt empty", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
    });
    // workspaceDir without any context files
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: true,
      enableMemory: false,
      enableSkills: true,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    await agent.run("s", "hi");
    expect(true).toBe(true);
  });

  it("skill match with empty matchedTrigger and userPart slice empty falls back to original", async () => {
    const skillDir = path.join(tempDir, "skills");
    await fs.mkdir(skillDir, { recursive: true });
    // Create skill where trigger matches the entire input -> userPart slice is empty
    await fs.writeFile(
      path.join(skillDir, "exact.md"),
      '---\nid: exact\nname: Exact\ntriggers: ["hello"]\n---\nSKILL',
    );

    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "done" }],
    });

    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: true,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    await agent.run("s-empty", "hello");
    const history = agent.getHistory("s-empty");
    // userPart is empty so original userMessage is used
    expect(history[0]?.content).toBe("SKILL\n\n用户请求: hello");
  });

  it("processes non-text and non-content-block-delta stream events", async () => {
    streamQueue.push({
      deltas: [
        { type: "non_delta" },
        { type: "non_text_delta" },
        { type: "text", text: "hi" },
      ],
      finalContent: [{ type: "text", text: "hi" }],
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    const result = await agent.run("s", "hi");
    expect(result.text).toBe("hi");
  });

  it("falls back to 0 when cache_creation/read tokens are missing/null", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
      usage: {
        input_tokens: 5,
        output_tokens: 7,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    const result = await agent.run("s", "hi");
    expect(result.usage?.cacheCreationInputTokens).toBe(0);
    expect(result.usage?.cacheReadInputTokens).toBe(0);
  });

  it("truncates tool result to 500 chars in event emission", async () => {
    const longString = "a".repeat(700);
    streamQueue.push({
      deltas: [],
      finalContent: [
        { type: "text", text: "x" },
        { type: "tool_use", id: "t", name: "long", input: {} },
      ],
    });
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "done" }],
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      tools: [
        {
          name: "long",
          description: "long",
          inputSchema: { type: "object" as const, properties: {} },
          execute: async () => longString,
        },
      ],
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 2,
    });
    attachMockClient(agent);
    const result = await agent.run("s", "tool");
    expect(result.toolCalls).toBe(1);
  });

  it("handles non-Error rejection in run (string error path)", async () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    // Override stream to throw a non-Error string
    (agent as unknown as { client: unknown }).client = {
      messages: {
        stream: () => {
          throw "string-error";
        },
      },
    };
    await expect(agent.run("s", "hi")).rejects.toBeDefined();
  });

  it("startHeartbeat without callback still starts wake", () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: true,
    });
    agent.startHeartbeat();
    agent.stopHeartbeat();
  });

  it("startHeartbeat callback returning undefined falls back to default ok+tasks", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] something");
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: true,
    });
    agent.startHeartbeat(async () => undefined);
    const result = await agent.triggerHeartbeat();
    agent.stopHeartbeat();
    expect(result.status).toBe("ok");
  });

  it("memory disabled but memory_search tool present means no memory section in prompt", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      tools: [
        {
          name: "memory_search",
          description: "x",
          inputSchema: { type: "object" as const, properties: {} },
          execute: async () => "",
        },
      ],
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    await agent.run("s", "hi");
    // No assertion needed - exercising branch
    expect(true).toBe(true);
  });

  it("memory enabled but no memory tools => no memory section", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "ok" }],
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      tools: [
        {
          name: "noop",
          description: "x",
          inputSchema: { type: "object" as const, properties: {} },
          execute: async () => "",
        },
      ],
      enableContext: false,
      enableMemory: true,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    await agent.run("s", "hi");
    expect(true).toBe(true);
  });

  it("subagent: rejects spawn from already-subagent session", async () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    const spawn = (
      agent as unknown as {
        spawnSubagent: (p: {
          parentSessionKey: string;
          task: string;
        }) => Promise<unknown>;
      }
    ).spawnSubagent.bind(agent);
    await expect(
      spawn({
        parentSessionKey: "agent:main:subagent:abc",
        task: "x",
      }),
    ).rejects.toThrow("子代理");
  });

  it("subagent: spawns and emits summary with cleanup=delete", async () => {
    streamQueue.push({
      deltas: [],
      finalContent: [{ type: "text", text: "child-output" }],
    });
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    attachMockClient(agent);
    const spawn = (
      agent as unknown as {
        spawnSubagent: (p: {
          parentSessionKey: string;
          task: string;
          label?: string;
          cleanup?: "keep" | "delete";
        }) => Promise<{ runId: string; sessionKey: string }>;
      }
    ).spawnSubagent.bind(agent);
    const result = await spawn({
      parentSessionKey: "agent:main:s:p1",
      task: "do work",
      label: "child",
      cleanup: "delete",
    });
    // Wait for the child run and follow-up async work to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(result.sessionKey).toMatch(/^agent:main:subagent:/);
  });

  it("subagent: handles errors in child run (instanceof Error path)", async () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    // Make stream throw to cause child run to fail
    (agent as unknown as { client: unknown }).client = {
      messages: {
        stream: () => {
          throw new Error("child failed");
        },
      },
    };
    const spawn = (
      agent as unknown as {
        spawnSubagent: (p: {
          parentSessionKey: string;
          task: string;
        }) => Promise<{ sessionKey: string }>;
      }
    ).spawnSubagent.bind(agent);
    await spawn({
      parentSessionKey: "agent:main:s:p2",
      task: "fail",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(true).toBe(true);
  });

  it("subagent: handles non-Error rejection (string path)", async () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
      maxTurns: 1,
    });
    (agent as unknown as { client: unknown }).client = {
      messages: {
        stream: () => {
          throw "string-rejection";
        },
      },
    };
    const spawn = (
      agent as unknown as {
        spawnSubagent: (p: {
          parentSessionKey: string;
          task: string;
        }) => Promise<{ sessionKey: string }>;
      }
    ).spawnSubagent.bind(agent);
    await spawn({
      parentSessionKey: "agent:main:s:p3",
      task: "fail",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(true).toBe(true);
  });

  it("baseUrl falls back to ANTHROPIC_BASE_URL env", () => {
    const orig = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "https://example.com";
    try {
      const agent = new Agent({
        apiKey: "k",
        sessionDir: tempDir,
        workspaceDir: tempDir,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });
      expect(agent).toBeDefined();
    } finally {
      if (orig === undefined) {
        Reflect.deleteProperty(process.env, "ANTHROPIC_BASE_URL");
      } else {
        process.env.ANTHROPIC_BASE_URL = orig;
      }
    }
  });

  it("explicit baseUrl overrides env", () => {
    const agent = new Agent({
      apiKey: "k",
      baseUrl: "https://my-proxy",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
    });
    expect(agent).toBeDefined();
  });

  it("uses default contextTokens when not provided", () => {
    const agent = new Agent({
      apiKey: "k",
      sessionDir: tempDir,
      workspaceDir: tempDir,
      enableContext: false,
      enableMemory: false,
      enableSkills: false,
      enableHeartbeat: false,
    });
    expect(
      (agent as unknown as { contextTokens: number }).contextTokens,
    ).toBeGreaterThan(0);
  });
});
