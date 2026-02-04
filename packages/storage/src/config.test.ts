import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigManager } from "./config";

describe("createConfigManager", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "deca-config-test-"));
    configPath = join(tempDir, "config.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates manager successfully", () => {
    const manager = createConfigManager(configPath);
    expect(manager).toBeDefined();
    expect(manager.load).toBeFunction();
    expect(manager.save).toBeFunction();
    expect(manager.get).toBeFunction();
    expect(manager.set).toBeFunction();
  });

  test("load returns empty config when file does not exist", async () => {
    const manager = createConfigManager(configPath);
    const config = await manager.load();
    expect(config).toEqual({});
  });

  test("save creates config file", async () => {
    const manager = createConfigManager(configPath);
    await manager.save({ models: { default: "claude-sonnet" } });

    const config = await manager.load();
    expect(config.models?.default).toBe("claude-sonnet");
  });

  test("save creates parent directory if not exists", async () => {
    const nestedPath = join(tempDir, "nested", "deep", "config.json");
    const manager = createConfigManager(nestedPath);

    await manager.save({ agent: { maxTurns: 10 } });

    const config = await manager.load();
    expect(config.agent?.maxTurns).toBe(10);
  });

  test("get returns undefined for missing key", async () => {
    const manager = createConfigManager(configPath);
    const value = await manager.get("models");
    expect(value).toBeUndefined();
  });

  test("get returns value for existing key", async () => {
    const manager = createConfigManager(configPath);
    await manager.save({
      models: { default: "claude-sonnet" },
      agent: { maxTurns: 20 },
    });

    const models = await manager.get("models");
    expect(models?.default).toBe("claude-sonnet");

    const agent = await manager.get("agent");
    expect(agent?.maxTurns).toBe(20);
  });

  test("set updates single key", async () => {
    const manager = createConfigManager(configPath);
    await manager.save({ models: { default: "old-model" } });

    await manager.set("agent", { maxTurns: 30 });

    const config = await manager.load();
    expect(config.models?.default).toBe("old-model");
    expect(config.agent?.maxTurns).toBe(30);
  });

  test("set overwrites existing key", async () => {
    const manager = createConfigManager(configPath);
    await manager.save({ agent: { maxTurns: 10, enableHeartbeat: true } });

    await manager.set("agent", { maxTurns: 50 });

    const config = await manager.load();
    expect(config.agent?.maxTurns).toBe(50);
    expect(config.agent?.enableHeartbeat).toBeUndefined();
  });

  test("handles complex nested config", async () => {
    const manager = createConfigManager(configPath);
    const complexConfig = {
      models: {
        default: "claude-sonnet",
        providers: {
          anthropic: { baseUrl: "https://api.anthropic.com" },
          minimax: { baseUrl: "https://api.minimax.com", model: "MiniMax-M2" },
        },
      },
      channels: {
        discord: {
          enabled: true,
          defaultChannelId: "123456",
          allowedUsers: ["user1", "user2"],
        },
      },
      logging: {
        level: "debug" as const,
        file: "/var/log/deca.log",
      },
    };

    await manager.save(complexConfig);
    const loaded = await manager.load();

    expect(loaded).toEqual(complexConfig);
  });
});
