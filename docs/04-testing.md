# 测试规范

> 本文档描述 Deca 的测试策略、覆盖率要求和 Mock 方案

## 测试原则

1. **TDD 优先** - 先写测试，后写实现
2. **90% 覆盖率** - 所有模块必须达到 90%+ 测试覆盖率
3. **隔离测试** - 每个测试独立运行，无副作用
4. **快速反馈** - 单元测试应在秒级完成

## 覆盖率目标

| 模块 | 当前测试数 | 覆盖率目标 | 状态 |
|------|-----------|-----------|------|
| @deca/agent | 319 | 90%+ | ✅ |
| @deca/discord | 218 | 90%+ | ✅ |
| @deca/terminal | 36 | 90%+ | ✅ |
| @deca/http | 35 | 90%+ | ✅ |
| @deca/storage | 29 | 90%+ | ✅ |
| @deca/gateway | 14 | 90%+ | ✅ |
| **总计** | **651** | **90%+** | ✅ |

## 测试类型

### 单元测试

测试单个函数或模块的行为。

```typescript
// packages/agent/src/core/agent.test.ts
import { describe, it, expect } from 'bun:test';
import { createAgent } from './agent';

describe('createAgent', () => {
  it('should create agent with default config', () => {
    const agent = createAgent({ apiKey: 'test-key' });
    expect(agent).toBeDefined();
    expect(agent.run).toBeInstanceOf(Function);
  });

  it('should throw error when apiKey is missing', () => {
    expect(() => createAgent({} as any)).toThrow('apiKey is required');
  });
});
```

### 集成测试

测试多个模块协作的行为。

```typescript
// packages/gateway/src/gateway.test.ts
describe('Gateway Integration', () => {
  it('should route message from terminal to agent', async () => {
    const gateway = createGateway({
      terminal: { enabled: true },
      agent: mockAgentConfig,
    });
    
    await gateway.start();
    const result = await gateway.handleMessage('Hello');
    expect(result.success).toBe(true);
    await gateway.stop();
  });
});
```

### E2E 测试

测试完整的用户场景。

```typescript
// packages/discord/e2e/bot.e2e.ts
describe('Discord Bot E2E', () => {
  it('should respond to user message', async () => {
    // 使用真实的 Discord API（需要测试 token）
    const bot = await createBot({ token: process.env.TEST_DISCORD_TOKEN });
    await bot.connect();
    
    // 发送测试消息
    const response = await bot.sendTestMessage('Hello');
    expect(response).toContain('Echo: Hello');
    
    await bot.disconnect();
  });
});
```

## Mock 策略

### LLM API Mock

```typescript
// packages/agent/src/test-utils/mock-anthropic.ts
export function createMockAnthropic() {
  return {
    messages: {
      create: async (params: any) => ({
        content: [{ type: 'text', text: 'Mock response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    },
  };
}
```

### Discord API Mock

```typescript
// packages/discord/src/test-utils/mock-discord.ts
export function createMockDiscordClient() {
  return {
    login: async () => {},
    on: (event: string, handler: Function) => {},
    sendMessage: async (channelId: string, content: string) => ({
      id: 'mock-message-id',
    }),
  };
}
```

### 文件系统 Mock

```typescript
// 使用临时目录
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = await mkdtemp(join(tmpdir(), 'deca-test-'));
```

## 测试命令

### 运行所有测试

```bash
bun run test:unit
```

### 运行特定模块测试

```bash
bun --filter @deca/agent test:unit
bun --filter @deca/discord test:unit
```

### 运行单个测试文件

```bash
bun test packages/agent/src/core/agent.test.ts
```

### 运行匹配模式的测试

```bash
bun test --filter "should create agent"
```

### 查看覆盖率报告

```bash
bun run test:coverage
```

## 测试文件命名

| 类型 | 命名规则 | 位置 |
|------|---------|------|
| 单元测试 | `*.test.ts` | 与源文件同目录 |
| 集成测试 | `*.integration.ts` | `__tests__/` 目录 |
| E2E 测试 | `*.e2e.ts` | `e2e/` 目录 |

## 测试最佳实践

### 1. 使用描述性测试名称

```typescript
// ✅ 好
it('should return error when session not found', async () => {});

// ❌ 不好
it('test error', async () => {});
```

### 2. 每个测试只验证一件事

```typescript
// ✅ 好
it('should create session', async () => {
  const session = await createSession();
  expect(session.id).toBeDefined();
});

it('should set default values', async () => {
  const session = await createSession();
  expect(session.messages).toEqual([]);
});

// ❌ 不好
it('should create session with defaults', async () => {
  const session = await createSession();
  expect(session.id).toBeDefined();
  expect(session.messages).toEqual([]);
  expect(session.createdAt).toBeDefined();
  // ... 太多断言
});
```

### 3. 使用 beforeEach/afterEach 清理状态

```typescript
describe('SessionManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should save session to disk', async () => {
    // 使用 tempDir
  });
});
```

### 4. 避免测试实现细节

```typescript
// ✅ 好 - 测试行为
it('should persist session across restarts', async () => {
  const manager1 = createSessionManager(dir);
  await manager1.save('session1', { messages: ['hello'] });
  
  const manager2 = createSessionManager(dir);
  const session = await manager2.load('session1');
  expect(session.messages).toEqual(['hello']);
});

// ❌ 不好 - 测试实现
it('should write to sessions.json file', async () => {
  // 不应该测试具体的文件名
});
```

## 相关文档

- [系统架构](01-architecture.md) - 整体架构设计
- [模块详解](02-modules.md) - 各模块功能和接口
- [开发指南](03-development.md) - 本地开发环境配置
- [贡献指南](05-contributing.md) - Git 规范和提交要求
