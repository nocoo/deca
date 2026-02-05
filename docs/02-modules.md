# 模块详解

> 本文档详细介绍 Deca 各模块的功能、接口和使用方式

## 模块概览

| 模块 | 包名 | 说明 | 测试数 |
|------|------|------|--------|
| Agent | @deca/agent | AI Agent 核心 | 319 |
| Storage | @deca/storage | 持久化层 | 29 |
| Discord | @deca/discord | Discord 机器人通道 | 218 |
| Terminal | @deca/terminal | 终端 REPL 通道 | 36 |
| HTTP | @deca/http | HTTP API 通道 | 35 |
| Gateway | @deca/gateway | 组装层 | 14 |

---

## @deca/agent

AI Agent 核心模块，负责对话管理和工具执行。

### 目录结构

```
packages/agent/src/
├── core/
│   ├── agent.ts           # Agent 核心循环
│   ├── session.ts         # 会话管理
│   └── *.test.ts
├── heartbeat/
│   ├── manager.ts         # Heartbeat 调度
│   ├── parser.ts          # HEARTBEAT.md 解析
│   └── *.test.ts
├── tools/
│   ├── types.ts           # Tool 接口定义
│   ├── registry.ts        # 工具注册
│   └── *.test.ts
└── index.ts
```

### 核心接口

```typescript
// Agent 配置
interface AgentConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  tools?: Tool[];
  maxTurns?: number;
  sessionDir?: string;
}

// Agent 回调
interface AgentCallbacks {
  onTextDelta?: (delta: string) => void;
  onTextComplete?: (text: string) => void;
  onToolStart?: (name: string, input: unknown) => void;
  onToolEnd?: (name: string, result: string) => void;
}

// 运行结果
interface RunResult {
  text: string;
  turns: number;
  toolCalls: number;
}
```

### 工具接口

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown, context: ToolContext) => Promise<string>;
}

interface ToolContext {
  workspaceDir: string;
  sessionId: string;
}
```

---

## @deca/storage

持久化层，提供 SQLite 存储和凭证管理。

### 目录结构

```
packages/storage/src/
├── database/
│   ├── client.ts          # SQLite 客户端
│   └── *.test.ts
├── credentials/
│   ├── manager.ts         # 凭证管理
│   └── *.test.ts
└── index.ts
```

### 核心功能

- 会话持久化
- 凭证存储和读取
- 数据库迁移

---

## @deca/discord

Discord 机器人通道，处理 Discord 消息收发。

### 目录结构

```
packages/discord/src/
├── bot/
│   ├── client.ts          # Discord 客户端
│   ├── connection.ts      # WebSocket 连接
│   └── *.test.ts
├── handlers/
│   ├── message.ts         # 消息处理
│   └── *.test.ts
├── formatters/
│   ├── response.ts        # 响应格式化
│   └── *.test.ts
├── types.ts               # 类型定义
└── index.ts
```

### 核心接口

```typescript
// Discord 消息处理器
type DiscordMessageHandler = (
  content: string,
  context: DiscordMessageContext
) => Promise<string>;

interface DiscordMessageContext {
  sessionKey: string;
  sender: { id: string; username: string };
  channel: { id: string; type: ChannelType };
  messageId: string;
}
```

### 独立运行

```bash
cd packages/discord
DISCORD_TOKEN=xxx bun run standalone
```

---

## @deca/terminal

终端 REPL 通道，提供命令行交互界面。

### 目录结构

```
packages/terminal/src/
├── repl/
│   ├── core.ts            # REPL 核心
│   └── *.test.ts
├── types.ts               # 类型定义
└── index.ts
```

### 核心接口

```typescript
// Terminal 消息处理器
type TerminalMessageHandler = (
  content: string,
  context: TerminalMessageContext
) => Promise<string>;

interface TerminalMessageContext {
  sessionKey: string;
}
```

### 独立运行

```bash
cd packages/terminal
bun run standalone
```

---

## @deca/http

HTTP API 通道，基于 Hono 框架。

### 目录结构

```
packages/http/src/
├── server/
│   ├── app.ts             # Hono 应用
│   ├── routes.ts          # 路由定义
│   └── *.test.ts
├── types.ts               # 类型定义
└── index.ts
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |
| POST | /chat | 发送消息 |
| POST | /message | 发送单条消息 |

### 核心接口

```typescript
// HTTP 消息处理器
type HttpMessageHandler = (
  content: string,
  context: HttpMessageContext
) => Promise<string>;

interface HttpMessageContext {
  sessionKey: string;
  requestId: string;
}
```

### 独立运行

```bash
cd packages/http
bun run standalone
```

---

## @deca/gateway

组装层，负责组合 Agent 和 Channels。

### 目录结构

```
packages/gateway/src/
├── adapter.ts             # Agent 适配器
├── gateway.ts             # Gateway 核心
├── types.ts               # 类型定义
└── index.ts
```

### 核心功能

- 创建 Agent 适配器（将 Channel 的 MessageHandler 桥接到 Agent）
- 组装多个 Channels
- 统一启动和停止

### 核心接口

```typescript
// Gateway 配置
interface GatewayConfig {
  agent?: AgentConfig;
  discord?: DiscordConfig;
  terminal?: TerminalConfig;
  http?: HttpConfig;
}

// 创建 Gateway
function createGateway(config: GatewayConfig): Gateway;

// 创建 Echo Gateway（测试用）
function createEchoGateway(): Gateway;
```

### 运行方式

```bash
# Echo 模式（无需 API Key）
cd packages/gateway
bun run start

# Agent 模式
ANTHROPIC_API_KEY=xxx bun run start
```

---

## 相关文档

- [系统架构](01-architecture.md) - 整体架构设计
- [开发指南](03-development.md) - 本地开发环境配置
- [测试规范](04-testing.md) - 测试策略和覆盖率要求
