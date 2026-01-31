import { describe, expect, it } from 'bun:test';

import { createApp } from './server';

describe('auth key endpoint', () => {
  it('rejects unknown origin', async () => {
    const app = createApp();
    const response = await app.handle(
      new Request('http://127.0.0.1/auth/key', {
        headers: {
          origin: 'https://example.com',
        },
      })
    );
    expect(response.status).toBe(403);
  });
});
