import { describe, expect, it } from 'vitest';

import { createConsoleViewModel } from './consoleViewModel';

describe('consoleViewModel', () => {
  it('initializes with default title', () => {
    const viewModel = createConsoleViewModel(fetch);
    expect(viewModel.getState().title).toBe('Deca Console');
  });

  it('updates title', () => {
    const viewModel = createConsoleViewModel(fetch);
    viewModel.setTitle('Updated');
    expect(viewModel.getState().title).toBe('Updated');
  });

  it('fetches health', async () => {
    const viewModel = createConsoleViewModel(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const response = await viewModel.fetchHealth();
    expect(response.ok).toBe(true);
  });
});
