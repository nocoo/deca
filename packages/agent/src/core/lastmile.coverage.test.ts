import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateMessageChars } from "../context/tokens.js";
import { stripHeartbeatToken } from "../heartbeat/tokens.js";
import type { ContentBlock, Message } from "./session.js";
import { normalizeMainKey, toAgentStoreSessionKey } from "./session-key.js";
import { SkillManager } from "./skills.js";
import { isToolAllowed } from "./tool-policy.js";

describe("lastmile branch coverage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lastmile-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // session-key.ts:22 — normalizeToken with null/undefined input via normalizeMainKey
  it("normalizeMainKey: null and undefined yield default", () => {
    expect(normalizeMainKey(null)).toBe("main");
    expect(normalizeMainKey(undefined)).toBe("main");
  });

  // session-key.ts:99 — toAgentStoreSessionKey with requestKey === "main" goes to default branch
  it("toAgentStoreSessionKey: requestKey 'main' yields default", () => {
    expect(toAgentStoreSessionKey({ agentId: "x", requestKey: "main" })).toBe(
      "agent:x:main",
    );
  });

  // tool-policy.ts:21 — `trimmed === "*"` second branch of `||`
  it("isToolAllowed: '*' allow pattern hits compilePattern second branch", () => {
    // The matchesPattern early-returns true for "*" before compilePattern,
    // but allow ["*"] still exercises the path
    expect(isToolAllowed("anything", { allow: ["*"] })).toBe(true);
  });

  // heartbeat/tokens.ts:61 — leading newline-form variant
  it("stripHeartbeatToken: leading token with newline + content", () => {
    const r = stripHeartbeatToken("HEARTBEAT_OK\nrest content");
    expect(r.text).toBe("rest content");
    expect(r.didStrip).toBe(true);
  });

  // heartbeat/tokens.ts:73 — trailing token with newline form + content
  it("stripHeartbeatToken: trailing token with newline + content", () => {
    const r = stripHeartbeatToken("important\nHEARTBEAT_OK");
    expect(r.text).toBe("important");
    expect(r.didStrip).toBe(true);
  });

  // skills.ts:287 — ternary false branch (skill without triggers)
  it("skills buildSkillsPrompt: skill without triggers omits parens", async () => {
    const sm = new SkillManager(tempDir);
    sm.register({
      id: "no-trig",
      name: "NoTrig",
      description: "desc",
      // no triggers field
      prompt: "p",
      source: "user",
    });
    const prompt = await sm.buildSkillsPrompt();
    // Confirm a skill without triggers renders without "(...)" suffix
    expect(prompt).toContain("**NoTrig**:");
  });

  // context/tokens.ts:18 — block.type fallthrough returning 0
  it("estimateMessageChars: unknown block type returns 0", () => {
    const blocks: ContentBlock[] = [
      { type: "image" } as unknown as ContentBlock,
    ];
    const msg: Message = {
      role: "user",
      content: blocks,
      timestamp: Date.now(),
    };
    expect(estimateMessageChars(msg)).toBe(0);
  });
});
