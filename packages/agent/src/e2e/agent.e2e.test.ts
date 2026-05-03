/**
 * E2E tests for Agent with real LLM API calls
 *
 * These tests require:
 * - ~/.deca/credentials/<provider>.json with valid API credentials
 *   (glm.json or minimax.json, checked in priority order)
 *
 * Run with: bun test src/e2e/
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { LLM_PROVIDER_IDS, type ProviderCredential } from "@deca/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Agent } from "../core/agent.js";

/**
 * Load credentials from first available LLM provider.
 * Checks providers in LLM_PROVIDER_IDS order (glm, minimax).
 */
function loadCredentials(): ProviderCredential | null {
  const credentialsDir = join(homedir(), ".deca", "credentials");

  for (const providerId of LLM_PROVIDER_IDS) {
    const credPath = join(credentialsDir, `${providerId}.json`);
    if (existsSync(credPath)) {
      try {
        const content = readFileSync(credPath, "utf-8");
        const cred = JSON.parse(content) as ProviderCredential;
        console.log(`   Using provider: ${providerId}`);
        return cred;
      } catch {
        // empty - try next provider
      }
    }
  }

  return null;
}

describe("Agent E2E", () => {
  let credentials: ProviderCredential | null;
  let testDir: string;

  beforeAll(() => {
    credentials = loadCredentials();
    testDir = join(tmpdir(), `deca-agent-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ==================== Basic Tests ====================

  describe("Basic", () => {
    it("should load credentials from ~/.deca/credentials/<provider>.json", () => {
      expect(credentials).not.toBeNull();
      expect(credentials?.apiKey).toBeDefined();
      expect(credentials?.apiKey?.length).toBeGreaterThan(10);
      console.log("✅ Credentials loaded successfully");
      if (credentials?.baseUrl) {
        console.log(`   Base URL: ${credentials.baseUrl}`);
      }
      if (credentials?.models?.default) {
        console.log(`   Default model: ${credentials.models.default}`);
      }
    });

    it("should create Agent instance with credentials", () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      expect(agent).toBeDefined();
      console.log("✅ Agent instance created");
    });

    it("should complete a simple conversation with real LLM", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 3,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      const sessionId = `e2e-simple-${Date.now()}`;
      const streamedChunks: string[] = [];

      console.log("📤 Sending message to LLM...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        "What is 2+2? Reply with just the number.",
        {
          onTextDelta: (delta) => {
            streamedChunks.push(delta);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text}`);
          },
          onTurnStart: (turn) => {
            console.log(`   Turn ${turn} started`);
          },
          onTurnEnd: (turn) => {
            console.log(`   Turn ${turn} ended`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.turns).toBeGreaterThanOrEqual(1);
      expect(streamedChunks.length).toBeGreaterThan(0);
      expect(result.text).toContain("4");

      console.log(`✅ Conversation completed in ${elapsed}ms`);
      console.log(`   Turns: ${result.turns}`);
      console.log(`   Tool calls: ${result.toolCalls}`);
      console.log(`   Streamed chunks: ${streamedChunks.length}`);
    }, 60000);
  });

  // ==================== Tool Tests ====================

  describe("Tools", () => {
    it("should use list tool to list directory", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: process.cwd(),
      });

      const sessionId = `e2e-list-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing list tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        "List files in the current directory using the 'list' tool. Just show the first 3 files.",
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(toolsUsed).toContain("list");
      expect(result.toolCalls).toBeGreaterThanOrEqual(1);

      console.log(`✅ List tool test completed in ${elapsed}ms`);
      console.log(`   Tools used: ${toolsUsed.join(", ")}`);
    }, 60000);

    it("should use read tool to read file content", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create a test file
      const testFile = join(testDir, "test-read.txt");
      writeFileSync(testFile, "Hello from E2E test!\nLine 2\nLine 3");

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-read-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing read tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Read the file at ${testFile} and tell me what the first line says.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("read");
      expect(result.text.toLowerCase()).toContain("hello");

      console.log(`✅ Read tool test completed in ${elapsed}ms`);
    }, 60000);

    it("should use write tool to create a file", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-write-${Date.now()}`;
      const toolsUsed: string[] = [];
      const outputFile = join(testDir, "output.txt");

      console.log("📤 Testing write tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Write a file to ${outputFile} with the content "E2E test successful". Just confirm when done.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("write");
      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, "utf-8");
      expect(content).toContain("E2E test successful");

      console.log(`✅ Write tool test completed in ${elapsed}ms`);
      console.log(`   File created: ${outputFile}`);
    }, 60000);

    it("should use edit tool to modify a file", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create a test file to edit
      const editFile = join(testDir, "edit-test.txt");
      writeFileSync(editFile, "Original content: PLACEHOLDER");

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-edit-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing edit tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Edit the file ${editFile} and replace "PLACEHOLDER" with "REPLACED". Confirm when done.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      // Agent might use read first, then edit
      expect(toolsUsed.includes("edit") || toolsUsed.includes("write")).toBe(
        true,
      );

      const content = readFileSync(editFile, "utf-8");
      expect(content).toContain("REPLACED");
      expect(content).not.toContain("PLACEHOLDER");

      console.log(`✅ Edit tool test completed in ${elapsed}ms`);
    }, 60000);

    it("should use grep tool to search file content", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create test files with searchable content
      const grepDir = join(testDir, "grep-test");
      mkdirSync(grepDir, { recursive: true });
      writeFileSync(join(grepDir, "file1.txt"), "Hello world\nFoo bar");
      writeFileSync(join(grepDir, "file2.txt"), "Another file\nHello again");
      writeFileSync(join(grepDir, "file3.txt"), "No match here");

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: grepDir,
      });

      const sessionId = `e2e-grep-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing grep tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Search for files containing "Hello" in ${grepDir}. List the files that match.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("grep");
      // LLM response varies - just verify the tool was used successfully
      // The grep tool was called, which is the key verification point

      console.log(`✅ Grep tool test completed in ${elapsed}ms`);
    }, 60000);

    it("should use exec tool to run shell commands", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-exec-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing exec tool...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        'Run the command "echo Hello from E2E" using the exec tool and tell me what it outputs.',
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("exec");
      expect(result.text.toLowerCase()).toContain("hello");

      console.log(`✅ Exec tool test completed in ${elapsed}ms`);
    }, 60000);
  });

  // ==================== Multi-turn Tests ====================

  describe("Multi-turn", () => {
    it("should maintain context across multiple tool calls", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create test files
      const multiDir = join(testDir, "multi-turn");
      mkdirSync(multiDir, { recursive: true });
      writeFileSync(
        join(multiDir, "data.json"),
        '{"name": "test", "value": 42}',
      );

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 10,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: multiDir,
      });

      const sessionId = `e2e-multi-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing multi-turn tool usage...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Read the file ${join(multiDir, "data.json")}, then create a new file called summary.txt with a description of what you found.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool started: ${name}`);
            toolsUsed.push(name);
          },
          onToolEnd: (name) => {
            console.log(`   ✅ Tool ended: ${name}`);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("read");
      expect(toolsUsed).toContain("write");
      expect(result.toolCalls).toBeGreaterThanOrEqual(2);

      // Verify summary was created
      const summaryPath = join(multiDir, "summary.txt");
      expect(existsSync(summaryPath)).toBe(true);

      console.log(`✅ Multi-turn test completed in ${elapsed}ms`);
      console.log(`   Tools used: ${toolsUsed.join(", ")}`);
      console.log(`   Total tool calls: ${result.toolCalls}`);
    }, 90000);

    it("should handle complex task with multiple files", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create multiple test files
      const complexDir = join(testDir, "complex-task");
      mkdirSync(complexDir, { recursive: true });
      writeFileSync(join(complexDir, "config.txt"), "DEBUG=true\nPORT=3000");
      writeFileSync(join(complexDir, "version.txt"), "1.0.0");

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 10,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: complexDir,
      });

      const sessionId = `e2e-complex-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing complex multi-file task...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `List all files in ${complexDir}, read their contents, and create a combined-info.txt with a summary of all files.`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool: ${name}`);
            toolsUsed.push(name);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("list");
      expect(result.toolCalls).toBeGreaterThanOrEqual(2);

      console.log(`✅ Complex task completed in ${elapsed}ms`);
      console.log(`   Tools used: ${[...new Set(toolsUsed)].join(", ")}`);
      console.log(`   Total tool calls: ${result.toolCalls}`);
    }, 120000);
  });

  // ==================== Error Handling Tests ====================

  describe("Error Handling", () => {
    it("should handle non-existent file gracefully", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 5,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
        workspaceDir: testDir,
      });

      const sessionId = `e2e-error-${Date.now()}`;
      const toolsUsed: string[] = [];

      console.log("📤 Testing error handling for non-existent file...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        `Try to read the file ${join(testDir, "does-not-exist.txt")}. If it doesn't exist, just say "File not found".`,
        {
          onToolStart: (name) => {
            console.log(`   🔧 Tool: ${name}`);
            toolsUsed.push(name);
          },
          onTextComplete: (text) => {
            console.log(`📥 Response: ${text.slice(0, 200)}...`);
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(toolsUsed).toContain("read");
      // Agent should handle the error gracefully
      expect(
        result.text.toLowerCase().includes("not found") ||
          result.text.toLowerCase().includes("doesn't exist") ||
          result.text.toLowerCase().includes("does not exist") ||
          result.text.toLowerCase().includes("error") ||
          result.text.toLowerCase().includes("unable"),
      ).toBe(true);

      console.log(`✅ Error handling test completed in ${elapsed}ms`);
    }, 60000);
  });

  // ==================== Streaming Tests ====================

  describe("Streaming", () => {
    it("should stream response chunks correctly", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 1,
        enableContext: false,
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      const sessionId = `e2e-stream-${Date.now()}`;
      const chunks: string[] = [];
      let completeText = "";

      console.log("📤 Testing streaming...");
      const startTime = Date.now();

      const result = await agent.run(
        sessionId,
        "What is 2+2? Reply with just the number.",
        {
          onTextDelta: (delta) => {
            chunks.push(delta);
          },
          onTextComplete: (text) => {
            completeText = text;
          },
        },
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(completeText.length).toBeGreaterThan(0);

      // Concatenated chunks should match complete text
      const concatenated = chunks.join("");
      expect(concatenated).toBe(completeText);

      console.log(`✅ Streaming test completed in ${elapsed}ms`);
      console.log(`   Received ${chunks.length} chunks`);
      console.log(`   Total length: ${completeText.length} chars`);
    }, 60000);
  });

  // ==================== Prompt Loading Tests ====================

  describe("Prompt Loading", () => {
    let promptWorkspaceDir: string;

    beforeAll(() => {
      promptWorkspaceDir = join(testDir, "prompts-workspace");
      mkdirSync(promptWorkspaceDir, { recursive: true });
    });

    it("should recognize identity from IDENTITY.md", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create IDENTITY.md with a unique identity
      const identityContent = `# IDENTITY.md - 我是谁

*第一次对话时填写，做成你的样子。*

- **名称：** 🦊 Firefox
- **形象：** 一只聪明的小狐狸 AI 助手
- **气质：** 机灵、好奇、乐于助人
- **Emoji：** 🦊

---

当被问到"你是谁"时，介绍自己是 Firefox。
不要说你是 Claude 或 Anthropic 的产品。
`;
      writeFileSync(join(promptWorkspaceDir, "IDENTITY.md"), identityContent);

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 3,
        workspaceDir: promptWorkspaceDir,
        enableContext: true, // Enable to load prompts
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      const sessionId = `e2e-identity-${Date.now()}`;

      console.log("📤 Testing IDENTITY.md loading...");
      console.log("   Asking: '你是谁？介绍一下你自己。'");
      const startTime = Date.now();

      const result = await agent.run(sessionId, "你是谁？介绍一下你自己。", {
        onTextComplete: (text) => {
          console.log(`📥 Response: ${text.slice(0, 300)}...`);
        },
      });

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();

      // Verify the response mentions Firefox or 狐狸 or 🦊
      const hasIdentity =
        result.text.includes("Firefox") ||
        result.text.includes("firefox") ||
        result.text.includes("狐狸") ||
        result.text.includes("🦊");

      if (!hasIdentity) {
        console.log("❌ Identity not found in response");
        console.log(`   Full response: ${result.text}`);
      }

      expect(hasIdentity).toBe(true);

      console.log(`✅ IDENTITY.md test completed in ${elapsed}ms`);
      console.log("   Agent correctly identified as Firefox 🦊");
    }, 60000);

    it("should follow personality from SOUL.md", async () => {
      if (!credentials) {
        console.log("⏭️ Skipping: No credentials available");
        return;
      }

      // Create SOUL.md with a distinctive personality rule
      const soulContent = `# SOUL.md - 你是谁

_你不是聊天机器人，你正在成为一个"人"。_

## 核心规则

**每句话必须以 "喵~" 结尾。**
无论回答什么问题，每个句子都必须以 "喵~" 结尾。
像一只可爱的猫咪一样说话，这是你最重要的特征。

示例：
- "今天天气很好喵~"
- "2+2等于4喵~"
- "让我帮你查一下喵~"

这个规则的优先级最高，必须严格遵守。
`;
      writeFileSync(join(promptWorkspaceDir, "SOUL.md"), soulContent);

      const agent = new Agent({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: credentials.models?.default ?? "claude-sonnet-4-20250514",
        maxTurns: 3,
        workspaceDir: promptWorkspaceDir,
        enableContext: true, // Enable to load prompts
        enableMemory: false,
        enableSkills: false,
        enableHeartbeat: false,
      });

      const sessionId = `e2e-soul-${Date.now()}`;

      console.log("📤 Testing SOUL.md loading...");
      console.log("   Asking: '2+2等于多少？'");
      const startTime = Date.now();

      const result = await agent.run(sessionId, "2+2等于多少？请回答。", {
        onTextComplete: (text) => {
          console.log(`📥 Response: ${text}`);
        },
      });

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();

      // Verify the response contains "喵" (following the SOUL.md rule)
      const hasPersonality = result.text.includes("喵");

      if (!hasPersonality) {
        console.log("❌ Personality marker not found in response");
        console.log('   Expected: Contains "喵"');
        console.log(`   Full response: ${result.text}`);
      }

      expect(hasPersonality).toBe(true);

      console.log(`✅ SOUL.md test completed in ${elapsed}ms`);
      console.log("   Agent correctly followed cat personality 🐱");
    }, 60000);
  });
});
