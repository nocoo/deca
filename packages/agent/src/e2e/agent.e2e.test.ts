/**
 * E2E tests for Agent with real LLM API calls
 *
 * These tests require:
 * - ~/.deca/credentials/anthropic.json with valid API credentials
 *
 * Run with: bun test src/e2e/
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Agent } from "../core/agent.js";

interface AnthropicCredential {
  apiKey: string;
  baseUrl?: string;
  models?: {
    default?: string;
    haiku?: string;
    sonnet?: string;
    opus?: string;
    reasoning?: string;
  };
}

function loadCredentials(): AnthropicCredential | null {
  const credPath = join(homedir(), ".deca", "credentials", "anthropic.json");
  if (!existsSync(credPath)) {
    return null;
  }
  try {
    const content = readFileSync(credPath, "utf-8");
    return JSON.parse(content) as AnthropicCredential;
  } catch {
    return null;
  }
}

describe("Agent E2E", () => {
  let credentials: AnthropicCredential | null;

  beforeAll(() => {
    credentials = loadCredentials();
  });

  afterAll(() => {
    // Cleanup if needed
  });

  it("should load credentials from ~/.deca/credentials/anthropic.json", () => {
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

    const sessionId = `e2e-test-${Date.now()}`;
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

    // The response should contain "4"
    expect(result.text).toContain("4");

    console.log(`✅ Conversation completed in ${elapsed}ms`);
    console.log(`   Turns: ${result.turns}`);
    console.log(`   Tool calls: ${result.toolCalls}`);
    console.log(`   Streamed chunks: ${streamedChunks.length}`);
  }, 60000); // 60 second timeout

  it("should handle tool usage in conversation", async () => {
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

    const sessionId = `e2e-tool-test-${Date.now()}`;
    const toolsUsed: string[] = [];

    console.log("📤 Sending tool-requiring message to LLM...");
    const startTime = Date.now();

    const result = await agent.run(
      sessionId,
      "List files in the current directory using the 'list' tool. Just show the first 3 files.",
      {
        onToolStart: (name) => {
          console.log(`   🔧 Tool started: ${name}`);
          toolsUsed.push(name);
        },
        onToolEnd: (name, _result) => {
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

    console.log(`✅ Tool conversation completed in ${elapsed}ms`);
    console.log(`   Tools used: ${toolsUsed.join(", ")}`);
    console.log(`   Total tool calls: ${result.toolCalls}`);
  }, 120000); // 120 second timeout for tool usage
});
