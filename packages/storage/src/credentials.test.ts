import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCredentialManager } from "./credentials";

describe("createCredentialManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "deca-credentials-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates manager successfully", () => {
    const manager = createCredentialManager(tempDir);
    expect(manager).toBeDefined();
    expect(manager.get).toBeFunction();
    expect(manager.set).toBeFunction();
    expect(manager.delete).toBeFunction();
    expect(manager.list).toBeFunction();
    expect(manager.has).toBeFunction();
  });

  test("get returns null for non-existent credential", async () => {
    const manager = createCredentialManager(tempDir);
    const result = await manager.get("anthropic");
    expect(result).toBeNull();
  });

  test("set creates credential file", async () => {
    const manager = createCredentialManager(tempDir);
    await manager.set("anthropic", {
      apiKey: "sk-ant-test-key",
      baseUrl: "https://api.anthropic.com",
    });

    const result = await manager.get("anthropic");
    expect(result).toEqual({
      apiKey: "sk-ant-test-key",
      baseUrl: "https://api.anthropic.com",
    });
  });

  test("set creates directory if not exists", async () => {
    const nestedDir = join(tempDir, "nested", "credentials");
    const manager = createCredentialManager(nestedDir);

    await manager.set("discord", { botToken: "test-token" });

    const result = await manager.get("discord");
    expect(result?.botToken).toBe("test-token");
  });

  test("credential file has restricted permissions (600)", async () => {
    const manager = createCredentialManager(tempDir);
    await manager.set("github", { token: "ghp_test" });

    const filePath = join(tempDir, "github.json");
    const stats = await stat(filePath);

    // Check permission bits (0o600 = owner read/write only)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("delete removes credential file", async () => {
    const manager = createCredentialManager(tempDir);
    await manager.set("openai", { apiKey: "sk-test" });

    expect(await manager.has("openai")).toBe(true);

    await manager.delete("openai");

    expect(await manager.has("openai")).toBe(false);
    expect(await manager.get("openai")).toBeNull();
  });

  test("delete does not throw for non-existent credential", async () => {
    const manager = createCredentialManager(tempDir);
    await expect(manager.delete("anthropic")).resolves.toBeUndefined();
  });

  test("list returns empty array when no credentials", async () => {
    const manager = createCredentialManager(tempDir);
    const result = await manager.list();
    expect(result).toEqual([]);
  });

  test("list returns all configured credentials", async () => {
    const manager = createCredentialManager(tempDir);
    await manager.set("anthropic", { apiKey: "key1" });
    await manager.set("discord", { botToken: "token1" });
    await manager.set("github", { token: "token2" });

    const result = await manager.list();
    expect(result).toContain("anthropic");
    expect(result).toContain("discord");
    expect(result).toContain("github");
    expect(result.length).toBe(3);
  });

  test("has returns false for non-existent credential", async () => {
    const manager = createCredentialManager(tempDir);
    expect(await manager.has("anthropic")).toBe(false);
  });

  test("has returns true for existing credential", async () => {
    const manager = createCredentialManager(tempDir);
    await manager.set("anthropic", { apiKey: "key" });
    expect(await manager.has("anthropic")).toBe(true);
  });

  test("handles all credential types", async () => {
    const manager = createCredentialManager(tempDir);

    await manager.set("anthropic", {
      apiKey: "ant-key",
      baseUrl: "https://api.anthropic.com",
    });
    await manager.set("discord", {
      botToken: "discord-token",
      applicationId: "app-id",
    });
    await manager.set("github", { token: "gh-token" });
    await manager.set("openai", {
      apiKey: "openai-key",
      baseUrl: "https://api.openai.com",
    });

    expect((await manager.get("anthropic"))?.apiKey).toBe("ant-key");
    expect((await manager.get("discord"))?.botToken).toBe("discord-token");
    expect((await manager.get("github"))?.token).toBe("gh-token");
    expect((await manager.get("openai"))?.apiKey).toBe("openai-key");
  });
});
