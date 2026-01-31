import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { authMiddleware } from './state/auth';
import { createAppleScriptProvider } from './providers/applescript';
import type { Provider } from './router/provider';
import { runWithFallback } from './router/runner';

const providers: Provider[] = [createAppleScriptProvider()];

export const createApp = () =>
  new Elysia()
    .use(
      cors({
        origin: ['http://deca.dev.hexly.ai', 'http://deca-console.dev.hexly.ai'],
      })
    )
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
