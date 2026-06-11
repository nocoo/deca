import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildBootstrapContextFiles,
  filterBootstrapFilesForSession,
} from "../context/bootstrap.js";
import {
  buildCompactionSummary,
  summarizeInStages,
} from "../context/compaction.js";
import type { Message } from "../core/session.js";
import {
  resolveSessionKey,
  toAgentStoreSessionKey,
} from "../core/session-key.js";
import { SkillManager } from "../core/skills.js";
import { isToolAllowed } from "../core/tool-policy.js";
import { stripHeartbeatToken } from "../heartbeat/tokens.js";

type SummaryClient = Pick<Anthropic, "messages">;
function toClient(c: unknown): SummaryClient {
  return c as SummaryClient;
}
function mkMsg(role: "user" | "assistant", content: string): Message {
  return { role, content, timestamp: Date.now() };
}

describe("final branch coverage cleanup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "final-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ----- session-key -----
  it("toAgentStoreSessionKey: empty requestKey yields main session", () => {
    expect(
      toAgentStoreSessionKey({
        agentId: "main",
        requestKey: null,
      }),
    ).toBe("agent:main:main");
    expect(
      toAgentStoreSessionKey({
        agentId: "main",
        requestKey: undefined,
      }),
    ).toBe("agent:main:main");
  });

  it("resolveSessionKey: with sessionId only", () => {
    const key = resolveSessionKey({ agentId: "bot", sessionId: "thread-1" });
    expect(key).toBe("agent:bot:thread-1");
  });

  it("resolveSessionKey: defaults agent + main when nothing provided", () => {
    const key = resolveSessionKey({});
    expect(key).toBe("agent:main:main");
  });

  it("toAgentStoreSessionKey: explicit agent: prefix preserved", () => {
    const key = toAgentStoreSessionKey({
      agentId: "main",
      requestKey: "agent:other:custom",
    });
    expect(key).toBe("agent:other:custom");
  });

  // ----- tool-policy -----
  it("isToolAllowed: empty pattern in deny is no-match", () => {
    // matchesPattern with empty pattern returns false
    expect(isToolAllowed("foo", { deny: [""] })).toBe(true);
  });

  it("isToolAllowed: wildcard `*` deny denies all", () => {
    expect(isToolAllowed("any", { deny: ["*"] })).toBe(false);
  });

  it("isToolAllowed: deny only with no match returns true", () => {
    expect(isToolAllowed("read", { deny: ["write"] })).toBe(true);
  });

  // ----- compaction -----
  it("summarizeInStages: with valid messages but parts<=1 + previousSummary", async () => {
    const client = toClient({
      messages: {
        create: async () => ({ content: [{ type: "text", text: "S" }] }),
      },
    });
    const result = await summarizeInStages({
      messages: [mkMsg("user", "x")],
      client,
      model: "m",
      maxTokens: 100,
      maxChunkTokens: 10000,
      contextWindow: 200000,
      parts: 1,
      previousSummary: "PREV",
    });
    expect(result).toBe("S");
  });

  it("compaction: oversized messages with no smallMessages returns size fallback", async () => {
    const failingClient = toClient({
      messages: {
        create: async () => {
          throw new Error("fail");
        },
      },
    });
    // All messages oversized, summarizeChunks fails first, no smallMessages
    const huge1 = mkMsg("user", "x".repeat(8000));
    const huge2 = mkMsg("assistant", "y".repeat(8000));
    const result = await summarizeInStages({
      messages: [huge1, huge2],
      client: failingClient,
      model: "m",
      maxTokens: 300,
      maxChunkTokens: 5000,
      contextWindow: 1000,
    });
    expect(result).toContain("Summary unavailable");
  });

  it("compaction: succeeds without oversized messages (no notes appended)", async () => {
    const client = toClient({
      messages: {
        create: async () => ({ content: [{ type: "text", text: "ok" }] }),
      },
    });
    const result = await buildCompactionSummary({
      client,
      model: "m",
      messages: [mkMsg("user", "small")],
      contextWindowTokens: 200000,
    });
    expect(result).toBe("ok");
  });

  // ----- heartbeat tokens -----
  it("stripHeartbeatToken: leading token followed by whitespace then empty", () => {
    const r = stripHeartbeatToken("HEARTBEAT_OK \n  ");
    expect(r.shouldSkip).toBe(true);
    expect(r.didStrip).toBe(true);
  });

  it("stripHeartbeatToken: trailing token preceded by whitespace then empty", () => {
    const r = stripHeartbeatToken("   HEARTBEAT_OK");
    // This goes via exact match path? No, it goes via leading branch first
    expect(r.didStrip).toBe(true);
  });

  it("stripHeartbeatToken: middle-of-text token is not stripped", () => {
    const r = stripHeartbeatToken("before HEARTBEAT_OK after");
    expect(r.didStrip).toBe(false);
  });

  it("stripHeartbeatToken: leading with content", () => {
    const r = stripHeartbeatToken("HEARTBEAT_OK rest of message");
    expect(r.text).toBe("rest of message");
    expect(r.didStrip).toBe(true);
    expect(r.shouldSkip).toBe(false);
  });

  it("stripHeartbeatToken: trailing with content", () => {
    const r = stripHeartbeatToken("important info HEARTBEAT_OK");
    expect(r.text).toBe("important info");
    expect(r.didStrip).toBe(true);
  });

  it("stripHeartbeatToken: empty input shouldSkip", () => {
    expect(stripHeartbeatToken().shouldSkip).toBe(true);
    expect(stripHeartbeatToken("   ").shouldSkip).toBe(true);
  });

  it("stripHeartbeatToken: no token at all returns text", () => {
    const r = stripHeartbeatToken("plain text");
    expect(r.didStrip).toBe(false);
    expect(r.shouldSkip).toBe(false);
  });

  // ----- skills -----
  it("skill prompt includes triggers when present", async () => {
    const sm = new SkillManager(tempDir);
    sm.register({
      id: "x",
      name: "X",
      description: "desc",
      triggers: ["/x"],
      prompt: "p",
      source: "user",
    });
    const prompt = await sm.buildSkillsPrompt();
    expect(prompt).toContain("(/x)");
  });

  // ----- bootstrap files (loader.ts:47/61) -----
  it("buildBootstrapContextFiles: returns empty when input is empty", () => {
    expect(buildBootstrapContextFiles([])).toEqual([]);
  });

  it("ContextLoader: returns empty prompt when no bootstrap files at all", async () => {
    // Force buildBootstrapContextFiles to be empty by filtering with subagent session key
    // Since the loader auto-includes missing-placeholder files, we test directly
    const files = await filterBootstrapFilesForSession(
      [],
      "agent:m:subagent:1",
    );
    expect(files).toEqual([]);
  });
});
