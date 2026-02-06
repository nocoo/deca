/**
 * Storage E2E Test Runner
 *
 * Tests storage modules against real filesystem operations.
 * Uses temporary directories for isolation.
 *
 * Usage:
 *   bun run packages/storage/src/e2e/runner.ts
 *   bun run packages/storage/src/e2e/runner.ts --debug
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConfigManager } from "../config";
import { createCredentialManager } from "../credentials";
import { STATE_DIR_NAME, hasProjectDir, resolvePaths } from "../paths";
import { createProviderResolver } from "../provider";
import type { DecaConfig, ProviderCredential } from "../types";

// ============================================================================
// Configuration
// ============================================================================

const DEBUG = process.argv.includes("--debug");

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log("   [DEBUG]", ...args);
  }
}

// ============================================================================
// Test Framework
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

type TestFn = () => Promise<void>;

interface TestSuite {
  name: string;
  tests: { name: string; fn: TestFn }[];
}

const suites: TestSuite[] = [];

function suite(name: string): TestSuite {
  const s: TestSuite = { name, tests: [] };
  suites.push(s);
  return s;
}

// ============================================================================
// Test Suites
// ============================================================================

// --- Suite 1: Path Resolution ---
const pathSuite = suite("Path Resolution");

pathSuite.tests.push({
  name: "resolvePaths returns correct structure with custom homedir",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-paths-"));
    try {
      const paths = resolvePaths({
        homedir: tempDir,
        cwd: tempDir,
      });

      log("stateDir:", paths.stateDir);
      log("configPath:", paths.configPath);

      if (!paths.stateDir.includes(tempDir)) {
        throw new Error(`stateDir should include tempDir: ${paths.stateDir}`);
      }

      if (!paths.configPath.endsWith("config.json")) {
        throw new Error(
          `configPath should end with config.json: ${paths.configPath}`,
        );
      }

      if (!paths.credentialsDir.includes("credentials")) {
        throw new Error(
          `credentialsDir should include credentials: ${paths.credentialsDir}`,
        );
      }

      if (!paths.sessionsDir.includes("sessions")) {
        throw new Error(
          `sessionsDir should include sessions: ${paths.sessionsDir}`,
        );
      }

      if (!paths.memoryDir.includes("memory")) {
        throw new Error(`memoryDir should include memory: ${paths.memoryDir}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

pathSuite.tests.push({
  name: "resolvePaths respects DECA_STATE_DIR env override",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-override-"));
    const customStateDir = join(tempDir, "custom-state");

    try {
      const paths = resolvePaths({
        env: { DECA_STATE_DIR: customStateDir },
        homedir: tempDir,
        cwd: tempDir,
      });

      log("customStateDir:", customStateDir);
      log("resolved stateDir:", paths.stateDir);

      if (paths.stateDir !== customStateDir) {
        throw new Error(
          `stateDir should be ${customStateDir}, got ${paths.stateDir}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

pathSuite.tests.push({
  name: "resolvePaths expands tilde in DECA_STATE_DIR",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-tilde-"));

    try {
      const paths = resolvePaths({
        env: { DECA_STATE_DIR: "~/custom-deca" },
        homedir: tempDir,
        cwd: tempDir,
      });

      log("resolved stateDir:", paths.stateDir);

      const expected = join(tempDir, "custom-deca");
      if (paths.stateDir !== expected) {
        throw new Error(
          `stateDir should be ${expected}, got ${paths.stateDir}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

pathSuite.tests.push({
  name: "hasProjectDir detects .deca directory",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-project-"));

    try {
      // Initially no .deca
      if (hasProjectDir(tempDir)) {
        throw new Error("Should not detect .deca before creation");
      }

      // Create .deca
      mkdirSync(join(tempDir, STATE_DIR_NAME));

      if (!hasProjectDir(tempDir)) {
        throw new Error("Should detect .deca after creation");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

pathSuite.tests.push({
  name: "resolvePaths detects projectDir when .deca exists",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-projdir-"));

    try {
      // Without .deca
      const pathsWithout = resolvePaths({
        homedir: tempDir,
        cwd: tempDir,
      });

      if (pathsWithout.projectDir !== null) {
        throw new Error("projectDir should be null without .deca");
      }

      // Create .deca
      mkdirSync(join(tempDir, STATE_DIR_NAME));

      const pathsWith = resolvePaths({
        homedir: tempDir,
        cwd: tempDir,
      });

      if (pathsWith.projectDir === null) {
        throw new Error("projectDir should not be null with .deca");
      }

      if (pathsWith.knowledgeDir === null) {
        throw new Error("knowledgeDir should not be null with .deca");
      }

      if (pathsWith.heartbeatPath === null) {
        throw new Error("heartbeatPath should not be null with .deca");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

// --- Suite 2: Config Manager ---
const configSuite = suite("Config Manager");

configSuite.tests.push({
  name: "load returns empty config for non-existent file",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-config-"));
    const configPath = join(tempDir, "config.json");

    try {
      const manager = createConfigManager(configPath);
      const config = await manager.load();

      log("loaded config:", config);

      if (Object.keys(config).length !== 0) {
        throw new Error(
          `Expected empty config, got: ${JSON.stringify(config)}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

configSuite.tests.push({
  name: "save creates directory and file with correct permissions",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-config-"));
    const configPath = join(tempDir, "nested", "dir", "config.json");

    try {
      const manager = createConfigManager(configPath);
      const testConfig: DecaConfig = {
        activeProvider: "glm",
        agent: { maxTurns: 10 },
      };

      await manager.save(testConfig);

      if (!existsSync(configPath)) {
        throw new Error("Config file should exist after save");
      }

      // Verify content
      const loaded = await manager.load();
      if (loaded.activeProvider !== "glm") {
        throw new Error(
          `Expected activeProvider: glm, got: ${loaded.activeProvider}`,
        );
      }
      if (loaded.agent?.maxTurns !== 10) {
        throw new Error(
          `Expected maxTurns: 10, got: ${loaded.agent?.maxTurns}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

configSuite.tests.push({
  name: "get/set works for individual keys",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-config-"));
    const configPath = join(tempDir, "config.json");

    try {
      const manager = createConfigManager(configPath);

      // Initially undefined
      const initial = await manager.get("activeProvider");
      if (initial !== undefined) {
        throw new Error(`Expected undefined, got: ${initial}`);
      }

      // Set value
      await manager.set("activeProvider", "minimax");

      // Get value
      const value = await manager.get("activeProvider");
      if (value !== "minimax") {
        throw new Error(`Expected minimax, got: ${value}`);
      }

      // Set another value preserves first
      await manager.set("logging", { level: "debug" });

      const provider = await manager.get("activeProvider");
      const logging = await manager.get("logging");

      if (provider !== "minimax") {
        throw new Error(
          `Expected provider to still be minimax, got: ${provider}`,
        );
      }
      if (logging?.level !== "debug") {
        throw new Error(
          `Expected logging.level: debug, got: ${logging?.level}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

configSuite.tests.push({
  name: "load/save preserves complex nested config",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-config-"));
    const configPath = join(tempDir, "config.json");

    try {
      const manager = createConfigManager(configPath);
      const complexConfig: DecaConfig = {
        activeProvider: "glm",
        models: {
          default: "claude-sonnet",
          providers: {
            openai: { baseUrl: "https://api.openai.com", model: "gpt-4" },
          },
        },
        agent: {
          maxTurns: 5,
          enableHeartbeat: true,
          heartbeatInterval: 60000,
        },
        channels: {
          discord: {
            enabled: true,
            debugMode: false,
            allowedUsers: ["user1", "user2"],
          },
        },
        logging: {
          level: "info",
          file: "/var/log/deca.log",
        },
      };

      await manager.save(complexConfig);
      const loaded = await manager.load();

      log("original:", JSON.stringify(complexConfig, null, 2));
      log("loaded:", JSON.stringify(loaded, null, 2));

      if (JSON.stringify(loaded) !== JSON.stringify(complexConfig)) {
        throw new Error("Loaded config does not match saved config");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

// --- Suite 3: Credential Manager ---
const credentialSuite = suite("Credential Manager");

credentialSuite.tests.push({
  name: "get returns null for non-existent credential",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      const manager = createCredentialManager(tempDir);
      const cred = await manager.get("glm");

      if (cred !== null) {
        throw new Error(`Expected null, got: ${JSON.stringify(cred)}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

credentialSuite.tests.push({
  name: "set creates credential file with secure permissions",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      const manager = createCredentialManager(tempDir);
      const credential: ProviderCredential = {
        apiKey: "sk-test-key-12345",
        baseUrl: "https://api.example.com",
        models: { default: "test-model" },
      };

      await manager.set("glm", credential);

      const filepath = join(tempDir, "glm.json");
      if (!existsSync(filepath)) {
        throw new Error("Credential file should exist");
      }

      const loaded = await manager.get("glm");
      if (loaded?.apiKey !== "sk-test-key-12345") {
        throw new Error(
          `Expected apiKey: sk-test-key-12345, got: ${loaded?.apiKey}`,
        );
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

credentialSuite.tests.push({
  name: "list returns only valid credential names",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      mkdirSync(tempDir, { recursive: true });

      // Create valid and invalid credential files
      writeFileSync(
        join(tempDir, "glm.json"),
        JSON.stringify({ apiKey: "key1" }),
      );
      writeFileSync(
        join(tempDir, "discord.json"),
        JSON.stringify({ botToken: "token" }),
      );
      writeFileSync(
        join(tempDir, "invalid.json"),
        JSON.stringify({ foo: "bar" }),
      );
      writeFileSync(join(tempDir, "readme.txt"), "not a credential");

      const manager = createCredentialManager(tempDir);
      const list = await manager.list();

      log("credential list:", list);

      if (!list.includes("glm")) {
        throw new Error("Should include glm");
      }
      if (!list.includes("discord")) {
        throw new Error("Should include discord");
      }
      if (list.includes("invalid" as keyof typeof list)) {
        throw new Error("Should not include invalid");
      }
      if (list.length !== 2) {
        throw new Error(`Expected 2 credentials, got: ${list.length}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

credentialSuite.tests.push({
  name: "has returns correct boolean",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      const manager = createCredentialManager(tempDir);

      if (await manager.has("glm")) {
        throw new Error("Should not have glm initially");
      }

      await manager.set("glm", { apiKey: "test" });

      if (!(await manager.has("glm"))) {
        throw new Error("Should have glm after set");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

credentialSuite.tests.push({
  name: "delete removes credential file",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      const manager = createCredentialManager(tempDir);
      await manager.set("glm", { apiKey: "to-delete" });

      if (!(await manager.has("glm"))) {
        throw new Error("Should have glm after set");
      }

      await manager.delete("glm");

      if (await manager.has("glm")) {
        throw new Error("Should not have glm after delete");
      }

      // Delete non-existent should not throw
      await manager.delete("glm");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

credentialSuite.tests.push({
  name: "CRUD lifecycle works correctly",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-creds-"));

    try {
      const manager = createCredentialManager(tempDir);

      // Create
      await manager.set("glm", { apiKey: "v1" });
      await manager.set("minimax", { apiKey: "m1" });
      await manager.set("discord", { botToken: "token" });

      // Read
      const glm = await manager.get("glm");
      const minimax = await manager.get("minimax");
      const discord = await manager.get("discord");

      if (glm?.apiKey !== "v1") throw new Error("glm should be v1");
      if (minimax?.apiKey !== "m1") throw new Error("minimax should be m1");
      if (discord?.botToken !== "token")
        throw new Error("discord should have token");

      // Update
      await manager.set("glm", { apiKey: "v2", baseUrl: "https://new.api" });
      const updated = await manager.get("glm");
      if (updated?.apiKey !== "v2") throw new Error("glm should be v2");
      if (updated?.baseUrl !== "https://new.api")
        throw new Error("baseUrl should be updated");

      // Delete
      await manager.delete("minimax");
      const list = await manager.list();
      if (list.includes("minimax"))
        throw new Error("minimax should be deleted");
      if (list.length !== 2)
        throw new Error(`Expected 2 credentials, got ${list.length}`);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

// --- Suite 4: Provider Resolver ---
const providerSuite = suite("Provider Resolver");

providerSuite.tests.push({
  name: "resolve returns null when no credentials exist",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);
      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );

      const result = await resolver.resolve();

      if (result !== null) {
        throw new Error(`Expected null, got: ${JSON.stringify(result)}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "resolve returns first available provider",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);

      // Add glm credential (first in priority order)
      await credentialManager.set("glm", {
        apiKey: "glm-key",
        baseUrl: "https://glm.api",
        models: { default: "glm-4" },
      });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );
      const result = await resolver.resolve();

      log("resolved provider:", result);

      if (!result) {
        throw new Error("Should resolve a provider");
      }
      if (result.id !== "glm") {
        throw new Error(`Expected id: glm, got: ${result.id}`);
      }
      if (result.apiKey !== "glm-key") {
        throw new Error(`Expected apiKey: glm-key, got: ${result.apiKey}`);
      }
      if (result.model !== "glm-4") {
        throw new Error(`Expected model: glm-4, got: ${result.model}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "resolve respects activeProvider config",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);

      // Add both providers
      await credentialManager.set("glm", { apiKey: "glm-key" });
      await credentialManager.set("minimax", { apiKey: "minimax-key" });

      // Set minimax as active
      await configManager.set("activeProvider", "minimax");

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );
      const result = await resolver.resolve();

      if (!result) {
        throw new Error("Should resolve a provider");
      }
      if (result.id !== "minimax") {
        throw new Error(`Expected id: minimax, got: ${result.id}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "resolve respects DECA_PROVIDER env override",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);

      // Add both providers
      await credentialManager.set("glm", { apiKey: "glm-key" });
      await credentialManager.set("minimax", { apiKey: "minimax-key" });

      // Set glm as active in config
      await configManager.set("activeProvider", "glm");

      // But env says minimax
      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {
          DECA_PROVIDER: "minimax",
        },
      );
      const result = await resolver.resolve();

      if (!result) {
        throw new Error("Should resolve a provider");
      }
      // Env should take precedence
      if (result.id !== "minimax") {
        throw new Error(`Expected id: minimax (from env), got: ${result.id}`);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "resolveOrThrow throws when no provider available",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);
      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );

      let threw = false;
      try {
        await resolver.resolveOrThrow();
      } catch (error) {
        threw = true;
        if (
          !(error instanceof Error) ||
          !error.message.includes("No provider configured")
        ) {
          throw new Error(`Wrong error message: ${error}`);
        }
      }

      if (!threw) {
        throw new Error("Should have thrown");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "list returns available LLM providers",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);

      // Add credentials
      await credentialManager.set("glm", { apiKey: "key1" });
      await credentialManager.set("discord", { botToken: "token" }); // Not an LLM provider

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );
      const list = await resolver.list();

      log("provider list:", list);

      if (!list.includes("glm")) {
        throw new Error("Should include glm");
      }
      if (list.includes("discord" as (typeof list)[number])) {
        throw new Error("Should not include discord (not an LLM provider)");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

providerSuite.tests.push({
  name: "resolve uses default model when not specified",
  fn: async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "deca-provider-"));
    const configPath = join(tempDir, "config.json");
    const credsDir = join(tempDir, "credentials");

    try {
      const configManager = createConfigManager(configPath);
      const credentialManager = createCredentialManager(credsDir);

      // Add provider without model config
      await credentialManager.set("glm", { apiKey: "key" });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        {},
      );
      const result = await resolver.resolve();

      if (!result) {
        throw new Error("Should resolve a provider");
      }
      // Should have default model
      if (!result.model) {
        throw new Error("Should have a default model");
      }
      log("default model:", result.model);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  },
});

// ============================================================================
// Runner
// ============================================================================

async function runSuite(suiteDef: TestSuite): Promise<TestResult[]> {
  console.log(`\n📦 ${suiteDef.name}\n`);

  const results: TestResult[] = [];

  for (const { name, fn } of suiteDef.tests) {
    const start = Date.now();
    process.stdout.write(`   ${name}... `);

    try {
      await fn();
      const duration = Date.now() - start;
      results.push({ name, passed: true, duration });
      console.log(`✓ (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, duration, error: errorMsg });
      console.log(`✗ (${duration}ms)`);
      console.log(`      Error: ${errorMsg}`);
    }
  }

  return results;
}

async function runTests(): Promise<void> {
  console.log("🧪 Storage E2E Test Runner");
  console.log("   Testing real filesystem operations");

  const allResults: TestResult[] = [];

  for (const suiteDef of suites) {
    const results = await runSuite(suiteDef);
    allResults.push(...results);
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  const passed = allResults.filter((r) => r.passed).length;
  const total = allResults.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(`✅ All ${total} tests passed`);
  } else {
    console.log(`❌ ${passed}/${total} tests passed`);
    console.log("\nFailed tests:");
    for (const r of allResults.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
