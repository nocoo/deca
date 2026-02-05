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

    test("returns anthropic when only anthropic.json exists", async () => {
      await credentialManager.set("anthropic", {
        apiKey: "sk-ant-test",
        models: { default: "claude-sonnet" },
      });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.id).toBe("anthropic");
      expect(result?.apiKey).toBe("sk-ant-test");
      expect(result?.model).toBe("claude-sonnet");
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
      await credentialManager.set("anthropic", { apiKey: "ant-key" });
      await credentialManager.set("openrouter", {
        apiKey: "or-key",
        baseUrl: "https://openrouter.ai/api/v1",
      });
      await configManager.save({ activeProvider: "openrouter" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.id).toBe("openrouter");
      expect(result?.apiKey).toBe("or-key");
      expect(result?.baseUrl).toBe("https://openrouter.ai/api/v1");
    });

    test("DECA_PROVIDER env takes highest priority", async () => {
      await credentialManager.set("anthropic", { apiKey: "ant-key" });
      await credentialManager.set("openrouter", { apiKey: "or-key" });
      await configManager.save({ activeProvider: "anthropic" });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        { DECA_PROVIDER: "openrouter" },
      );
      const result = await resolver.resolve();

      expect(result?.id).toBe("openrouter");
    });

    test("falls back to default model when not specified", async () => {
      await credentialManager.set("anthropic", { apiKey: "key" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.model).toBe("claude-sonnet-4-20250514");
    });

    test("includes headers when provider specifies them", async () => {
      await credentialManager.set("openrouter", {
        apiKey: "or-key",
        headers: { "HTTP-Referer": "https://deca.local" },
      });
      await configManager.save({ activeProvider: "openrouter" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result?.headers).toEqual({ "HTTP-Referer": "https://deca.local" });
    });

    test("returns null when activeProvider has no credentials", async () => {
      await configManager.save({ activeProvider: "openrouter" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolve();

      expect(result).toBeNull();
    });

    test("ignores invalid DECA_PROVIDER value", async () => {
      await credentialManager.set("anthropic", { apiKey: "ant-key" });

      const resolver = createProviderResolver(
        configManager,
        credentialManager,
        { DECA_PROVIDER: "invalid-provider" },
      );
      const result = await resolver.resolve();

      expect(result?.id).toBe("anthropic");
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
      await credentialManager.set("anthropic", { apiKey: "key" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.resolveOrThrow();

      expect(result.id).toBe("anthropic");
    });
  });

  describe("list", () => {
    test("returns empty array when no credentials", async () => {
      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();
      expect(result).toEqual([]);
    });

    test("returns all configured provider IDs", async () => {
      await credentialManager.set("anthropic", { apiKey: "key1" });
      await credentialManager.set("openrouter", { apiKey: "key2" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();

      expect(result).toContain("anthropic");
      expect(result).toContain("openrouter");
      expect(result.length).toBe(2);
    });

    test("excludes non-provider credentials (discord, github)", async () => {
      await credentialManager.set("anthropic", { apiKey: "key" });
      await credentialManager.set("discord", { botToken: "token" });
      await credentialManager.set("github", { token: "gh-token" });

      const resolver = createProviderResolver(configManager, credentialManager);
      const result = await resolver.list();

      expect(result).toEqual(["anthropic"]);
    });
  });
});
