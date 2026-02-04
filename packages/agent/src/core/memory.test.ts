import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MemoryManager } from "./memory.js";

describe("MemoryManager", () => {
  let tempDir: string;
  let memoryManager: MemoryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-test-"));
    memoryManager = new MemoryManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("add and getById", () => {
    it("should add memory and return id", async () => {
      const id = await memoryManager.add("Test memory content", "user");
      expect(id).toMatch(/^mem_\d+_[a-z0-9]+$/);
    });

    it("should retrieve memory by id", async () => {
      const id = await memoryManager.add("Hello world", "agent", ["greeting"]);
      const entry = await memoryManager.getById(id);

      expect(entry).toBeDefined();
      expect(entry?.content).toBe("Hello world");
      expect(entry?.source).toBe("agent");
      expect(entry?.tags).toEqual(["greeting"]);
    });

    it("should return null for non-existent id", async () => {
      const entry = await memoryManager.getById("non-existent");
      expect(entry).toBeNull();
    });

    it("should persist memory to disk", async () => {
      await memoryManager.add("Persisted content", "system");

      // Create new instance to verify persistence
      const newManager = new MemoryManager(tempDir);
      const entries = await newManager.getAll();

      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe("Persisted content");
    });
  });

  describe("search", () => {
    it("should find memories by keyword", async () => {
      await memoryManager.add("The quick brown fox", "user");
      await memoryManager.add("A lazy dog sleeps", "user");
      await memoryManager.add("Fox jumps over", "user");

      const results = await memoryManager.search("fox");

      expect(results).toHaveLength(2);
      expect(results[0].entry.content.toLowerCase()).toContain("fox");
    });

    it("should return empty array when no matches", async () => {
      await memoryManager.add("Hello world", "user");

      const results = await memoryManager.search("xyz123");

      expect(results).toEqual([]);
    });

    it("should score tag matches higher", async () => {
      await memoryManager.add("Some content about topics", "user", ["project"]);
      await memoryManager.add("Project details here", "user");

      const results = await memoryManager.search("project");

      // Both should match
      expect(results.length).toBeGreaterThanOrEqual(1);
      // First result should have tag match (higher score)
      if (results.length >= 2) {
        expect(results[0].entry.tags).toContain("project");
      }
    });

    it("should limit results", async () => {
      for (let i = 0; i < 10; i++) {
        await memoryManager.add(`Memory item ${i}`, "user");
      }

      const results = await memoryManager.search("memory", 3);

      expect(results).toHaveLength(3);
    });

    it("should include snippet in results", async () => {
      const longContent = `Start ${"x".repeat(300)} end`;
      await memoryManager.add(longContent, "user");

      const results = await memoryManager.search("start");

      expect(results[0].snippet.length).toBeLessThanOrEqual(200);
      expect(results[0].snippet).toContain("Start");
    });

    it("should handle multi-word queries", async () => {
      await memoryManager.add("The quick brown fox", "user");
      await memoryManager.add("A quick test", "user");
      await memoryManager.add("Brown sugar", "user");

      const results = await memoryManager.search("quick brown");

      // "quick brown fox" matches both terms, should score highest
      expect(results[0].entry.content).toBe("The quick brown fox");
    });
  });

  describe("getAll", () => {
    it("should return all memories", async () => {
      await memoryManager.add("Memory 1", "user");
      await memoryManager.add("Memory 2", "agent");
      await memoryManager.add("Memory 3", "system");

      const entries = await memoryManager.getAll();

      expect(entries).toHaveLength(3);
    });

    it("should return empty array when no memories", async () => {
      const entries = await memoryManager.getAll();
      expect(entries).toEqual([]);
    });
  });

  describe("clear", () => {
    it("should remove all memories", async () => {
      await memoryManager.add("Memory 1", "user");
      await memoryManager.add("Memory 2", "user");

      await memoryManager.clear();

      const entries = await memoryManager.getAll();
      expect(entries).toEqual([]);
    });

    it("should persist cleared state", async () => {
      await memoryManager.add("Memory 1", "user");
      await memoryManager.clear();

      const newManager = new MemoryManager(tempDir);
      const entries = await newManager.getAll();

      expect(entries).toEqual([]);
    });
  });

  describe("syncFromFiles", () => {
    it("should return 0 when files directory does not exist", async () => {
      const synced = await memoryManager.syncFromFiles();
      expect(synced).toBe(0);
    });

    it("should sync .md files from files directory", async () => {
      const filesDir = path.join(tempDir, "files");
      await fs.mkdir(filesDir, { recursive: true });
      await fs.writeFile(path.join(filesDir, "note1.md"), "Note 1 content");
      await fs.writeFile(path.join(filesDir, "note2.md"), "Note 2 content");

      const synced = await memoryManager.syncFromFiles();

      expect(synced).toBe(2);

      const entries = await memoryManager.getAll();
      expect(entries).toHaveLength(2);
      expect(entries.some((e) => e.tags.includes("file:note1.md"))).toBe(true);
    });

    it("should update existing file-based memories", async () => {
      const filesDir = path.join(tempDir, "files");
      await fs.mkdir(filesDir, { recursive: true });
      await fs.writeFile(path.join(filesDir, "note.md"), "Original content");

      await memoryManager.syncFromFiles();

      // Update file content
      await fs.writeFile(path.join(filesDir, "note.md"), "Updated content");

      await memoryManager.syncFromFiles();

      const entries = await memoryManager.getAll();
      const noteEntry = entries.find((e) => e.tags.includes("file:note.md"));

      expect(noteEntry?.content).toBe("Updated content");
    });

    it("should ignore non-.md files", async () => {
      const filesDir = path.join(tempDir, "files");
      await fs.mkdir(filesDir, { recursive: true });
      await fs.writeFile(path.join(filesDir, "note.md"), "MD content");
      await fs.writeFile(path.join(filesDir, "data.txt"), "TXT content");
      await fs.writeFile(path.join(filesDir, "script.js"), "JS content");

      const synced = await memoryManager.syncFromFiles();

      expect(synced).toBe(1);
    });
  });
});
