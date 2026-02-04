import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  builtinTools,
  editTool,
  execTool,
  grepTool,
  listTool,
  memoryGetTool,
  memorySearchTool,
  readTool,
  sessionsSpawnTool,
  writeTool,
} from "./builtin.js";
import type { ToolContext } from "./types.js";

describe("builtin tools", () => {
  let tempDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tools-test-"));
    ctx = {
      workspaceDir: tempDir,
      sessionKey: "test-session",
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("builtinTools export", () => {
    it("should export all 9 tools", () => {
      expect(builtinTools.length).toBe(9);
      const names = builtinTools.map((t) => t.name);
      expect(names).toContain("read");
      expect(names).toContain("write");
      expect(names).toContain("edit");
      expect(names).toContain("exec");
      expect(names).toContain("list");
      expect(names).toContain("grep");
      expect(names).toContain("memory_search");
      expect(names).toContain("memory_get");
      expect(names).toContain("sessions_spawn");
    });
  });

  describe("readTool", () => {
    it("should have correct metadata", () => {
      expect(readTool.name).toBe("read");
      expect(readTool.description).toContain("读取");
      expect(readTool.inputSchema.required).toContain("file_path");
    });

    it("should read file with line numbers", async () => {
      await fs.writeFile(path.join(tempDir, "test.txt"), "line1\nline2\nline3");

      const result = await readTool.execute({ file_path: "test.txt" }, ctx);

      expect(result).toContain("1\tline1");
      expect(result).toContain("2\tline2");
      expect(result).toContain("3\tline3");
    });

    it("should respect limit parameter", async () => {
      await fs.writeFile(
        path.join(tempDir, "test.txt"),
        "line1\nline2\nline3\nline4\nline5",
      );

      const result = await readTool.execute(
        { file_path: "test.txt", limit: 2 },
        ctx,
      );

      expect(result).toContain("1\tline1");
      expect(result).toContain("2\tline2");
      expect(result).not.toContain("3\t");
    });

    it("should return error for non-existent file", async () => {
      const result = await readTool.execute(
        { file_path: "nonexistent.txt" },
        ctx,
      );

      expect(result).toContain("错误");
    });
  });

  describe("writeTool", () => {
    it("should have correct metadata", () => {
      expect(writeTool.name).toBe("write");
      expect(writeTool.inputSchema.required).toContain("file_path");
      expect(writeTool.inputSchema.required).toContain("content");
    });

    it("should write file", async () => {
      const result = await writeTool.execute(
        { file_path: "new.txt", content: "hello world" },
        ctx,
      );

      expect(result).toContain("成功");

      const content = await fs.readFile(path.join(tempDir, "new.txt"), "utf-8");
      expect(content).toBe("hello world");
    });

    it("should create parent directories", async () => {
      await writeTool.execute(
        { file_path: "nested/dir/file.txt", content: "nested" },
        ctx,
      );

      const content = await fs.readFile(
        path.join(tempDir, "nested/dir/file.txt"),
        "utf-8",
      );
      expect(content).toBe("nested");
    });

    it("should overwrite existing file", async () => {
      await fs.writeFile(path.join(tempDir, "exist.txt"), "old");

      await writeTool.execute({ file_path: "exist.txt", content: "new" }, ctx);

      const content = await fs.readFile(
        path.join(tempDir, "exist.txt"),
        "utf-8",
      );
      expect(content).toBe("new");
    });
  });

  describe("editTool", () => {
    it("should have correct metadata", () => {
      expect(editTool.name).toBe("edit");
      expect(editTool.inputSchema.required).toContain("file_path");
      expect(editTool.inputSchema.required).toContain("old_string");
      expect(editTool.inputSchema.required).toContain("new_string");
    });

    it("should replace text in file", async () => {
      await fs.writeFile(path.join(tempDir, "edit.txt"), "hello world");

      const result = await editTool.execute(
        { file_path: "edit.txt", old_string: "world", new_string: "universe" },
        ctx,
      );

      expect(result).toContain("成功");

      const content = await fs.readFile(
        path.join(tempDir, "edit.txt"),
        "utf-8",
      );
      expect(content).toBe("hello universe");
    });

    it("should only replace first match", async () => {
      await fs.writeFile(path.join(tempDir, "edit.txt"), "foo foo foo");

      await editTool.execute(
        { file_path: "edit.txt", old_string: "foo", new_string: "bar" },
        ctx,
      );

      const content = await fs.readFile(
        path.join(tempDir, "edit.txt"),
        "utf-8",
      );
      expect(content).toBe("bar foo foo");
    });

    it("should return error when text not found", async () => {
      await fs.writeFile(path.join(tempDir, "edit.txt"), "hello");

      const result = await editTool.execute(
        { file_path: "edit.txt", old_string: "nonexistent", new_string: "new" },
        ctx,
      );

      expect(result).toContain("错误");
      expect(result).toContain("未找到");
    });

    it("should return error for non-existent file", async () => {
      const result = await editTool.execute(
        {
          file_path: "nonexistent.txt",
          old_string: "old",
          new_string: "new",
        },
        ctx,
      );

      expect(result).toContain("错误");
    });
  });

  describe("execTool", () => {
    it("should have correct metadata", () => {
      expect(execTool.name).toBe("exec");
      expect(execTool.inputSchema.required).toContain("command");
    });

    it("should execute command and return stdout", async () => {
      const result = await execTool.execute({ command: "echo hello" }, ctx);

      expect(result.trim()).toBe("hello");
    });

    it("should include stderr in result", async () => {
      const result = await execTool.execute({ command: "echo error >&2" }, ctx);

      expect(result).toContain("error");
    });

    it("should return error for invalid command", async () => {
      const result = await execTool.execute(
        { command: "nonexistent_command_12345" },
        ctx,
      );

      expect(result).toContain("错误");
    });

    it("should execute in workspace directory", async () => {
      await fs.writeFile(path.join(tempDir, "marker.txt"), "found");

      const result = await execTool.execute({ command: "cat marker.txt" }, ctx);

      expect(result.trim()).toBe("found");
    });
  });

  describe("listTool", () => {
    it("should have correct metadata", () => {
      expect(listTool.name).toBe("list");
    });

    it("should list directory contents", async () => {
      await fs.writeFile(path.join(tempDir, "file1.txt"), "");
      await fs.writeFile(path.join(tempDir, "file2.ts"), "");
      await fs.mkdir(path.join(tempDir, "subdir"));

      const result = await listTool.execute({}, ctx);

      expect(result).toContain("📄 file1.txt");
      expect(result).toContain("📄 file2.ts");
      expect(result).toContain("📁 subdir");
    });

    it("should filter by pattern", async () => {
      await fs.writeFile(path.join(tempDir, "file1.txt"), "");
      await fs.writeFile(path.join(tempDir, "file2.ts"), "");

      const result = await listTool.execute({ pattern: "*.ts" }, ctx);

      expect(result).toContain("file2.ts");
      expect(result).not.toContain("file1.txt");
    });

    it("should list subdirectory", async () => {
      await fs.mkdir(path.join(tempDir, "subdir"));
      await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "");

      const result = await listTool.execute({ path: "subdir" }, ctx);

      expect(result).toContain("nested.txt");
    });

    it("should return message for empty directory", async () => {
      const result = await listTool.execute({}, ctx);

      expect(result).toBe("目录为空");
    });

    it("should return error for non-existent directory", async () => {
      const result = await listTool.execute({ path: "nonexistent" }, ctx);

      expect(result).toContain("错误");
    });
  });

  describe("grepTool", () => {
    it("should have correct metadata", () => {
      expect(grepTool.name).toBe("grep");
      expect(grepTool.inputSchema.required).toContain("pattern");
    });

    it("should search for pattern in files", async () => {
      await fs.writeFile(
        path.join(tempDir, "search.ts"),
        "function hello() {\n  return 'world';\n}",
      );

      const result = await grepTool.execute({ pattern: "hello" }, ctx);

      expect(result).toContain("hello");
      expect(result).toContain("search.ts");
    });

    it("should return message when no match", async () => {
      await fs.writeFile(path.join(tempDir, "search.ts"), "some content");

      const result = await grepTool.execute({ pattern: "nonexistent" }, ctx);

      expect(result).toBe("未找到匹配");
    });

    it("should return message for empty search", async () => {
      const result = await grepTool.execute({ pattern: "anything" }, ctx);

      expect(result).toBe("未找到匹配");
    });
  });

  describe("memorySearchTool", () => {
    it("should have correct metadata", () => {
      expect(memorySearchTool.name).toBe("memory_search");
      expect(memorySearchTool.inputSchema.required).toContain("query");
    });

    it("should return message when memory not enabled", async () => {
      const result = await memorySearchTool.execute({ query: "test" }, ctx);

      expect(result).toBe("记忆系统未启用");
    });

    it("should search memory when enabled", async () => {
      const mockMemory = {
        search: async () => [
          {
            entry: { id: "mem-1", content: "test", tags: ["tag1"] },
            score: 0.95,
            snippet: "test snippet",
          },
        ],
        getById: async () => null,
      };

      const ctxWithMemory = { ...ctx, memory: mockMemory as never };
      const result = await memorySearchTool.execute(
        { query: "test" },
        ctxWithMemory,
      );

      expect(result).toContain("mem-1");
      expect(result).toContain("0.95");
      expect(result).toContain("tag1");
    });

    it("should return message when no results", async () => {
      const mockMemory = {
        search: async () => [],
        getById: async () => null,
      };

      const ctxWithMemory = { ...ctx, memory: mockMemory as never };
      const result = await memorySearchTool.execute(
        { query: "test" },
        ctxWithMemory,
      );

      expect(result).toBe("未找到相关记忆");
    });

    it("should call onMemorySearch callback", async () => {
      const mockMemory = {
        search: async () => [
          {
            entry: { id: "mem-1", content: "test", tags: [] },
            score: 0.9,
            snippet: "test",
          },
        ],
        getById: async () => null,
      };

      let callbackResults: unknown[] = [];
      const ctxWithCallback = {
        ...ctx,
        memory: mockMemory as never,
        onMemorySearch: (results: unknown[]) => {
          callbackResults = results;
        },
      };

      await memorySearchTool.execute({ query: "test" }, ctxWithCallback);

      expect(callbackResults.length).toBe(1);
    });
  });

  describe("memoryGetTool", () => {
    it("should have correct metadata", () => {
      expect(memoryGetTool.name).toBe("memory_get");
      expect(memoryGetTool.inputSchema.required).toContain("id");
    });

    it("should return message when memory not enabled", async () => {
      const result = await memoryGetTool.execute({ id: "mem-1" }, ctx);

      expect(result).toBe("记忆系统未启用");
    });

    it("should get memory by id", async () => {
      const mockMemory = {
        search: async () => [],
        getById: async (id: string) => ({
          id,
          content: "Full memory content",
          tags: [],
        }),
      };

      const ctxWithMemory = { ...ctx, memory: mockMemory as never };
      const result = await memoryGetTool.execute(
        { id: "mem-1" },
        ctxWithMemory,
      );

      expect(result).toContain("mem-1");
      expect(result).toContain("Full memory content");
    });

    it("should return message when memory not found", async () => {
      const mockMemory = {
        search: async () => [],
        getById: async () => null,
      };

      const ctxWithMemory = { ...ctx, memory: mockMemory as never };
      const result = await memoryGetTool.execute(
        { id: "nonexistent" },
        ctxWithMemory,
      );

      expect(result).toContain("未找到记忆");
    });
  });

  describe("sessionsSpawnTool", () => {
    it("should have correct metadata", () => {
      expect(sessionsSpawnTool.name).toBe("sessions_spawn");
      expect(sessionsSpawnTool.inputSchema.required).toContain("task");
    });

    it("should return message when subagent not enabled", async () => {
      const result = await sessionsSpawnTool.execute(
        { task: "test task" },
        ctx,
      );

      expect(result).toBe("子代理系统未启用");
    });

    it("should spawn subagent when enabled", async () => {
      const mockSpawn = async (input: {
        task: string;
        label?: string;
        cleanup?: string;
      }) => ({
        runId: "run-123",
        sessionKey: "session-456",
        task: input.task,
      });

      const ctxWithSpawn = {
        ...ctx,
        spawnSubagent: mockSpawn,
      };

      const result = await sessionsSpawnTool.execute(
        { task: "test task", label: "test" },
        ctxWithSpawn,
      );

      expect(result).toContain("run-123");
      expect(result).toContain("session-456");
    });
  });
});
