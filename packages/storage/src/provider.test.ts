import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigManager } from "./config";
import { createCredentialManager } from "./credentials";
import { createProviderResolver } from "./provider";
import type { ConfigManager, CredentialManager } from "./types";

describe("createProviderResolver", () => {
  let tempDir: string;
  let configManager: ConfigManager;
  let credentialManager: CredentialManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "deca-provider-test-"));
    configManager = createConfigManager(join(tempDir, "config.json"));
    credentialManager = createCredentialManager(join(tempDir, "credentials"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates resolver successfully", () => {
    const resolver = createProviderResolver(configManager, credentialManager);
    expect(resolver).toBeDefined();
    expect(resolver.resolve).toBeFunction();
    expect(resolver.resolveOrThrow).toBeFunction();
    expect(resolver.list).toBeFunction();
  });

  describe("resolve", () => {
    test("returns null when no providers configured", async () => {
      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();
      expect(result).toBeNull();
    });

    test("returns glm when only glm.json exists", async () => {
      await credentialManager.set("glm", {
        apiKey: "glm-test-key",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        models: { default: "glm-4.7" },
      });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.id).toBe("glm");
      expect(result?.apiKey).toBe("glm-test-key");
      expect(result?.model).toBe("glm-4.7");
    });

    test("returns minimax when only minimax.json exists", async () => {
      await credentialManager.set("minimax", {
        apiKey: "mm-test-key",
        baseUrl: "https://api.minimax.chat/v1",
        models: { default: "abab6.5s-chat" },
      });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.id).toBe("minimax");
      expect(result?.apiKey).toBe("mm-test-key");
      expect(result?.baseUrl).toBe("https://api.minimax.chat/v1");
      expect(result?.model).toBe("abab6.5s-chat");
    });

    test("respects activeProvider in config", async () => {
      await credentialManager.set("glm", { apiKey: "glm-key" });
      await credentialManager.set("minimax", {
        apiKey: "mm-key",
        baseUrl: "https://api.minimax.chat/v1",
      });
      await configManager.save({ activeProvider: "minimax" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.id).toBe("minimax");
      expect(result?.apiKey).toBe("mm-key");
      expect(result?.baseUrl).toBe("https://api.minimax.chat/v1");
    });

    test("DECA_PROVIDER env takes highest priority", async () => {
      await credentialManager.set("glm", { apiKey: "glm-key" });
      await credentialManager.set("minimax", { apiKey: "mm-key" });
      await configManager.save({ activeProvider: "glm" });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        { DECA_PROVIDER: "minimax" },
      );
      const result = await resolver.resolve();

      expect(result?.id).toBe("minimax");
    });

    test("falls back to default model when not specified", async () => {
      await credentialManager.set("glm", { apiKey: "key" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.model).toBe("claude-sonnet-4-20250514");
    });

    test("returns null when activeProvider has no credentials", async () => {
      await configManager.save({ activeProvider: "minimax" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result).toBeNull();
    });

    test("ignores invalid DECA_PROVIDER value", async () => {
      await credentialManager.set("glm", { apiKey: "glm-key" });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        { DECA_PROVIDER: "invalid-provider" },
      );
      const result = await resolver.resolve();

      expect(result?.id).toBe("glm");
    });
  });

  describe("resolveOrThrow", () => {
    test("throws when no provider available", async () => {
      const resolver = createProviderResolver(configManager, credentialManager);

      await expect(resolver.resolveOrThrow()).rejects.toThrow(
        /No provider configured/,
      );
    });

    test("returns provider when available", async () => {
      await credentialManager.set("glm", { apiKey: "key" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolveOrThrow();

      expect(result.id).toBe("glm");
    });
  });

  describe("list", () => {
    test("returns empty array when no credentials", async () => {
      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();
      expect(result).toEqual([]);
    });

    test("returns all configured provider IDs", async () => {
      await credentialManager.set("glm", { apiKey: "key1" });
      await credentialManager.set("minimax", { apiKey: "key2" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();

      expect(result).toContain("glm");
      expect(result).toContain("minimax");
      expect(result.length).toBe(2);
    });

    test("excludes non-provider credentials (discord, github)", async () => {
      await credentialManager.set("glm", { apiKey: "key" });
      await credentialManager.set("discord", { botToken: "token" });
      await credentialManager.set("github", { token: "gh-token" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();

      expect(result).toEqual(["glm"]);
    });
  });
});
