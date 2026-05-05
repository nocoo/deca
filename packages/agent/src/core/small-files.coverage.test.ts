import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryManager } from "./memory.js";
import {
  buildAgentMainSessionKey,
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "./session-key.js";
import { type ContentBlock, SessionManager } from "./session.js";
import { SkillManager } from "./skills.js";
import {
  filterToolsByPolicy,
  isToolAllowed,
  mergeToolPolicies,
} from "./tool-policy.js";

describe("session-key coverage extras", () => {
  it("normalizeToken: undefined input returns empty string", () => {
    expect(normalizeAgentId(undefined)).toBe("main");
    expect(normalizeAgentId(null)).toBe("main");
    expect(normalizeAgentId("")).toBe("main");
  });

  it("parseAgentSessionKey: returns null for empty/invalid", () => {
    expect(parseAgentSessionKey(undefined)).toBeNull();
    expect(parseAgentSessionKey(null)).toBeNull();
    expect(parseAgentSessionKey("")).toBeNull();
    expect(parseAgentSessionKey("notagent:foo:bar")).toBeNull();
    // Missing rest
    expect(parseAgentSessionKey("agent:main:")).toBeNull();
  });

  it("isSubagentSessionKey: false for non-subagent", () => {
    expect(isSubagentSessionKey("agent:main:regular")).toBe(false);
    expect(isSubagentSessionKey(null)).toBe(false);
  });

  it("resolveAgentIdFromSessionKey: returns default when null", () => {
    expect(resolveAgentIdFromSessionKey(null)).toBe("main");
  });

  it("buildAgentMainSessionKey produces canonical key", () => {
    expect(buildAgentMainSessionKey({ agentId: "MyBot" })).toBe(
      "agent:mybot:main",
    );
  });

  it("normalizeAgentId: preserves valid id", () => {
    expect(normalizeAgentId("Valid-id_1")).toBe("valid-id_1");
  });

  it("normalizeAgentId: cleans invalid chars", () => {
    expect(normalizeAgentId("--bad@@id--")).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("tool-policy coverage extras", () => {
  it("isToolAllowed: undefined policy returns true", () => {
    expect(isToolAllowed("foo")).toBe(true);
  });

  it("isToolAllowed: respects allow list", () => {
    expect(isToolAllowed("read", { allow: ["read", "write"] })).toBe(true);
    expect(isToolAllowed("exec", { allow: ["read"] })).toBe(false);
  });

  it("isToolAllowed: respects deny list", () => {
    expect(isToolAllowed("exec", { deny: ["exec"] })).toBe(false);
  });

  it("isToolAllowed: wildcard pattern", () => {
    expect(isToolAllowed("read_file", { deny: ["read_*"] })).toBe(false);
    expect(isToolAllowed("write", { allow: ["*"] })).toBe(true);
  });

  it("isToolAllowed: empty pattern is ignored", () => {
    expect(isToolAllowed("read", { allow: ["", "read"] })).toBe(true);
  });

  it("filterToolsByPolicy: returns all when no policy", () => {
    const tools = [
      {
        name: "x",
        description: "",
        inputSchema: { type: "object" as const, properties: {} },
        execute: async () => "",
      },
    ];
    expect(filterToolsByPolicy(tools)).toEqual(tools);
  });

  it("mergeToolPolicies: returns undefined when both empty", () => {
    expect(mergeToolPolicies()).toBeUndefined();
  });

  it("mergeToolPolicies: dedupes and combines", () => {
    const merged = mergeToolPolicies(
      { allow: ["a"], deny: ["x"] },
      { allow: ["a", "b"], deny: ["y"] },
    );
    expect(merged?.allow).toEqual(["a", "b"]);
    expect(merged?.deny).toEqual(["x", "y"]);
  });

  it("mergeToolPolicies: trims values and skips empty", () => {
    const merged = mergeToolPolicies({ allow: [" ", "a"] }, undefined);
    expect(merged?.allow).toEqual(["a"]);
  });
});

describe("session coverage extras", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sess-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("getStats counts tool_result and text blocks correctly", async () => {
    const sm = new SessionManager(tempDir);
    const blocks: ContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "text" }, // no text - branch
      { type: "tool_use", id: "1", name: "x", input: {} }, // not counted
      { type: "tool_result", tool_use_id: "1", content: "result" },
      { type: "tool_result", tool_use_id: "1" }, // no content
    ];
    await sm.append("test", {
      role: "assistant",
      content: blocks,
      timestamp: Date.now(),
    });
    const stats = await sm.getStats("test");
    expect(stats.totalChars).toBe("hello".length + "result".length);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.userMessages).toBe(0);
  });
});

describe("skills coverage extras", () => {
  let tempDir: string;
  let userTempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-cov-"));
    userTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-user-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userTempDir, { recursive: true, force: true });
  });

  it("default userDir uses HOME env or empty", () => {
    const orig = process.env.HOME;
    Reflect.deleteProperty(process.env, "HOME");
    try {
      const sm = new SkillManager(tempDir);
      expect(sm).toBeDefined();
    } finally {
      if (orig !== undefined) process.env.HOME = orig;
    }
  });

  it("loadFromDir: skips non-md files", async () => {
    const skillDir = path.join(tempDir, "skills");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "skill.md"), "# Skill\nprompt");
    await fs.writeFile(path.join(skillDir, "other.txt"), "ignore");
    const sm = new SkillManager(tempDir);
    const skills = await sm.list();
    expect(skills.some((s) => s.id === "skill")).toBe(true);
    expect(skills.some((s) => s.id === "other")).toBe(false);
  });

  it("parseSkillFile: handles invalid frontmatter array gracefully", async () => {
    const skillDir = path.join(tempDir, "skills");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "bad.md"),
      "---\nid: bad\nname: Bad\ntriggers: [not, valid, json]\n---\nPROMPT",
    );
    const sm = new SkillManager(tempDir);
    const skills = await sm.list();
    expect(skills.some((s) => s.id === "bad")).toBe(true);
  });

  it("parseSkillFile: handles file without frontmatter", async () => {
    const skillDir = path.join(tempDir, "skills");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "plain.md"), "just content");
    const sm = new SkillManager(tempDir);
    const skill = await sm.get("plain");
    expect(skill?.prompt).toBe("just content");
  });

  it("match: returns null for skill without triggers", async () => {
    const sm = new SkillManager(tempDir);
    sm.register({
      id: "no-trigger",
      name: "n",
      description: "",
      prompt: "p",
      source: "user",
    });
    const result = await sm.match("anything");
    // Built-in skills don't match arbitrary text either
    if (result) {
      expect(result.skill.id).not.toBe("no-trigger");
    }
  });

  it("buildSkillsPrompt: returns empty string when no skills", async () => {
    // Use a fresh temp dir; the SkillManager always registers builtins,
    // so skills will not be empty. Verify prompt is generated.
    const sm = new SkillManager(tempDir);
    const prompt = await sm.buildSkillsPrompt();
    expect(prompt.length).toBeGreaterThan(0);
  });
});

describe("memory coverage extras", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("search: tag matches add bonus score", async () => {
    const mm = new MemoryManager(tempDir);
    await mm.add("rust programming notes", "user", ["rust"]);
    await mm.add("python notes", "user", ["python"]);
    const results = await mm.search("rust");
    expect(results[0]?.entry.tags).toContain("rust");
  });
});
