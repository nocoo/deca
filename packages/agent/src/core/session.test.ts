import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Message, SessionManager } from "./session.js";

describe("SessionManager", () => {
  let tempDir: string;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-test-"));
    sessionManager = new SessionManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("load and append", () => {
    it("should return empty array for new session", async () => {
      const messages = await sessionManager.load("new-session");
      expect(messages).toEqual([]);
    });

    it("should append and load messages", async () => {
      const message: Message = {
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      };

      await sessionManager.append("test-session", message);
      const messages = await sessionManager.load("test-session");

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
    });

    it("should append multiple messages", async () => {
      const msg1: Message = { role: "user", content: "Hello", timestamp: 1 };
      const msg2: Message = { role: "assistant", content: "Hi", timestamp: 2 };

      await sessionManager.append("test-session", msg1);
      await sessionManager.append("test-session", msg2);

      const messages = await sessionManager.load("test-session");
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe("Hello");
      expect(messages[1].content).toBe("Hi");
    });

    it("should persist messages to disk", async () => {
      const message: Message = {
        role: "user",
        content: "Persisted",
        timestamp: Date.now(),
      };

      await sessionManager.append("persist-test", message);

      // Create new instance to verify disk persistence
      const newManager = new SessionManager(tempDir);
      const messages = await newManager.load("persist-test");

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Persisted");
    });

    it("should handle messages with content blocks", async () => {
      const message: Message = {
        role: "assistant",
        content: [
          { type: "text", text: "I will read the file" },
          {
            type: "tool_use",
            id: "tool-1",
            name: "read",
            input: { file: "test.txt" },
          },
        ],
        timestamp: Date.now(),
      };

      await sessionManager.append("blocks-test", message);
      const messages = await sessionManager.load("blocks-test");

      expect(messages).toHaveLength(1);
      expect(Array.isArray(messages[0].content)).toBe(true);
      const content = messages[0].content as Message["content"];
      expect(content).toHaveLength(2);
    });

    it("should use cache for repeated loads", async () => {
      const message: Message = {
        role: "user",
        content: "Cached",
        timestamp: Date.now(),
      };

      await sessionManager.append("cache-test", message);

      // First load populates cache
      const messages1 = await sessionManager.load("cache-test");
      // Second load should return from cache (same reference)
      const messages2 = await sessionManager.load("cache-test");

      expect(messages1).toBe(messages2); // Same reference
    });
  });

  describe("get", () => {
    it("should return empty array for unknown session", () => {
      const messages = sessionManager.get("unknown");
      expect(messages).toEqual([]);
    });

    it("should return cached messages without disk IO", async () => {
      const message: Message = {
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      await sessionManager.append("get-test", message);

      // get() should work without calling load()
      const messages = sessionManager.get("get-test");
      expect(messages).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should remove session from cache and disk", async () => {
      const message: Message = {
        role: "user",
        content: "To be cleared",
        timestamp: Date.now(),
      };

      await sessionManager.append("clear-test", message);
      expect(sessionManager.get("clear-test")).toHaveLength(1);

      await sessionManager.clear("clear-test");

      // Cache should be cleared
      expect(sessionManager.get("clear-test")).toEqual([]);

      // Disk should be cleared (new instance can't find it)
      const newManager = new SessionManager(tempDir);
      const messages = await newManager.load("clear-test");
      expect(messages).toEqual([]);
    });

    it("should not throw for non-existent session", async () => {
      await expect(
        sessionManager.clear("non-existent"),
      ).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    it("should return empty array when no sessions", async () => {
      const sessions = await sessionManager.list();
      expect(sessions).toEqual([]);
    });

    it("should list all session keys", async () => {
      const msg: Message = { role: "user", content: "Test", timestamp: 1 };

      await sessionManager.append("session-a", msg);
      await sessionManager.append("session-b", msg);

      const sessions = await sessionManager.list();
      expect(sessions).toContain("session-a");
      expect(sessions).toContain("session-b");
      expect(sessions).toHaveLength(2);
    });
  });

  describe("path safety", () => {
    it("should encode special characters in session key", async () => {
      const message: Message = {
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      // Session key with special characters
      await sessionManager.append("agent:main:session", message);
      const messages = await sessionManager.load("agent:main:session");

      expect(messages).toHaveLength(1);
    });

    it("should handle session key with path traversal attempt", async () => {
      const message: Message = {
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      // Malicious session key should be safely encoded
      await sessionManager.append("../../../etc/passwd", message);

      // File should be in tempDir with encoded filename
      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(1);
      // The .. should be URL-encoded as %2E%2E or similar
      expect(files[0]).toContain("%2F"); // Forward slash encoded
    });
  });

  describe("getStats", () => {
    it("should return zero stats for empty session", async () => {
      const stats = await sessionManager.getStats("empty-session");
      expect(stats.messageCount).toBe(0);
      expect(stats.userMessages).toBe(0);
      expect(stats.assistantMessages).toBe(0);
      expect(stats.totalChars).toBe(0);
    });

    it("should count messages by role", async () => {
      await sessionManager.append("stats-test", {
        role: "user",
        content: "Hello",
        timestamp: 1,
      });
      await sessionManager.append("stats-test", {
        role: "assistant",
        content: "Hi there",
        timestamp: 2,
      });
      await sessionManager.append("stats-test", {
        role: "user",
        content: "How are you?",
        timestamp: 3,
      });

      const stats = await sessionManager.getStats("stats-test");
      expect(stats.messageCount).toBe(3);
      expect(stats.userMessages).toBe(2);
      expect(stats.assistantMessages).toBe(1);
    });

    it("should calculate total chars from string content", async () => {
      await sessionManager.append("chars-test", {
        role: "user",
        content: "Hello",
        timestamp: 1,
      });
      await sessionManager.append("chars-test", {
        role: "assistant",
        content: "World!",
        timestamp: 2,
      });

      const stats = await sessionManager.getStats("chars-test");
      expect(stats.totalChars).toBe(11);
    });

    it("should calculate total chars from content blocks", async () => {
      await sessionManager.append("blocks-chars-test", {
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: " World" },
        ],
        timestamp: 1,
      });

      const stats = await sessionManager.getStats("blocks-chars-test");
      expect(stats.totalChars).toBe(11);
    });
  });
});
