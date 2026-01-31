import { describe, expect, it } from 'bun:test';

import { createApp } from './server';
import { ensureAuthKey } from './state/auth';

const withKey = async (init?: RequestInit) => {
  const key = await ensureAuthKey();
  return {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
      'x-deca-key': key,
    },
  };
};

describe('capabilities', () => {
  it('returns provider capabilities', async () => {
    const app = createApp();
    const response = await app.handle(
      new Request('http://127.0.0.1/capabilities', await withKey())
    );
    const body = await response.json();
    expect(Array.isArray(body.providers)).toBe(true);
  });
});

describe('providers', () => {
  it('returns provider availability', async () => {
    const app = createApp();
    const response = await app.handle(
      new Request('http://127.0.0.1/providers', await withKey())
    );
    const body = await response.json();
    expect(Array.isArray(body.providers)).toBe(true);
  });
});

describe('exec', () => {
  it('validates command', async () => {
    const app = createApp();
    const response = await app.handle(
      new Request(
        'http://127.0.0.1/exec',
        await withKey({
          method: 'POST',
          body: JSON.stringify({}),
        })
      )
    );
    expect(response.status).toBe(400);
  });
});
