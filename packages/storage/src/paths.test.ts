import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STATE_DIR_NAME, hasProjectDir, resolvePaths } from "./paths";

describe("resolvePaths", () => {
  let tempHome: string;
  let tempCwd: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "deca-test-home-"));
    tempCwd = await mkdtemp(join(tmpdir(), "deca-test-cwd-"));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  });

  test("returns correct default paths", () => {
    const paths = resolvePaths({ homedir: tempHome, cwd: tempCwd });

    expect(paths.stateDir).toBe(join(tempHome, STATE_DIR_NAME));
    expect(paths.configPath).toBe(
      join(tempHome, STATE_DIR_NAME, "config.json"),
    );
    expect(paths.credentialsDir).toBe(
      join(tempHome, STATE_DIR_NAME, "credentials"),
    );
    expect(paths.sessionsDir).toBe(join(tempHome, STATE_DIR_NAME, "sessions"));
    expect(paths.memoryDir).toBe(join(tempHome, STATE_DIR_NAME, "memory"));
  });

  test("projectDir is null when .deca does not exist in cwd", () => {
    const paths = resolvePaths({ homedir: tempHome, cwd: tempCwd });

    expect(paths.projectDir).toBeNull();
    expect(paths.knowledgeDir).toBeNull();
    expect(paths.heartbeatPath).toBeNull();
  });

  test("projectDir is set when .deca exists in cwd", async () => {
    const projectDecaDir = join(tempCwd, STATE_DIR_NAME);
    await mkdir(projectDecaDir);

    const paths = resolvePaths({ homedir: tempHome, cwd: tempCwd });

    expect(paths.projectDir).toBe(projectDecaDir);
    expect(paths.knowledgeDir).toBe(join(projectDecaDir, "knowledge"));
    expect(paths.heartbeatPath).toBe(join(projectDecaDir, "HEARTBEAT.md"));
  });

  test("DECA_STATE_DIR overrides default stateDir", () => {
    const customStateDir = join(tempHome, "custom-deca");
    const paths = resolvePaths({
      homedir: tempHome,
      cwd: tempCwd,
      env: { DECA_STATE_DIR: customStateDir },
    });

    expect(paths.stateDir).toBe(customStateDir);
    expect(paths.configPath).toBe(join(customStateDir, "config.json"));
    expect(paths.credentialsDir).toBe(join(customStateDir, "credentials"));
  });

  test("DECA_CONFIG_PATH overrides config path", () => {
    const customConfigPath = join(tempHome, "my-config.json");
    const paths = resolvePaths({
      homedir: tempHome,
      cwd: tempCwd,
      env: { DECA_CONFIG_PATH: customConfigPath },
    });

    expect(paths.configPath).toBe(customConfigPath);
    // stateDir should still be default
    expect(paths.stateDir).toBe(join(tempHome, STATE_DIR_NAME));
  });

  test("handles ~ in DECA_STATE_DIR", () => {
    const paths = resolvePaths({
      homedir: tempHome,
      cwd: tempCwd,
      env: { DECA_STATE_DIR: "~/.my-deca" },
    });

    expect(paths.stateDir).toBe(join(tempHome, ".my-deca"));
  });
});

describe("hasProjectDir", () => {
  let tempCwd: string;

  beforeEach(async () => {
    tempCwd = await mkdtemp(join(tmpdir(), "deca-test-cwd-"));
  });

  afterEach(async () => {
    await rm(tempCwd, { recursive: true, force: true });
  });

  test("returns false when .deca does not exist", () => {
    expect(hasProjectDir(tempCwd)).toBe(false);
  });

  test("returns true when .deca exists", async () => {
    await mkdir(join(tempCwd, STATE_DIR_NAME));
    expect(hasProjectDir(tempCwd)).toBe(true);
  });
});
