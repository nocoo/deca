# 测试规范

> 本文档描述 Deca 的测试策略、覆盖率要求和 Mock 方案

## 测试原则

1. **TDD 优先** - 先写测试，后写实现
2. **90% 覆盖率** - 所有模块必须达到 90%+ 测试覆盖率
3. **隔离测试** - 每个测试独立运行，无副作用
4. **快速反馈** - 单元测试应在秒级完成

## 四层测试架构

| 层级 | 类型 | 命令 | 特点 | 运行时机 |
|------|------|------|------|----------|
| 1 | **Unit** | `test:unit` | Mock 依赖，快速，隔离 | pre-commit |
| 2 | **Lint** | `lint` | 静态代码检查 | pre-commit |
| 3 | **E2E** | `test:e2e` | Echo 模式，验证通道集成 | pre-push |
| 4 | **Behavioral** | `test:behavioral` | 真实 LLM，验证 Agent 行为 | 手动/CI |

### 各层详解

#### Layer 1: Unit Test
- **目标**: 验证单个函数/类的逻辑正确性
- **位置**: `packages/*/src/**/*.test.ts`
- **依赖**: 全部 Mock
- **速度**: 秒级完成

#### Layer 2: Lint
- **目标**: 代码风格、类型检查、潜在 bug 检测
- **工具**: Biome
- **速度**: 秒级完成

#### Layer 3: E2E Test
- **目标**: 验证 Discord/HTTP/Terminal 通道的消息流转
- **位置**: `packages/*/src/e2e/`
- **模式**: Echo 模式（无真实 LLM）
- **速度**: 分钟级

#### Layer 4: Behavioral Test
- **目标**: 验证 Agent 在真实环境下的工具使用行为
- **位置**: `packages/gateway/behavioral-tests/`
- **依赖**: 真实 LLM API、真实 Discord
- **速度**: 分钟级，可能有 flaky

```
┌─────────────────────────────────────────────────────────┐
│                    Behavioral Tests                      │
│            (Real LLM, Real Discord, Real FS)            │
├─────────────────────────────────────────────────────────┤
│                       E2E Tests                          │
│              (Echo Mode, Real Channels)                  │
├─────────────────────────────────────────────────────────┤
│                    Lint (Biome)                          │
├─────────────────────────────────────────────────────────┤
│                     Unit Tests                           │
│              (Mocked, Fast, Isolated)                    │
└─────────────────────────────────────────────────────────┘
```

## 覆盖率目标

### 单元测试

| 模块 | 测试数 | 覆盖率目标 | 状态 |
|------|--------|-----------|------|
| @deca/agent | 319 | 90%+ | ✅ |
| @deca/discord | 254 | 90%+ | ✅ |
| @deca/terminal | 47 | 90%+ | ✅ |
| @deca/http | 35 | 90%+ | ✅ |
| @deca/storage | 47 | 90%+ | ✅ |
| @deca/gateway | 37 | 90%+ | ✅ |
| **总计** | **739** | **90%+** | ✅ |

### E2E 测试

| 模块 | 测试数 | 说明 |
|------|--------|------|
| @deca/agent | 56 | Memory + Cron 集成测试 |
| @deca/discord | 3/6 | Core 3 个，Full 6 个 (--core flag) |
| @deca/gateway | 7 | HTTP + Discord 集成 |
| @deca/http | 9 | Server + API Key 认证 |
| @deca/terminal | 6 | REPL + 命令测试 |
| @deca/storage | 22 | Paths + Config + Credentials + Provider |
| **总计** | **103+** | - |

## 测试命令

### 单元测试

```bash
# 运行所有单元测试
bun run test:unit

# 运行特定模块
bun --filter @deca/agent test:unit
bun --filter @deca/discord test:unit

# 运行单个测试文件
bun test packages/agent/src/core/agent.test.ts

# 运行匹配模式的测试
bun test --filter "should create agent"
```

### Lint

```bash
# 运行所有 lint
bun run lint

# 运行特定模块
bun --filter @deca/agent lint
```

### E2E 测试

```bash
# 运行所有 E2E 测试
bun --filter '@deca/*' test:e2e

# 运行特定模块 E2E
bun --filter @deca/agent test:e2e      # Memory + Cron
bun --filter @deca/discord test:e2e    # Discord 通道
bun --filter @deca/gateway test:e2e    # Gateway 集成
bun --filter @deca/http test:e2e       # HTTP API
bun --filter @deca/terminal test:e2e   # Terminal REPL
bun --filter @deca/storage test:e2e    # Storage 层

# Discord E2E 分层运行
bun --filter @deca/discord test:e2e --core  # 仅核心测试 (3个)
bun --filter @deca/discord test:e2e         # 完整测试 (6个)
```

### Behavioral 测试

```bash
# 运行 Agent 工具行为测试（需要 LLM API + Discord）
bun --filter @deca/gateway test:behavioral

# 运行 Memory 工具行为测试
bun --filter @deca/gateway test:behavioral:memory

# 带调试输出
cd packages/gateway && bun run behavioral-tests/tools.test.ts --debug
```

## Git Hooks (Husky)

| Hook | 运行内容 | 目的 |
|------|----------|------|
| pre-commit | Unit + Lint | 快速验证，阻止明显错误 |
| pre-push | Unit + Lint + E2E | 完整验证，阻止破坏性变更 |

## Mock 策略

### LLM API Mock

```typescript
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
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = await mkdtemp(join(tmpdir(), 'deca-test-'));
```

## 测试文件命名

| 类型 | 命名规则 | 位置 |
|------|---------|------|
| 单元测试 | `*.test.ts` | 与源文件同目录 |
| 集成测试 | `*.integration.ts` | `__tests__/` 目录 |
| E2E 测试 | `*.e2e.ts` 或 `e2e/*.ts` | `e2e/` 目录 |
| 行为测试 | `*.test.ts` | `behavioral-tests/` 目录 |

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
```

## 相关文档

- [系统架构](01-architecture.md)
- [模块详解](02-modules.md)
- [开发指南](03-development.md)
- [贡献指南](05-contributing.md)
- [E2E Discord 调试](06-e2e-discord-debugging.md)
- [Agent 工具](07-agent-tools.md)
