import type { Provider } from './provider';
import type { ExecRequest, ExecResult } from './types';
import { selectProviders } from './selector';

export const runWithFallback = async (
  providers: Provider[],
  request: ExecRequest
): Promise<ExecResult> => {
  const candidates = selectProviders(providers, request);
  const attempted: ExecResult['fallback']['attempted'] = [];
  const start = performance.now();

  for (const provider of candidates) {
    attempted.push(provider.type);
    const available = await provider.isAvailable();
    if (!available) continue;

    const result = await provider.executor.exec(request);
    return {
      ...result,
      provider: provider.type,
      fallback: {
        used: attempted.length > 1,
        reason: attempted.length > 1 ? 'fallback_used' : '',
        attempted,
      },
    };
  }

  const elapsedMs = performance.now() - start;
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: 'no_provider_available',
    elapsedMs,
    provider: attempted[0] ?? 'native',
    fallback: {
      used: false,
      reason: 'no_provider_available',
      attempted,
    },
  };
};
