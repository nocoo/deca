import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type BootstrapFile,
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_BOOTSTRAP_MAX_CHARS,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
  buildBootstrapContextFiles,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  resolveBootstrapMaxChars,
} from "./bootstrap.js";

describe("bootstrap", () => {
  describe("resolveBootstrapMaxChars", () => {
    it("should return default when undefined", () => {
      expect(resolveBootstrapMaxChars(undefined)).toBe(
        DEFAULT_BOOTSTRAP_MAX_CHARS,
      );
    });

    it("should return default when not a number", () => {
      expect(resolveBootstrapMaxChars("100" as unknown as number)).toBe(
        DEFAULT_BOOTSTRAP_MAX_CHARS,
      );
    });

    it("should return default when NaN", () => {
      expect(resolveBootstrapMaxChars(Number.NaN)).toBe(
        DEFAULT_BOOTSTRAP_MAX_CHARS,
      );
    });

    it("should return default when Infinity", () => {
      expect(resolveBootstrapMaxChars(Number.POSITIVE_INFINITY)).toBe(
        DEFAULT_BOOTSTRAP_MAX_CHARS,
      );
    });

    it("should return default when zero", () => {
      expect(resolveBootstrapMaxChars(0)).toBe(DEFAULT_BOOTSTRAP_MAX_CHARS);
    });

    it("should return default when negative", () => {
      expect(resolveBootstrapMaxChars(-100)).toBe(DEFAULT_BOOTSTRAP_MAX_CHARS);
    });

    it("should return floored value when positive float", () => {
      expect(resolveBootstrapMaxChars(100.9)).toBe(100);
    });

    it("should return value when positive integer", () => {
      expect(resolveBootstrapMaxChars(5000)).toBe(5000);
    });
  });

  describe("filterBootstrapFilesForSession", () => {
    const mockFiles: BootstrapFile[] = [
      {
        name: DEFAULT_AGENTS_FILENAME,
        path: "/test/AGENTS.md",
        missing: false,
      },
      { name: DEFAULT_SOUL_FILENAME, path: "/test/SOUL.md", missing: false },
      { name: DEFAULT_TOOLS_FILENAME, path: "/test/TOOLS.md", missing: false },
      {
        name: DEFAULT_IDENTITY_FILENAME,
        path: "/test/IDENTITY.md",
        missing: false,
      },
      { name: DEFAULT_USER_FILENAME, path: "/test/USER.md", missing: false },
    ];

    it("should return all files when no session key", () => {
      const result = filterBootstrapFilesForSession(mockFiles);
      expect(result).toEqual(mockFiles);
    });

    it("should return all files when session key is not subagent", () => {
      const result = filterBootstrapFilesForSession(
        mockFiles,
        "session-abc123",
      );
      expect(result).toEqual(mockFiles);
    });

    it("should filter to allowlist for subagent session", () => {
      // Subagent session key format: agent:<agentId>:subagent:<id>
      const result = filterBootstrapFilesForSession(
        mockFiles,
        "agent:main:subagent:task123",
      );

      expect(result.length).toBe(2);
      expect(result.map((f) => f.name)).toContain(DEFAULT_AGENTS_FILENAME);
      expect(result.map((f) => f.name)).toContain(DEFAULT_TOOLS_FILENAME);
      expect(result.map((f) => f.name)).not.toContain(DEFAULT_SOUL_FILENAME);
    });
  });

  describe("buildBootstrapContextFiles", () => {
    it("should return empty array for empty input", () => {
      const result = buildBootstrapContextFiles([]);
      expect(result).toEqual([]);
    });

    it("should mark missing files", () => {
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          missing: true,
        },
      ];

      const result = buildBootstrapContextFiles(files);

      expect(result.length).toBe(1);
      expect(result[0].path).toBe(DEFAULT_AGENTS_FILENAME);
      expect(result[0].content).toContain("[MISSING]");
      expect(result[0].content).toContain("/test/AGENTS.md");
    });

    it("should include file content", () => {
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          content: "# Agents\nSome content here",
          missing: false,
        },
      ];

      const result = buildBootstrapContextFiles(files);

      expect(result.length).toBe(1);
      expect(result[0].content).toBe("# Agents\nSome content here");
    });

    it("should skip files with empty content", () => {
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          content: "   ",
          missing: false,
        },
      ];

      const result = buildBootstrapContextFiles(files);

      expect(result.length).toBe(0);
    });

    it("should truncate large files", () => {
      const largeContent = "x".repeat(30000);
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          content: largeContent,
          missing: false,
        },
      ];

      let warnMessage = "";
      const result = buildBootstrapContextFiles(files, {
        maxChars: 1000,
        warn: (msg) => {
          warnMessage = msg;
        },
      });

      expect(result.length).toBe(1);
      expect(result[0].content.length).toBeLessThan(largeContent.length);
      expect(result[0].content).toContain("truncated");
      expect(warnMessage).toContain("30000 chars");
      expect(warnMessage).toContain("limit 1000");
    });

    it("should not truncate files within limit", () => {
      const content = "Short content";
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          content,
          missing: false,
        },
      ];

      let warned = false;
      const result = buildBootstrapContextFiles(files, {
        warn: () => {
          warned = true;
        },
      });

      expect(result.length).toBe(1);
      expect(result[0].content).toBe(content);
      expect(warned).toBe(false);
    });

    it("should handle undefined content for non-missing file", () => {
      const files: BootstrapFile[] = [
        {
          name: DEFAULT_AGENTS_FILENAME,
          path: "/test/AGENTS.md",
          content: undefined,
          missing: false,
        },
      ];

      const result = buildBootstrapContextFiles(files);

      // Empty content should be skipped
      expect(result.length).toBe(0);
    });
  });

  describe("loadWorkspaceBootstrapFiles", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-test-"));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it("should return all files as missing when directory is empty", async () => {
      const result = await loadWorkspaceBootstrapFiles(tempDir);

      // Should have entries for all standard bootstrap files
      expect(result.length).toBeGreaterThanOrEqual(7);
      expect(result.every((f) => f.missing)).toBe(true);
    });

    it("should load existing AGENTS.md file", async () => {
      const agentsPath = path.join(tempDir, DEFAULT_AGENTS_FILENAME);
      await fs.writeFile(agentsPath, "# Agents Config");

      const result = await loadWorkspaceBootstrapFiles(tempDir);

      const agentsFile = result.find((f) => f.name === DEFAULT_AGENTS_FILENAME);
      expect(agentsFile).toBeDefined();
      expect(agentsFile?.missing).toBe(false);
      expect(agentsFile?.content).toBe("# Agents Config");
    });

    it("should load multiple bootstrap files", async () => {
      await fs.writeFile(
        path.join(tempDir, DEFAULT_AGENTS_FILENAME),
        "# Agents",
      );
      await fs.writeFile(path.join(tempDir, DEFAULT_SOUL_FILENAME), "# Soul");
      await fs.writeFile(path.join(tempDir, DEFAULT_TOOLS_FILENAME), "# Tools");

      const result = await loadWorkspaceBootstrapFiles(tempDir);

      const existingFiles = result.filter((f) => !f.missing);
      expect(existingFiles.length).toBe(3);
    });

    it("should include MEMORY.md when present", async () => {
      await fs.writeFile(
        path.join(tempDir, DEFAULT_MEMORY_FILENAME),
        "# Memory",
      );

      const result = await loadWorkspaceBootstrapFiles(tempDir);

      const memoryFile = result.find((f) => f.name === DEFAULT_MEMORY_FILENAME);
      expect(memoryFile).toBeDefined();
      expect(memoryFile?.missing).toBe(false);
      expect(memoryFile?.content).toBe("# Memory");
    });

    it("should resolve paths correctly", async () => {
      await fs.writeFile(
        path.join(tempDir, DEFAULT_AGENTS_FILENAME),
        "content",
      );

      const result = await loadWorkspaceBootstrapFiles(tempDir);

      const agentsFile = result.find((f) => f.name === DEFAULT_AGENTS_FILENAME);
      expect(agentsFile?.path).toBe(
        path.join(path.resolve(tempDir), DEFAULT_AGENTS_FILENAME),
      );
    });

    it("should handle all standard bootstrap file types", async () => {
      const result = await loadWorkspaceBootstrapFiles(tempDir);

      const fileNames = result.map((f) => f.name);
      expect(fileNames).toContain(DEFAULT_AGENTS_FILENAME);
      expect(fileNames).toContain(DEFAULT_SOUL_FILENAME);
      expect(fileNames).toContain(DEFAULT_TOOLS_FILENAME);
      expect(fileNames).toContain(DEFAULT_IDENTITY_FILENAME);
      expect(fileNames).toContain(DEFAULT_USER_FILENAME);
      expect(fileNames).toContain(DEFAULT_HEARTBEAT_FILENAME);
      expect(fileNames).toContain(DEFAULT_BOOTSTRAP_FILENAME);
    });

    describe("workspace/ subdirectory resolution", () => {
      it("should load files from workspace/ subdirectory when it contains SOUL.md", async () => {
        const workspaceSubdir = path.join(tempDir, "workspace");
        await fs.mkdir(workspaceSubdir);
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_SOUL_FILENAME),
          "# Soul from workspace/",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_AGENTS_FILENAME),
          "# Agents from workspace/",
        );

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        const soulFile = result.find((f) => f.name === DEFAULT_SOUL_FILENAME);
        expect(soulFile?.missing).toBe(false);
        expect(soulFile?.content).toBe("# Soul from workspace/");
        expect(soulFile?.path).toBe(
          path.join(workspaceSubdir, DEFAULT_SOUL_FILENAME),
        );

        const agentsFile = result.find(
          (f) => f.name === DEFAULT_AGENTS_FILENAME,
        );
        expect(agentsFile?.missing).toBe(false);
        expect(agentsFile?.content).toBe("# Agents from workspace/");
      });

      it("should prefer workspace/ over root when both have files", async () => {
        // Put AGENTS.md in root
        await fs.writeFile(
          path.join(tempDir, DEFAULT_AGENTS_FILENAME),
          "# Root AGENTS",
        );

        // Put SOUL.md and AGENTS.md in workspace/
        const workspaceSubdir = path.join(tempDir, "workspace");
        await fs.mkdir(workspaceSubdir);
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_SOUL_FILENAME),
          "# Workspace SOUL",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_AGENTS_FILENAME),
          "# Workspace AGENTS",
        );

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        // Should load from workspace/, NOT from root
        const agentsFile = result.find(
          (f) => f.name === DEFAULT_AGENTS_FILENAME,
        );
        expect(agentsFile?.content).toBe("# Workspace AGENTS");
        expect(agentsFile?.path).toContain("workspace");
      });

      it("should fall back to root when workspace/ has no probe files", async () => {
        // Put AGENTS.md only in root
        await fs.writeFile(
          path.join(tempDir, DEFAULT_AGENTS_FILENAME),
          "# Root AGENTS",
        );

        // Create empty workspace/ subdirectory
        const workspaceSubdir = path.join(tempDir, "workspace");
        await fs.mkdir(workspaceSubdir);

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        const agentsFile = result.find(
          (f) => f.name === DEFAULT_AGENTS_FILENAME,
        );
        expect(agentsFile?.content).toBe("# Root AGENTS");
        expect(agentsFile?.path).toBe(
          path.join(path.resolve(tempDir), DEFAULT_AGENTS_FILENAME),
        );
      });

      it("should fall back to root when workspace/ does not exist", async () => {
        await fs.writeFile(
          path.join(tempDir, DEFAULT_SOUL_FILENAME),
          "# Root SOUL",
        );

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        const soulFile = result.find((f) => f.name === DEFAULT_SOUL_FILENAME);
        expect(soulFile?.content).toBe("# Root SOUL");
        expect(soulFile?.path).toBe(
          path.join(path.resolve(tempDir), DEFAULT_SOUL_FILENAME),
        );
      });

      it("should load all workspace/ files when IDENTITY.md triggers probe", async () => {
        // Only IDENTITY.md in workspace/ (no SOUL.md, no AGENTS.md)
        const workspaceSubdir = path.join(tempDir, "workspace");
        await fs.mkdir(workspaceSubdir);
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_IDENTITY_FILENAME),
          "# Identity",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_TOOLS_FILENAME),
          "# Tools",
        );

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        const identityFile = result.find(
          (f) => f.name === DEFAULT_IDENTITY_FILENAME,
        );
        expect(identityFile?.missing).toBe(false);
        expect(identityFile?.content).toBe("# Identity");

        const toolsFile = result.find((f) => f.name === DEFAULT_TOOLS_FILENAME);
        expect(toolsFile?.missing).toBe(false);
        expect(toolsFile?.content).toBe("# Tools");
      });

      it("should match the real project layout: root has AGENTS.md, workspace/ has all persona files", async () => {
        // Simulate the exact Deca project layout
        await fs.writeFile(
          path.join(tempDir, DEFAULT_AGENTS_FILENAME),
          "# OpenCode AGENTS (root)",
        );

        const workspaceSubdir = path.join(tempDir, "workspace");
        await fs.mkdir(workspaceSubdir);
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_SOUL_FILENAME),
          "# Tomato Soul",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_IDENTITY_FILENAME),
          "# Tomato Identity",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_AGENTS_FILENAME),
          "# Tomato AGENTS",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_TOOLS_FILENAME),
          "# Tomato Tools",
        );
        await fs.writeFile(
          path.join(workspaceSubdir, DEFAULT_USER_FILENAME),
          "# User",
        );

        const result = await loadWorkspaceBootstrapFiles(tempDir);

        // All files should come from workspace/, not root
        const soulFile = result.find((f) => f.name === DEFAULT_SOUL_FILENAME);
        expect(soulFile?.content).toBe("# Tomato Soul");

        const identityFile = result.find(
          (f) => f.name === DEFAULT_IDENTITY_FILENAME,
        );
        expect(identityFile?.content).toBe("# Tomato Identity");

        const agentsFile = result.find(
          (f) => f.name === DEFAULT_AGENTS_FILENAME,
        );
        expect(agentsFile?.content).toBe("# Tomato AGENTS");

        // Root AGENTS.md should NOT be loaded
        expect(agentsFile?.path).toContain("workspace");
      });
    });
  });
});
