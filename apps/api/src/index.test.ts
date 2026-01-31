import { describe, expect, it } from 'bun:test';

import { createApp } from './server';
import { ensureAuthKey } from './state/auth';

const buildApp = () => createApp();

describe('health', () => {
  it('returns ok true', async () => {
    const app = buildApp();
    const key = await ensureAuthKey();
    const response = await app.handle(
      new Request('http://localhost/health', {
        headers: { 'x-deca-key': key },
      })
    );
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });
});
