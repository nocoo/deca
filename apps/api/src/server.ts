import { Elysia } from 'elysia';

import { authMiddleware } from './state/auth';
import { createAppleScriptProvider } from './providers/applescript';
import type { Provider } from './router/provider';
import { runWithFallback } from './router/runner';

const providers: Provider[] = [createAppleScriptProvider()];
const allowedOrigins = new Set([
  'https://deca.dev.hexly.ai',
  'https://deca-console.dev.hexly.ai',
]);

const applyCors = (origin: string | null, set: Elysia['set']) => {
  if (!origin || !allowedOrigins.has(origin)) return;
  set.headers = {
    ...set.headers,
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-deca-key',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
};

export const createApp = () =>
  new Elysia()
    .onRequest(({ request, set }) => {
      applyCors(request.headers.get('origin'), set);
    })
    .onAfterHandle(({ request, set }) => {
      applyCors(request.headers.get('origin'), set);
    })
    .options('*', ({ request, set }) => {
      applyCors(request.headers.get('origin'), set);
      set.status = 204;
      return null;
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
