import { describe, expect, it } from 'bun:test';

import type { Provider } from './provider';
import { runWithFallback } from './runner';

const provider = (type: Provider['type'], available: boolean): Provider => ({
  type,
  isAvailable: async () => available,
  capabilities: {
    isolation: 'process',
    networking: true,
    workspace: true,
  },
  executor: {
    exec: async () => ({
      success: true,
      exitCode: 0,
      stdout: type,
      stderr: '',
      elapsedMs: 1,
    }),
  },
});

describe('runWithFallback', () => {
  it('uses first available provider', async () => {
    const result = await runWithFallback(
      [provider('codex', true), provider('native', true)],
      { command: 'echo' }
    );
    expect(result.provider).toBe('codex');
    expect(result.fallback.used).toBe(false);
  });

  it('falls back when provider unavailable', async () => {
    const result = await runWithFallback(
      [provider('codex', false), provider('native', true)],
      { command: 'echo' }
    );
    expect(result.provider).toBe('native');
    expect(result.fallback.used).toBe(true);
  });
});
