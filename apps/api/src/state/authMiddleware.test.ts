import { describe, expect, it } from 'bun:test';

import { createApp } from '../server';
import { ensureAuthKey } from './auth';

describe('auth middleware', () => {
  it('rejects missing key', async () => {
    const app = createApp();
    const response = await app.handle(new Request('http://127.0.0.1/health'));
    expect(response.status).toBe(401);
  });

  it('accepts valid key', async () => {
    const key = await ensureAuthKey();
    const app = createApp();
    const response = await app.handle(
      new Request('http://127.0.0.1/health', {
        headers: { 'x-deca-key': key },
      })
    );
    expect(response.status).toBe(200);
  });
});
