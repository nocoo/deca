import type { Provider } from '../router/provider';

import { createAppleScriptExecutor } from '../executors/applescript';

export const createAppleScriptProvider = (): Provider => ({
  type: 'applescript',
  isAvailable: async () => process.platform === 'darwin',
  capabilities: {
    isolation: 'process',
    networking: false,
    workspace: false,
  },
  executor: createAppleScriptExecutor(),
});
