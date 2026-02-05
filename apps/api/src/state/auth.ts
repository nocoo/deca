import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Elysia } from "elysia";

const rootDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);

const configDir = () => process.env.DECA_CONFIG_DIR || join(rootDir, "config");

export const configPath = () => join(configDir(), "secret.local.json");
const AUTH_HEADER = "x-deca-key";
const KEY_PREFIX = "sk-";

type AuthConfig = {
  key: string;
};

const generateKey = () =>
  `${KEY_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;

const readConfig = async (): Promise<AuthConfig | null> => {
  const path = configPath();
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as AuthConfig;
};

const writeConfig = async (key: string) => {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ key }, null, 2), "utf-8");
};

export const ensureAuthKey = async () => {
  const config = await readConfig();
  if (config?.key?.startsWith(KEY_PREFIX)) return config.key;
  const key = generateKey();
  await writeConfig(key);
  return key;
};

export const getAuthKey = async () => {
  const config = await readConfig();
  return config?.key ?? null;
};

export const resetAuthKey = async () => {
  const key = generateKey();
  await writeConfig(key);
  return key;
};

export const authMiddleware = () => (app: Elysia) =>
  app.onBeforeHandle(async ({ request, set }) => {
    const authKey = await getAuthKey();
    if (!authKey) {
      set.status = 503;
      return { error: "auth_key_missing" };
    }

    const headerValue = request.headers.get(AUTH_HEADER);
    if (headerValue !== authKey) {
      set.status = 401;
      return { error: "unauthorized" };
    }
  });

export const authHeaderName = AUTH_HEADER;
