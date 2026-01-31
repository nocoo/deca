import { Elysia } from 'elysia';

import { authMiddleware } from './state/auth';

export const createApp = () =>
  new Elysia()
    .use(authMiddleware())
    .get('/health', () => ({ ok: true }));
