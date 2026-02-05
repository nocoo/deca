# Agent 系统架构设计

## 概述

Deca Agent 是一个本地运行的 AI Agent 系统，允许 AI 通过 Discord 或 Heartbeat 机制主动与用户交互，并通过工具层控制本地 macOS 机器。

### 设计目标

1. **模块化** - Agent 核心与 I/O 层分离，便于测试和扩展
2. **可测试** - TDD 开发，每个模块独立测试
3. **可扩展** - 新增通道（Slack、Telegram）只需添加 adapter
4. **简洁优先** - 最小 MVP，避免过度设计

### 参考项目

- `references/openclaw-mini` - 简化教学版本，约 4,800 行
- `references/openclaw` - 完整生产版本，约 50,000+ 行

---

## 整体架构

```
                    ┌─────────────────────────────────────────────┐
                    │              apps/api/                      │
                    │         (单进程，多入口)                      │
                    ├─────────────────────────────────────────────┤
                    │                                             │
  Discord ─────────►│  Gateway (Discord Bot)                      │
  (用户消息)         │      │                                      │
                    │      │                                      │
                    │      ▼                                      │
  Heartbeat ───────►│  ┌─────────────────┐                        │
  (定时任务)         │  │     Agent       │◄──── Heartbeat Timer   │
                    │  │   (AI 决策)      │                        │
                    │  └─────────────────┘                        │
                    │      │                                      │
                    │      ▼                                      │
                    │  Tools (工具层)                              │
                    │    - AppleScript                            │
                    │    - GitHub CLI                             │
                    │    - Claude Code CLI                        │
                    │    - 文件操作                                │
                    │    - Shell 命令                              │
                    │                                             │
                    │  HTTP Server (现有)                         │
                    │    - /exec                                  │
                    │    - /capabilities                          │
                    │    - /providers                             │
                    └─────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  macOS / 本地    │
                    └─────────────────┘
```

---

## 核心组件

### 1. Gateway (通道层)

负责与外部通信渠道（Discord）的连接和消息收发。

| 职责 | 说明 |
|------|------|
| 连接管理 | Discord WebSocket 连接、重连 |
| 消息解析 | 将 Discord 消息转换为 Agent 输入 |
| 输出格式化 | 将 Agent 响应格式化为 Discord 消息 |
| 进程保活 | WebSocket 连接保持进程运行 |

```
apps/api/src/channels/
├── discord/
│   ├── gateway.ts         # Discord WebSocket 连接
│   ├── gateway.test.ts
│   ├── handlers.ts        # 消息处理
│   ├── handlers.test.ts
│   ├── formatter.ts       # 输出格式化
│   └── formatter.test.ts
└── types.ts               # 通道接口定义
```

### 2. Agent (核心层)

AI 决策引擎，负责对话管理和工具调用。

| 职责 | 说明 |
|------|------|
| Agent Loop | 循环调用 LLM 直到任务完成 |
| 工具调用 | 解析 tool_use，执行工具，返回结果 |
| 会话管理 | 持久化对话历史 |
| Heartbeat | 定时检查任务，主动唤醒 |

```
packages/agent/
├── src/
│   ├── core/
│   │   ├── agent.ts           # Agent 核心循环
│   │   ├── agent.test.ts
│   │   ├── session.ts         # 会话管理
│   │   └── session.test.ts
│   ├── heartbeat/
│   │   ├── manager.ts         # Heartbeat 调度
│   │   ├── manager.test.ts
│   │   ├── parser.ts          # HEARTBEAT.md 解析
│   │   └── parser.test.ts
│   ├── tools/
│   │   ├── types.ts           # Tool 接口定义
│   │   ├── registry.ts        # 工具注册
│   │   └── registry.test.ts
│   ├── types.ts
│   └── index.ts
└── package.json
```

### 3. Tools (工具层)

Agent 可调用的工具集合，复用现有 executors。

| 工具 | 说明 | 实现 |
|------|------|------|
| AppleScript | macOS 自动化 | `executors/applescript.ts` |
| Shell | 执行命令 | `executors/native.ts` |
| Read | 读取文件 | 新增 |
| Write | 写入文件 | 新增 |
| Edit | 编辑文件 | 新增 |
| GitHub | GitHub CLI 操作 | 新增 |

```
apps/api/src/agent/
├── instance.ts            # Agent 单例管理
├── tools.ts               # 工具注册（包装 executors）
├── tools.test.ts
└── routes.ts              # Agent API 路由
```

---

## 数据流

### 流程 1：Discord 消息触发

```
1. Discord 用户发送消息
       ↓
2. gateway.ts 收到 MESSAGE_CREATE 事件
       ↓
3. handlers.ts 解析消息，提取内容
       ↓
4. 调用 agent.run(sessionId, message, callbacks)
       ↓
5. Agent Loop:
   a. 构建 system prompt + 历史消息
   b. 调用 LLM (Anthropic API)
   c. 解析响应：
      - text → callbacks.onTextDelta
      - tool_use → 执行工具 → 添加 tool_result → 继续循环
   d. stop_reason = "end_turn" → 结束
       ↓
6. callbacks.onTextDelta → formatter.ts → 发送到 Discord
       ↓
7. 会话保存到 sessions/
```

### 流程 2：Heartbeat 主动唤醒

```
1. Heartbeat Timer 触发 (setTimeout)
       ↓
2. 读取 HEARTBEAT.md，解析任务
       ↓
3. 如果有未完成任务：
   a. 构建任务 prompt
   b. 调用 agent.run(sessionId, tasksPrompt)
       ↓
4. Agent 执行任务（可能调用工具）
       ↓
5. 结果 → formatter.ts → 发送到 Discord
       ↓
6. 更新 HEARTBEAT.md（标记完成）
```

---

## 接口设计

### Agent 接口

```typescript
// packages/agent/src/types.ts

export interface AgentConfig {
  /** Anthropic API Key */
  apiKey: string;
  /** API Base URL */
  baseUrl?: string;
  /** Model ID */
  model?: string;
  /** 工具列表 */
  tools?: Tool[];
  /** 最大循环次数 */
  maxTurns?: number;
  /** 会话存储目录 */
  sessionDir?: string;
  /** Heartbeat 配置 */
  heartbeat?: {
    enabled?: boolean;
    intervalMs?: number;
    filePath?: string;
  };
}

export interface AgentCallbacks {
  /** 流式文本增量 */
  onTextDelta?: (delta: string) => void;
  /** 文本完成 */
  onTextComplete?: (text: string) => void;
  /** 工具调用开始 */
  onToolStart?: (name: string, input: unknown) => void;
  /** 工具调用结束 */
  onToolEnd?: (name: string, result: string) => void;
}

export interface RunResult {
  /** 最终文本 */
  text: string;
  /** 总轮次 */
  turns: number;
  /** 工具调用次数 */
  toolCalls: number;
}
```

### Tool 接口

```typescript
// packages/agent/src/tools/types.ts

export interface Tool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入 Schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
  /** 执行函数 */
  execute: (input: unknown, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  /** 工作目录 */
  workspaceDir: string;
  /** 会话 ID */
  sessionId: string;
}
```

### Channel 接口

```typescript
// apps/api/src/channels/types.ts

export interface Channel {
  /** 通道类型 */
  type: 'discord' | 'slack' | 'telegram';
  /** 启动连接 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 发送消息 */
  send(channelId: string, message: string): Promise<void>;
  /** 消息处理器 */
  onMessage(handler: MessageHandler): void;
}

export interface MessageHandler {
  (message: IncomingMessage): Promise<void>;
}

export interface IncomingMessage {
  channelId: string;
  userId: string;
  content: string;
  timestamp: number;
}
```

---

## 与现有系统的集成

### 复用 Executors

现有的 `apps/api/src/executors/` 将被包装成 Agent Tools：

```typescript
// apps/api/src/agent/tools.ts

import { executeAppleScript } from '../executors/applescript';
import type { Tool } from '@deca/agent';

export const applescriptTool: Tool = {
  name: 'applescript',
  description: 'Execute AppleScript on macOS',
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'AppleScript code to execute' }
    },
    required: ['script']
  },
  execute: async (input, context) => {
    const { script } = input as { script: string };
    const result = await executeAppleScript(script);
    return result.stdout || result.stderr || 'Script executed successfully';
  }
};
```

### HTTP API 扩展

在现有 `server.ts` 基础上添加 Agent 路由：

```typescript
// apps/api/src/agent/routes.ts

export function agentRoutes(app: Elysia) {
  return app
    .post('/agent/chat', async ({ body }) => {
      const { sessionId, message } = body as { sessionId: string; message: string };
      const result = await agent.run(sessionId, message);
      return result;
    })
    .get('/agent/sessions', async () => {
      return agent.listSessions();
    })
    .delete('/agent/sessions/:id', async ({ params }) => {
      await agent.reset(params.id);
      return { ok: true };
    });
}
```

---

## 进程模型

单进程，多入口：

```
┌─────────────────────────────────────────────┐
│              apps/api 进程                   │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐  ┌──────────────┐         │
│  │ HTTP Server  │  │ Discord Bot  │         │
│  │  (Elysia)    │  │ (WebSocket)  │         │
│  └──────────────┘  └──────────────┘         │
│         │                 │                 │
│         └────────┬────────┘                 │
│                  ▼                          │
│         ┌──────────────┐                    │
│         │    Agent     │                    │
│         │  (单例)      │                    │
│         └──────────────┘                    │
│                  │                          │
│                  ▼                          │
│         ┌──────────────┐                    │
│         │   Tools      │                    │
│         └──────────────┘                    │
│                                             │
│  ┌──────────────────────────────────┐       │
│  │       Heartbeat Timer            │       │
│  │  (setTimeout, 非 setInterval)    │       │
│  └──────────────────────────────────┘       │
│                                             │
└─────────────────────────────────────────────┘
```

保活机制：
- Discord WebSocket 连接保持进程运行
- HTTP Server 监听保持进程运行
- Heartbeat 使用 setTimeout 精确调度，不阻塞事件循环

---

## 安全考虑

### 工具权限

| 工具 | 风险等级 | 控制措施 |
|------|---------|---------|
| Read | 低 | 限制可读目录 |
| Write | 中 | 限制可写目录，备份机制 |
| Shell | 高 | 命令白名单，沙箱执行 |
| AppleScript | 高 | 脚本审计，TCC 权限 |

### Discord 权限

- Bot Token 存储在 `~/.deca/credentials/discord.json`
- 只响应指定 Channel 或 DM
- 可配置允许的用户 ID 列表

---

## 扩展性

### 添加新通道

```typescript
// apps/api/src/channels/slack/gateway.ts

import type { Channel } from '../types';

export function createSlackChannel(config: SlackConfig): Channel {
  return {
    type: 'slack',
    connect: async () => { /* WebSocket 连接 */ },
    disconnect: async () => { /* 断开连接 */ },
    send: async (channelId, message) => { /* 发送消息 */ },
    onMessage: (handler) => { /* 注册处理器 */ }
  };
}
```

### 添加新工具

```typescript
// apps/api/src/agent/tools/github.ts

export const githubTool: Tool = {
  name: 'github',
  description: 'Execute GitHub CLI commands',
  inputSchema: { /* ... */ },
  execute: async (input, context) => { /* ... */ }
};
```

---

## 测试策略

### 单元测试

| 模块 | 测试重点 |
|------|---------|
| Agent | 循环逻辑、工具调用、会话管理 |
| Heartbeat | 调度精度、任务解析、重复抑制 |
| Tools | 输入验证、执行结果、错误处理 |
| Gateway | 消息解析、连接管理、重连逻辑 |

### 集成测试

| 场景 | 测试内容 |
|------|---------|
| Discord → Agent → Tool | 端到端消息处理 |
| Heartbeat → Agent → Discord | 主动通知流程 |
| HTTP → Agent | API 调用流程 |

### Mock 策略

- LLM API: 使用 Mock 响应
- Discord API: 使用 Mock WebSocket
- 文件系统: 使用临时目录

---

## 相关文档

- [00-architecture.md](./00-architecture.md) - 现有架构
- [08-storage-system.md](./08-storage-system.md) - 存储系统设计
- [09-agent-milestones.md](./09-agent-milestones.md) - 里程碑计划
