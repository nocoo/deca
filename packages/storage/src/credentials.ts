/**
 * Credential management for Deca storage
 */

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CredentialManager, CredentialStore } from "./types";

const VALID_CREDENTIALS: (keyof CredentialStore)[] = [
  "glm",
  "minimax",
  "discord",
  "github",
];

/**
 * Create a credential manager
 */
export function createCredentialManager(
  credentialsDir: string,
): CredentialManager {
  function getFilePath(key: keyof CredentialStore): string {
    return join(credentialsDir, `${key}.json`);
  }

  async function get<K extends keyof CredentialStore>(
    key: K,
  ): Promise<CredentialStore[K] | null> {
    try {
      const filePath = getFilePath(key);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as CredentialStore[K];
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function set<K extends keyof CredentialStore>(
    key: K,
    value: CredentialStore[K],
  ): Promise<void> {
    await mkdir(credentialsDir, { recursive: true, mode: 0o700 });
    const filePath = getFilePath(key);
    const content = JSON.stringify(value, null, 2);
    await writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
  }

  async function deleteCredential(key: keyof CredentialStore): Promise<void> {
    try {
      const filePath = getFilePath(key);
      await unlink(filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  async function list(): Promise<(keyof CredentialStore)[]> {
    try {
      const files = await readdir(credentialsDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", "") as keyof CredentialStore)
        .filter((name) => VALID_CREDENTIALS.includes(name));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function has(key: keyof CredentialStore): Promise<boolean> {
    const result = await get(key);
    return result !== null;
  }

  return {
    get,
    set,
    delete: deleteCredential,
    list,
    has,
  };
}
