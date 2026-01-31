import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { authMiddleware } from './state/auth';

export const createApp = () =>
  new Elysia()
    .use(
      cors({
        origin: ['http://deca.dev.hexly.ai', 'http://deca-console.dev.hexly.ai'],
      })
    )
    .use(authMiddleware())
    .get('/health', () => ({ ok: true }));
