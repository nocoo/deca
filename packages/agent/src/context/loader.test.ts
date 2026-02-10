import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ContextLoader } from "./loader.js";

describe("ContextLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-loader-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadBootstrapFiles", () => {
    it("should return files with missing=true when no bootstrap files exist", async () => {
      const loader = new ContextLoader(tempDir);
      const files = await loader.loadBootstrapFiles();
      // All standard bootstrap files are returned but marked as missing
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => f.missing)).toBe(true);
    });

    it("should load SOUL.md when it exists", async () => {
      await fs.writeFile(
        path.join(tempDir, "SOUL.md"),
        "# Personality\nBe helpful",
      );

      const loader = new ContextLoader(tempDir);
      const files = await loader.loadBootstrapFiles();

      const soulFile = files.find((f) => f.name === "SOUL.md");
      expect(soulFile).toBeDefined();
      expect(soulFile?.missing).toBe(false);
      expect(soulFile?.content).toContain("Be helpful");
    });

    it("should load multiple bootstrap files", async () => {
      await fs.writeFile(path.join(tempDir, "SOUL.md"), "Soul content");
      await fs.writeFile(path.join(tempDir, "TOOLS.md"), "Tools content");
      await fs.writeFile(path.join(tempDir, "USER.md"), "User content");

      const loader = new ContextLoader(tempDir);
      const files = await loader.loadBootstrapFiles();

      const presentFiles = files.filter((f) => !f.missing);
      expect(presentFiles.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("buildContextPrompt", () => {
    it("should include missing file placeholders when no files exist", async () => {
      const loader = new ContextLoader(tempDir);
      const prompt = await loader.buildContextPrompt();
      // Missing files are still included with [MISSING] marker
      expect(prompt).toContain("[MISSING]");
    });

    it("should build prompt with file content", async () => {
      await fs.writeFile(path.join(tempDir, "TOOLS.md"), "# Tools\n- read");

      const loader = new ContextLoader(tempDir);
      const prompt = await loader.buildContextPrompt();

      expect(prompt).toContain("TOOLS.md");
      expect(prompt).toContain("# Tools");
      expect(prompt).toContain("- read");
    });

    it("should include SOUL.md guidance when present", async () => {
      await fs.writeFile(path.join(tempDir, "SOUL.md"), "Be friendly");

      const loader = new ContextLoader(tempDir);
      const prompt = await loader.buildContextPrompt();

      expect(prompt).toContain("SOUL.md");
      expect(prompt).toContain("embody its persona and tone");
    });

    it("should respect maxChars option", async () => {
      const longContent = "x".repeat(10000);
      await fs.writeFile(path.join(tempDir, "SOUL.md"), longContent);

      const warnings: string[] = [];
      const loader = new ContextLoader(tempDir, {
        maxChars: 100,
        warn: (msg) => warnings.push(msg),
      });

      const prompt = await loader.buildContextPrompt();

      // Content should be truncated
      expect(prompt.length).toBeLessThan(longContent.length);
    });
  });

  describe("hasHeartbeatTasks", () => {
    it("should return false when HEARTBEAT.md does not exist", async () => {
      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(false);
    });

    it("should return false for empty HEARTBEAT.md", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "");

      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(false);
    });

    it("should return false for HEARTBEAT.md with only headers", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "# Tasks\n## Subtasks\n",
      );

      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(false);
    });

    it("should return false for empty checkbox items", async () => {
      await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "- [ ]\n- [x]\n");

      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(false);
    });

    it("should return true for HEARTBEAT.md with actual tasks", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "# Tasks\n- [ ] Review PR #123\n",
      );

      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(true);
    });

    it("should return true for non-checkbox content", async () => {
      await fs.writeFile(
        path.join(tempDir, "HEARTBEAT.md"),
        "Remember to check the logs daily",
      );

      const loader = new ContextLoader(tempDir);
      const hasTasks = await loader.hasHeartbeatTasks();
      expect(hasTasks).toBe(true);
    });
  });
});
