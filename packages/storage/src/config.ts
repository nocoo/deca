/**
 * Configuration management for Deca storage
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConfigManager, DecaConfig } from "./types";

/**
 * Create a configuration manager
 */
export function createConfigManager(configPath: string): ConfigManager {
  async function load(): Promise<DecaConfig> {
    try {
      const content = await readFile(configPath, "utf-8");
      return JSON.parse(content) as DecaConfig;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async function save(config: DecaConfig): Promise<void> {
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });
    const content = JSON.stringify(config, null, 2);
    await writeFile(configPath, content, { encoding: "utf-8", mode: 0o600 });
  }

  async function get<K extends keyof DecaConfig>(
    key: K,
  ): Promise<DecaConfig[K] | undefined> {
    const config = await load();
    return config[key];
  }

  async function set<K extends keyof DecaConfig>(
    key: K,
    value: DecaConfig[K],
  ): Promise<void> {
    const config = await load();
    config[key] = value;
    await save(config);
  }

  return {
    load,
    save,
    get,
    set,
  };
}
