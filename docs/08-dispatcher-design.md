# Dispatcher 层设计文档

> 统一请求调度与并发控制

## 1. 背景与动机

### 1.1 当前问题

当前系统存在多个入口调用 Agent：

| 入口 | 当前调用方式 | 问题 |
|------|-------------|------|
| Discord/HTTP/Terminal | `adapter.handle()` → `agent.run()` | ✅ 统一通过 adapter |
| CronService | `onTrigger` 回调直接调用 `agent.run()` | ❌ 绕过 adapter |
| HeartbeatManager | callbacks 数组，不直接调用 agent | ❌ 路径不一致 |

**问题**：
1. **路径不一致**：Cron 和 Heartbeat 绕过了 `MessageHandler` 接口
2. **无并发控制**：多个来源可能同时触发 Agent，造成资源竞争
3. **无队列机制**：高并发时无法排队处理
4. **难以统一监控**：日志和指标分散在多处

### 1.2 目标

引入 **Dispatcher** 层，实现：

1. **统一入口**：所有请求源（Discord、HTTP、Terminal、Cron、Heartbeat）都经过同一抽象层
2. **并发控制**：可配置的并发限制（worker pool）
3. **队列管理**：请求排队、优先级支持
4. **可观测性**：统一的事件回调和状态查询

## 2. 技术选型

### 2.1 库选择：p-queue

经过调研，选择 [p-queue](https://github.com/sindresorhus/p-queue) 作为底层队列实现：

| 库 | 优点 | 缺点 | 结论 |
|----|------|------|------|
| **p-queue** | 轻量、无依赖、TypeScript 原生、功能完整 | ESM only | ✅ **选择** |
| bull/bullmq | 功能强大、可靠 | 需要 Redis、过重 | ❌ 不适合 local-first |
| bottleneck | 并发控制好 | API 较旧 | ❌ |
| 自己实现 | 完全可控 | 重复造轮子 | ❌ |

**p-queue 关键特性**：
- 可配置并发数 (`concurrency`)
- 优先级支持 (`priority`)
- 事件系统 (`EventEmitter`)
- Promise-based API
- 任务超时支持
- 暂停/恢复
- 队列状态查询 (`size`, `pending`, `onIdle()`)

### 2.2 依赖变更

```bash
bun add p-queue
```

**注意**：p-queue 是 ESM-only，项目已使用 ESM，无兼容问题。

## 3. 架构设计

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                           Gateway                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐                           │
│  │ Discord │ │  HTTP   │ │ Terminal │   (User Channels)         │
│  └────┬────┘ └────┬────┘ └────┬─────┘                           │
│       │           │           │                                  │
│  ┌────┴───┐  ┌────┴────┐                                        │
│  │  Cron  │  │Heartbeat│         (System Triggers)              │
│  └────┬───┘  └────┬────┘                                        │
│       │           │                                              │
│       └───────────┼───────────────────────────┘                  │
│                   ↓                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                      Dispatcher                            │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  Request Queue (p-queue)                            │   │  │
│  │  │  - Priority-based ordering                          │   │  │
│  │  │  - Configurable concurrency                         │   │  │
│  │  │  - Event emission (active, idle, error)             │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                          ↓                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  Worker Pool (concurrency slots)                    │   │  │
│  │  │  [slot 1] [slot 2] ... [slot N]                     │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│                     ┌────────────────┐                           │
│                     │     Agent      │                           │
│                     └────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 层级职责

| 层 | 职责 | 不负责 |
|----|------|-------|
| **Channels** | 接收外部消息、协议转换、响应发送 | 并发控制、排队 |
| **Dispatcher** | 请求排队、并发控制、事件通知、统一入口 | 消息协议、Agent 逻辑 |
| **Agent** | AI 对话、工具执行、会话管理 | 调度、排队 |

### 3.3 数据流

```
Discord Message
    │
    ↓
DiscordListener.onMessage()
    │
    ↓
MessageRequest { sessionKey, content, source: 'discord', ... }
    │
    ↓
Dispatcher.dispatch(request)
    │
    ├─→ [Queue] 排队等待
    │
    ↓ (when slot available)
    │
Agent.run(sessionKey, content, callbacks)
    │
    ↓
MessageResponse { text, success }
    │
    ↓
Dispatcher returns Promise<MessageResponse>
    │
    ↓
DiscordListener sends reply
```

## 4. 接口设计

### 4.1 类型定义

```typescript
// packages/gateway/src/dispatcher/types.ts

import type { MessageRequest, MessageResponse } from '../types';

/**
 * 请求来源
 */
export type RequestSource = 
  | 'discord' 
  | 'http' 
  | 'terminal' 
  | 'cron' 
  | 'heartbeat';

/**
 * 扩展的消息请求（增加 source 和 priority）
 */
export interface DispatchRequest extends MessageRequest {
  /** 请求来源 */
  source: RequestSource;
  
  /** 优先级（数字越大越优先，默认 0） */
  priority?: number;
  
  /** 请求 ID（用于追踪和去重） */
  requestId?: string;
}

/**
 * Dispatcher 配置
 */
export interface DispatcherConfig {
  /** 最大并发数（默认 1，即串行执行） */
  concurrency?: number;
  
  /** 单个请求超时时间（毫秒，默认无限制） */
  timeout?: number;
  
  /** 请求处理器（通常是 Agent adapter） */
  handler: DispatchHandler;
  
  /** 事件回调 */
  events?: DispatcherEvents;
}

/**
 * 请求处理器接口（与 MessageHandler 兼容）
 */
export interface DispatchHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * Dispatcher 事件回调
 */
export interface DispatcherEvents {
  /** 请求入队时触发 */
  onEnqueue?: (request: DispatchRequest) => void;
  
  /** 请求开始执行时触发 */
  onActive?: (request: DispatchRequest) => void;
  
  /** 请求完成时触发 */
  onComplete?: (request: DispatchRequest, response: MessageResponse) => void;
  
  /** 请求失败时触发 */
  onError?: (request: DispatchRequest, error: Error) => void;
  
  /** 队列空闲时触发 */
  onIdle?: () => void;
}

/**
 * Dispatcher 状态
 */
export interface DispatcherStatus {
  /** 队列中等待的请求数 */
  queued: number;
  
  /** 正在执行的请求数 */
  running: number;
  
  /** 最大并发数 */
  concurrency: number;
  
  /** 是否暂停 */
  isPaused: boolean;
}

/**
 * Dispatcher 接口
 */
export interface Dispatcher {
  /**
   * 派发请求到队列
   * @returns Promise，在请求完成时 resolve
   */
  dispatch(request: DispatchRequest): Promise<MessageResponse>;
  
  /**
   * 获取当前状态
   */
  getStatus(): DispatcherStatus;
  
  /**
   * 暂停队列处理
   */
  pause(): void;
  
  /**
   * 恢复队列处理
   */
  resume(): void;
  
  /**
   * 清空队列（不影响正在执行的请求）
   */
  clear(): void;
  
  /**
   * 等待队列空闲
   */
  onIdle(): Promise<void>;
  
  /**
   * 关闭 Dispatcher
   */
  shutdown(): Promise<void>;
}
```

### 4.2 实现

```typescript
// packages/gateway/src/dispatcher/dispatcher.ts

import PQueue from 'p-queue';
import type {
  Dispatcher,
  DispatcherConfig,
  DispatcherStatus,
  DispatchRequest,
} from './types';
import type { MessageResponse } from '../types';

export function createDispatcher(config: DispatcherConfig): Dispatcher {
  const { 
    concurrency = 1, 
    timeout,
    handler, 
    events = {} 
  } = config;

  const queue = new PQueue({ 
    concurrency,
    timeout,
  });

  // 绑定事件
  queue.on('idle', () => {
    events.onIdle?.();
  });

  async function dispatch(request: DispatchRequest): Promise<MessageResponse> {
    events.onEnqueue?.(request);

    const response = await queue.add(
      async () => {
        events.onActive?.(request);
        
        try {
          const result = await handler.handle(request);
          events.onComplete?.(request, result);
          return result;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          events.onError?.(request, err);
          throw err;
        }
      },
      {
        priority: request.priority ?? 0,
        id: request.requestId,
      }
    );

    // p-queue.add 返回 T | void，这里需要处理
    if (!response) {
      throw new Error('Unexpected empty response from handler');
    }

    return response;
  }

  function getStatus(): DispatcherStatus {
    return {
      queued: queue.size,
      running: queue.pending,
      concurrency,
      isPaused: queue.isPaused,
    };
  }

  function pause(): void {
    queue.pause();
  }

  function resume(): void {
    queue.start();
  }

  function clear(): void {
    queue.clear();
  }

  async function onIdle(): Promise<void> {
    await queue.onIdle();
  }

  async function shutdown(): Promise<void> {
    queue.pause();
    queue.clear();
    await queue.onIdle();
  }

  return {
    dispatch,
    getStatus,
    pause,
    resume,
    clear,
    onIdle,
    shutdown,
  };
}
```

### 4.3 MessageHandler 适配器

为了让 Channels 仍然使用 `MessageHandler` 接口，提供一个适配器：

```typescript
// packages/gateway/src/dispatcher/handler-adapter.ts

import type { MessageHandler, MessageRequest, MessageResponse } from '../types';
import type { Dispatcher, DispatchRequest, RequestSource } from './types';

/**
 * 创建一个 MessageHandler，将请求转发到 Dispatcher
 */
export function createDispatcherHandler(
  dispatcher: Dispatcher,
  source: RequestSource
): MessageHandler {
  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      const dispatchRequest: DispatchRequest = {
        ...request,
        source,
        priority: getSourcePriority(source),
        requestId: generateRequestId(),
      };
      
      return dispatcher.dispatch(dispatchRequest);
    },
  };
}

/**
 * 不同来源的默认优先级
 */
function getSourcePriority(source: RequestSource): number {
  const priorities: Record<RequestSource, number> = {
    discord: 10,    // 用户消息高优先级
    http: 10,       // API 请求高优先级
    terminal: 10,   // 终端交互高优先级
    cron: 5,        // 定时任务中等优先级
    heartbeat: 1,   // 心跳最低优先级
  };
  return priorities[source];
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

## 5. 集成改造

### 5.1 Gateway 改造

```typescript
// packages/gateway/src/gateway.ts (改造后)

import { createDispatcher, createDispatcherHandler } from './dispatcher';

export function createGateway(config: GatewayConfig): Gateway {
  // ...

  async function start(): Promise<void> {
    // 1. 创建 Agent Adapter
    adapter = await createAgentAdapter(config.agent);
    
    // 2. 创建 Dispatcher（包装 adapter）
    dispatcher = createDispatcher({
      concurrency: config.dispatcher?.concurrency ?? 1,
      timeout: config.dispatcher?.timeout,
      handler: adapter,
      events: {
        onEnqueue: (req) => events.onMessage?.(req.source, req.sessionKey),
        onComplete: (req, res) => events.onResponse?.(req.source, req.sessionKey, res.success),
        onError: (req, err) => events.onError?.(err, req.source),
        onIdle: () => { /* 可选：记录日志 */ },
      },
    });
    
    // 3. 为每个 Channel 创建 handler
    const discordHandler = createDispatcherHandler(dispatcher, 'discord');
    const httpHandler = createDispatcherHandler(dispatcher, 'http');
    const terminalHandler = createDispatcherHandler(dispatcher, 'terminal');
    
    // 4. 启动 Channels（使用各自的 handler）
    if (discord) {
      discordGateway = createDiscordGateway({
        token: discord.token,
        handler: discordHandler,  // 使用 dispatcher handler
        // ...
      });
    }
    
    // 5. 改造 CronService（通过 dispatcher 调用）
    if (config.agent.enableCron) {
      cronService = new CronService({
        storagePath: config.agent.cronStoragePath,
        onTrigger: async (job) => {
          const cronHandler = createDispatcherHandler(dispatcher, 'cron');
          await cronHandler.handle({
            sessionKey: `cron:${job.id}`,
            content: `[CRON TASK: ${job.name}] ${job.instruction}`,
            sender: { id: 'system', username: 'cron' },
          });
        },
      });
    }
    
    // 6. 改造 Heartbeat（通过 dispatcher 调用）
    if (config.agent.enableHeartbeat) {
      adapter.agent.startHeartbeat(async (tasks, request) => {
        if (tasks.length === 0) return;
        
        const heartbeatHandler = createDispatcherHandler(dispatcher, 'heartbeat');
        await heartbeatHandler.handle({
          sessionKey: 'heartbeat',
          content: buildHeartbeatPrompt(tasks),
          sender: { id: 'system', username: 'heartbeat' },
        });
      });
    }
  }
}
```

### 5.2 配置扩展

```typescript
// packages/gateway/src/types.ts

export interface GatewayConfig {
  agent: AgentAdapterConfig;
  discord?: DiscordChannelConfig;
  terminal?: TerminalChannelConfig;
  http?: HttpChannelConfig;
  events?: GatewayEventCallbacks;
  
  /** Dispatcher 配置 (NEW) */
  dispatcher?: DispatcherConfig;
}

export interface DispatcherConfig {
  /** 最大并发数（默认 1） */
  concurrency?: number;
  
  /** 请求超时（毫秒） */
  timeout?: number;
}
```

## 6. 测试策略

### 6.1 四层测试覆盖

| 层级 | 测试内容 | 文件位置 |
|------|---------|---------|
| **Unit** | Dispatcher 核心逻辑、队列行为、优先级 | `dispatcher/*.test.ts` |
| **Lint** | 类型检查、代码风格 | `bun run lint` |
| **E2E** | Echo 模式下的多来源调度 | `e2e/dispatcher.e2e.ts` |
| **Behavioral** | 真实 LLM + 多来源并发 | `behavioral-tests/dispatcher.test.ts` |

### 6.2 Unit Test 用例

```typescript
// packages/gateway/src/dispatcher/dispatcher.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDispatcher } from './dispatcher';
import type { DispatchHandler, DispatchRequest } from './types';

describe('Dispatcher', () => {
  let mockHandler: DispatchHandler;

  beforeEach(() => {
    mockHandler = {
      handle: vi.fn().mockResolvedValue({ text: 'response', success: true }),
    };
  });

  describe('basic dispatch', () => {
    it('should dispatch request to handler', async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });
      
      const request: DispatchRequest = {
        sessionKey: 'test-session',
        content: 'hello',
        source: 'discord',
        sender: { id: 'user1' },
      };
      
      const response = await dispatcher.dispatch(request);
      
      expect(mockHandler.handle).toHaveBeenCalledWith(request);
      expect(response.success).toBe(true);
    });
  });

  describe('concurrency control', () => {
    it('should limit concurrent executions', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(r => setTimeout(r, 50));
          concurrent--;
          return { text: 'ok', success: true };
        }),
      };
      
      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 2,
      });
      
      // 派发 5 个请求
      const requests = Array.from({ length: 5 }, (_, i) => ({
        sessionKey: `session-${i}`,
        content: `request-${i}`,
        source: 'http' as const,
        sender: { id: 'user' },
      }));
      
      await Promise.all(requests.map(r => dispatcher.dispatch(r)));
      
      expect(maxConcurrent).toBe(2);
    });
  });

  describe('priority ordering', () => {
    it('should process high priority requests first', async () => {
      const order: string[] = [];
      
      const trackingHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async (req) => {
          order.push(req.content);
          return { text: 'ok', success: true };
        }),
      };
      
      const dispatcher = createDispatcher({
        handler: trackingHandler,
        concurrency: 1,
      });
      
      // 暂停队列以便设置顺序
      dispatcher.pause();
      
      // 添加不同优先级的请求
      const p1 = dispatcher.dispatch({
        sessionKey: 's1',
        content: 'low',
        source: 'heartbeat',
        priority: 1,
        sender: { id: 'system' },
      });
      
      const p2 = dispatcher.dispatch({
        sessionKey: 's2',
        content: 'high',
        source: 'discord',
        priority: 10,
        sender: { id: 'user' },
      });
      
      const p3 = dispatcher.dispatch({
        sessionKey: 's3',
        content: 'medium',
        source: 'cron',
        priority: 5,
        sender: { id: 'system' },
      });
      
      dispatcher.resume();
      await Promise.all([p1, p2, p3]);
      
      // 高优先级应该先执行
      expect(order).toEqual(['high', 'medium', 'low']);
    });
  });

  describe('events', () => {
    it('should emit onEnqueue when request added', async () => {
      const onEnqueue = vi.fn();
      
      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onEnqueue },
      });
      
      await dispatcher.dispatch({
        sessionKey: 's1',
        content: 'test',
        source: 'http',
        sender: { id: 'user' },
      });
      
      expect(onEnqueue).toHaveBeenCalledTimes(1);
    });

    it('should emit onComplete when request succeeds', async () => {
      const onComplete = vi.fn();
      
      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onComplete },
      });
      
      await dispatcher.dispatch({
        sessionKey: 's1',
        content: 'test',
        source: 'http',
        sender: { id: 'user' },
      });
      
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('should emit onError when request fails', async () => {
      const onError = vi.fn();
      const failHandler: DispatchHandler = {
        handle: vi.fn().mockRejectedValue(new Error('fail')),
      };
      
      const dispatcher = createDispatcher({
        handler: failHandler,
        events: { onError },
      });
      
      await expect(
        dispatcher.dispatch({
          sessionKey: 's1',
          content: 'test',
          source: 'http',
          sender: { id: 'user' },
        })
      ).rejects.toThrow('fail');
      
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('status', () => {
    it('should report correct queue status', async () => {
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise(r => setTimeout(r, 100));
          return { text: 'ok', success: true };
        }),
      };
      
      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 1,
      });
      
      // 添加请求但不 await
      const promise = dispatcher.dispatch({
        sessionKey: 's1',
        content: 'test',
        source: 'http',
        sender: { id: 'user' },
      });
      
      // 等一下让请求开始执行
      await new Promise(r => setTimeout(r, 10));
      
      const status = dispatcher.getStatus();
      expect(status.running).toBe(1);
      expect(status.queued).toBe(0);
      
      await promise;
    });
  });

  describe('pause/resume', () => {
    it('should pause and resume processing', async () => {
      const dispatcher = createDispatcher({
        handler: mockHandler,
        concurrency: 1,
      });
      
      dispatcher.pause();
      expect(dispatcher.getStatus().isPaused).toBe(true);
      
      dispatcher.resume();
      expect(dispatcher.getStatus().isPaused).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should clear queue on shutdown', async () => {
      const dispatcher = createDispatcher({
        handler: mockHandler,
        concurrency: 1,
      });
      
      dispatcher.pause();
      
      // 添加请求（不会执行因为已暂停）
      const promise = dispatcher.dispatch({
        sessionKey: 's1',
        content: 'test',
        source: 'http',
        sender: { id: 'user' },
      });
      
      await dispatcher.shutdown();
      
      expect(dispatcher.getStatus().queued).toBe(0);
    });
  });
});
```

### 6.3 E2E Test 用例

```typescript
// packages/gateway/e2e/dispatcher.e2e.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGateway, createEchoAdapter } from '../src';

describe('Dispatcher E2E', () => {
  let gateway: Gateway;

  beforeAll(async () => {
    gateway = createGateway({
      agent: { /* echo mode config */ },
      dispatcher: { concurrency: 2 },
    });
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
  });

  it('should handle concurrent requests from multiple sources', async () => {
    // 模拟并发请求
    const requests = [
      { source: 'http', content: 'http-request' },
      { source: 'discord', content: 'discord-request' },
      { source: 'cron', content: 'cron-request' },
    ];
    
    const results = await Promise.all(
      requests.map(r => gateway.handler.dispatch({
        sessionKey: `test-${r.source}`,
        content: r.content,
        source: r.source,
        sender: { id: 'test' },
      }))
    );
    
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

## 7. 实施计划

### 7.1 原子化提交

| 阶段 | Commit | 内容 |
|------|--------|------|
| 1 | `feat: add p-queue dependency` | 添加依赖 |
| 2 | `feat: add dispatcher types` | 类型定义 |
| 3 | `feat: implement createDispatcher` | 核心实现 + 单元测试 |
| 4 | `feat: add dispatcher handler adapter` | Handler 适配器 |
| 5 | `refactor: integrate dispatcher into gateway` | Gateway 集成 |
| 6 | `refactor: route cron through dispatcher` | Cron 改造 |
| 7 | `refactor: route heartbeat through dispatcher` | Heartbeat 改造 |
| 8 | `test: add dispatcher e2e tests` | E2E 测试 |
| 9 | `docs: add dispatcher design doc` | 文档 |

### 7.2 每步验证

每个 commit 后执行：

```bash
# 单元测试
bun run test:unit

# Lint
bun run lint

# 类型检查
bun run typecheck
```

集成完成后：

```bash
# E2E 测试
bun --filter @deca/gateway test:e2e

# Behavioral 测试（如有配置）
bun --filter @deca/gateway test:behavioral
```

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| p-queue 版本更新 breaking | 编译失败 | 锁定版本，定期更新 |
| 并发设置不当导致 OOM | 系统崩溃 | 默认 concurrency=1，文档说明 |
| 队列积压过深 | 响应延迟 | 添加 maxQueueSize 配置，超出拒绝 |
| Cron/Heartbeat 改造兼容性 | 功能回退 | 充分测试，灰度发布 |

## 9. 未来扩展

1. **请求去重**：相同 sessionKey 的请求合并
2. **优先级队列可视化**：暴露 API 查询队列状态
3. **死信队列**：失败请求的重试机制
4. **指标收集**：Prometheus 指标导出
5. **背压控制**：队列满时拒绝新请求

## 10. 参考

- [p-queue GitHub](https://github.com/sindresorhus/p-queue)
- [Directus API 使用 p-queue](https://github.com/directus/directus/blob/main/app/src/api.ts)
- [Nextcloud 使用 p-queue](https://github.com/nextcloud/server/blob/master/apps/files/src/views/folderTree.ts)
