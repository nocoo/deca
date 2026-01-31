import { describe, expect, it } from 'bun:test';

import { createAppleScriptExecutor } from './applescript';

describe('appleScript executor', () => {
  it('returns error when script missing', async () => {
    const executor = createAppleScriptExecutor();
    const result = await executor.exec({ command: '' });
    expect(result.success).toBe(false);
    expect(result.stderr).toBe('missing_script');
  });
});
