import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Message } from "../core/session.js";
import { ContextLoader } from "./loader.js";
import { pruneContextMessages, resolvePruningSettings } from "./pruning.js";
import { estimateMessageChars } from "./tokens.js";

describe("context loader coverage extras", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("buildContextPrompt: includes SOUL.md hint when SOUL.md path appears in context list", async () => {
    // Bootstrap loader emits placeholders for missing files including SOUL.md,
    // so the SOUL hint is normally present. Verify when there is content present.
    await fs.writeFile(path.join(tempDir, "SOUL.md"), "personality");
    const loader = new ContextLoader(tempDir);
    const prompt = await loader.buildContextPrompt();
    expect(prompt).toContain("SOUL.md");
    expect(prompt).toContain("embody its persona");
  });

  it("buildContextPrompt: includes some context content even when only AGENTS.md", async () => {
    await fs.writeFile(path.join(tempDir, "AGENTS.md"), "context");
    const loader = new ContextLoader(tempDir);
    const prompt = await loader.buildContextPrompt();
    expect(prompt).toContain("AGENTS.md");
  });

  it("hasHeartbeatTasks: true when content has actionable lines", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ] do this");
    const loader = new ContextLoader(tempDir);
    expect(await loader.hasHeartbeatTasks()).toBe(true);
  });

  it("hasHeartbeatTasks: false for empty file", async () => {
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "");
    const loader = new ContextLoader(tempDir);
    expect(await loader.hasHeartbeatTasks()).toBe(false);
  });

  it("hasHeartbeatTasks: false when file missing", async () => {
    const loader = new ContextLoader(tempDir);
    expect(await loader.hasHeartbeatTasks()).toBe(false);
  });
});

describe("pruning coverage extras", () => {
  function mkMsg(role: "user" | "assistant", content: string): Message {
    return { role, content, timestamp: Date.now() };
  }

  it("resolvePruningSettings: handles undefined input", () => {
    const s = resolvePruningSettings(undefined);
    expect(s.maxHistoryShare).toBeGreaterThan(0);
  });

  it("resolvePruningSettings: handles invalid maxHistoryShare", () => {
    const s = resolvePruningSettings({ maxHistoryShare: Number.NaN });
    expect(s.maxHistoryShare).toBe(0.5);
  });

  it("resolvePruningSettings: clamps maxHistoryShare to [0,1]", () => {
    expect(resolvePruningSettings({ maxHistoryShare: 5 }).maxHistoryShare).toBe(
      1,
    );
    expect(
      resolvePruningSettings({ maxHistoryShare: -1 }).maxHistoryShare,
    ).toBe(0);
  });

  it("resolvePruningSettings: handles invalid keepLastAssistants", () => {
    const s = resolvePruningSettings({
      keepLastAssistants: Number.POSITIVE_INFINITY,
    });
    expect(s.keepLastAssistants).toBe(3);
  });

  it("resolvePruningSettings: handles invalid softTrim values", () => {
    const s = resolvePruningSettings({
      softTrim: {
        maxChars: Number.NaN,
        headChars: Number.POSITIVE_INFINITY,
        tailChars: Number.NaN,
      },
    });
    expect(s.softTrim.maxChars).toBe(4000);
  });

  it("softTrim: tool_result content not string is skipped", () => {
    // Build a message with tool_result whose content is undefined (not string)
    const messages: Message[] = [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "1" }],
        timestamp: Date.now(),
      },
    ];
    const result = pruneContextMessages({
      messages,
      contextWindowTokens: 1000,
      settings: { softTrim: { maxChars: 10, headChars: 3, tailChars: 3 } },
    });
    expect(result.trimmedToolResults).toBe(0);
  });

  it("softTrim: head+tail >= rawLen leaves block alone", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "1",
            content: "abc", // length 3
          },
        ],
        timestamp: Date.now(),
      },
    ];
    const result = pruneContextMessages({
      messages,
      contextWindowTokens: 10000,
      settings: { softTrim: { maxChars: 1, headChars: 5, tailChars: 5 } },
    });
    expect(result.trimmedToolResults).toBe(0);
  });

  it("findAssistantCutoffIndex: keepLastAssistants=0 returns full length", () => {
    const messages: Message[] = [
      mkMsg("user", "x".repeat(5000)),
      mkMsg("assistant", "y".repeat(5000)),
      mkMsg("user", "z".repeat(5000)),
    ];
    const result = pruneContextMessages({
      messages,
      contextWindowTokens: 100,
      settings: { keepLastAssistants: 0, maxHistoryShare: 0.5 },
    });
    // With keepLastAssistants=0, no protected messages
    expect(result.droppedMessages.length).toBeGreaterThan(0);
  });

  it("estimateMessageChars: counts string content", () => {
    expect(estimateMessageChars(mkMsg("user", "hello"))).toBe(5);
  });
});
