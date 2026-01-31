import { Elysia } from 'elysia';

import { authHeaderName, authMiddleware, getAuthKey } from './state/auth';
import { createAppleScriptProvider } from './providers/applescript';
import type { Provider } from './router/provider';
import { runWithFallback } from './router/runner';

const providers: Provider[] = [createAppleScriptProvider()];
const allowedOrigins = new Set([
  'https://deca.dev.hexly.ai',
  'https://deca-console.dev.hexly.ai',
]);

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-deca-key',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
};

const applyCors = (origin: string | null, set: Elysia['set']) => {
  const headers = getCorsHeaders(origin);
  if (Object.keys(headers).length === 0) return;
  set.headers = {
    ...set.headers,
    ...headers,
  };
};

export const createApp = () =>
  new Elysia()
    .onAfterHandle(({ request, set }) => {
      if (request.method === 'OPTIONS') return;
      applyCors(request.headers.get('origin'), set);
    })
    .options('*', ({ request }) => {
      const headers = getCorsHeaders(request.headers.get('origin'));
      return new Response(null, { status: 204, headers });
    })
    .get('/auth/key', async ({ request, set }) => {
      const origin = request.headers.get('origin');
      if (!origin || origin !== 'https://deca-console.dev.hexly.ai') {
        set.status = 403;
        return { error: 'forbidden' };
      }
      const key = await getAuthKey();
      if (!key) {
        set.status = 503;
        return { error: 'auth_key_missing' };
      }
      return { key, header: authHeaderName };
    })
    .use(authMiddleware())
    .get('/health', () => ({ ok: true }))
    .get('/capabilities', () => ({
      providers: providers.map((provider) => ({
        type: provider.type,
        capabilities: provider.capabilities,
      })),
    }))
    .get('/providers', async () => ({
      providers: await Promise.all(
        providers.map(async (provider) => ({
          type: provider.type,
          available: await provider.isAvailable(),
          capabilities: provider.capabilities,
        }))
      ),
    }))
    .post('/exec', async ({ body, set }) => {
      const request = body as {
        command?: string;
        provider?: string;
        needsNetwork?: boolean;
        needsIsolation?: boolean;
        needsWorkspace?: boolean;
      };
      if (!request.command) {
        set.status = 400;
        return { error: 'command_required' };
      }
      const result = await runWithFallback(providers, {
        command: request.command,
        provider: request.provider as Provider['type'] | undefined,
        needsNetwork: request.needsNetwork,
        needsIsolation: request.needsIsolation,
        needsWorkspace: request.needsWorkspace,
      });
      return result;
    });
