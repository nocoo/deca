import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  authHeaderName,
  configPath,
  ensureAuthKey,
  resetAuthKey,
} from "./auth";

const withTempCwd = async (fn: (cwd: string) => Promise<void>) => {
  const cwd = join(process.cwd(), ".tmp-test");
  await mkdir(cwd, { recursive: true });
  const original = process.cwd();
  process.chdir(cwd);
  try {
    await fn(cwd);
  } finally {
    process.chdir(original);
    await rm(cwd, { recursive: true, force: true });
  }
};

describe("auth key", () => {
  it("creates a key with sk- prefix", async () => {
    await withTempCwd(async () => {
      const key = await ensureAuthKey();
      expect(key.startsWith("sk-")).toBe(true);
      expect(existsSync(configPath())).toBe(true);
    });
  });

  it("resets key", async () => {
    await withTempCwd(async () => {
      const key1 = await ensureAuthKey();
      const key2 = await resetAuthKey();
      expect(key1).not.toEqual(key2);
    });
  });
});

describe("auth header", () => {
  it("uses x-deca-key", () => {
    expect(authHeaderName).toEqual("x-deca-key");
  });
});
