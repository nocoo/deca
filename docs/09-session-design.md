# Session 设计文档

> Session 隔离策略与 Key 格式规范

## 概述

Deca 的 Session 系统负责管理用户与 Agent 之间的对话上下文。不同的入口（Channel）需要不同的隔离策略，以满足多用户、多频道的使用场景。

## 设计目标

1. **同一用户跨入口共享**：用户通过 HTTP、Terminal、Discord DM 与 Agent 对话时，共享同一个 Session
2. **不同用户完全隔离**：用户 A 和用户 B 的 Session 完全独立
3. **群聊频道级隔离**：Discord Guild Channel / Thread 按频道隔离，同一频道内所有用户共享 Session
4. **持久化直到重置**：Session 持久保存，直到用户手动执行 reset 命令

## Session 类型

### 1. 用户级 Session（User Session）

用于私聊场景，按用户隔离。

**适用场景：**
- HTTP API 请求（需传入 `userId` 参数）
- Terminal REPL（默认用户 `local`）
- Discord DM（使用 Discord userId）

**Key 格式：**
```
agent:{agentId}:user:{userId}
```

**示例：**
```
agent:deca:user:local           # Terminal 默认用户
agent:deca:user:123456789       # Discord 用户 123456789
agent:deca:user:api-user-001    # HTTP API 用户
```

### 2. 频道级 Session（Channel Session）

用于群聊场景，按频道隔离，同一频道内所有用户共享。

**适用场景：**
- Discord Guild Channel
- Discord Thread

**Key 格式：**
```
agent:{agentId}:channel:{guildId}:{channelId}
agent:{agentId}:thread:{guildId}:{threadId}
```

**示例：**
```
agent:deca:channel:111222333:444555666    # Guild Channel
agent:deca:thread:111222333:777888999     # Thread
```

## Channel 映射规则

| Channel | 场景 | Session 类型 | Key 格式 |
|---------|------|--------------|----------|
| HTTP | API 请求 | User | `agent:{agentId}:user:{userId}` |
| Terminal | 本地 REPL | User | `agent:{agentId}:user:local` |
| Discord DM | 私聊 | User | `agent:{agentId}:user:{discordUserId}` |
| Discord Guild | 频道消息 | Channel | `agent:{agentId}:channel:{guildId}:{channelId}` |
| Discord Thread | 帖子/线程 | Channel | `agent:{agentId}:thread:{guildId}:{threadId}` |

## 用户识别策略

### HTTP Channel

HTTP 请求**必须**携带 `userId` 参数：

```typescript
// Request body
{
  "userId": "api-user-001",  // 必填
  "message": "Hello"
}
```

如果未提供 `userId`，返回 400 错误。

### Terminal Channel

Terminal 默认使用 `local` 作为用户标识：

```typescript
const DEFAULT_USER_ID = "local";
```

未来可扩展支持多用户场景（如通过环境变量或启动参数指定）。

### Discord Channel

Discord 自动识别用户：

| 场景 | 用户标识 | 说明 |
|------|----------|------|
| DM | `message.author.id` | 发送者的 Discord ID |
| Guild/Thread | N/A | 频道级 Session，不区分用户 |

## 与旧格式对比

### 旧格式（已废弃）

```
discord:{agentId}:dm:{userId}
discord:{agentId}:guild:{guildId}:{channelId}:{userId}  ← 包含 userId
discord:{agentId}:thread:{guildId}:{threadId}:{userId}  ← 包含 userId
terminal:{agentId}:{userId}
http:{agentId}:{sessionId}
```

**问题：**
1. 不同 Channel 使用不同前缀，无法跨入口共享
2. Guild/Thread 包含 userId，导致同一频道不同用户各自独立
3. HTTP 使用随机 sessionId，无法识别用户

### 新格式

```
agent:{agentId}:user:{userId}                          # 用户级（统一）
agent:{agentId}:channel:{guildId}:{channelId}          # 频道级
agent:{agentId}:thread:{guildId}:{threadId}            # 帖子级
```

**改进：**
1. 统一 `agent:` 前缀
2. 用户级 Session 跨入口共享
3. 频道级 Session 移除 userId，所有人共享

## API 设计

### @deca/agent 核心函数

```typescript
// 构建用户级 Session Key
function buildUserSessionKey(params: {
  agentId: string;
  userId: string;
}): string;

// 构建频道级 Session Key
function buildChannelSessionKey(params: {
  agentId: string;
  guildId: string;
  channelId: string;
}): string;

// 构建 Thread Session Key
function buildThreadSessionKey(params: {
  agentId: string;
  guildId: string;
  threadId: string;
}): string;

// 解析 Session Key
function parseSessionKey(key: string): SessionKeyInfo | null;
```

### 各 Channel 使用

```typescript
// Discord
const key = isDirectMessage
  ? buildUserSessionKey({ agentId, userId: message.author.id })
  : buildChannelSessionKey({ agentId, guildId, channelId });

// Terminal
const key = buildUserSessionKey({ agentId, userId: "local" });

// HTTP
const key = buildUserSessionKey({ agentId, userId: request.userId });
```

## 迁移策略

1. 新函数与旧函数并存，旧函数标记为 `@deprecated`
2. 逐步迁移各 Channel 使用新函数
3. 下一个大版本移除旧函数

## 测试策略

遵循项目四层测试架构，确保 Session 功能的正确性和稳定性。

### Layer 1: Unit Tests

**目标**：验证 Session Key 构建和解析逻辑的正确性

**测试范围**：
- `@deca/agent` session-key.ts
  - `buildUserSessionKey()` 正确生成用户级 Key
  - `buildChannelSessionKey()` 正确生成频道级 Key
  - `buildThreadSessionKey()` 正确生成帖子级 Key
  - `parseSessionKey()` 正确解析各类型 Key
  - 边界情况：空值、特殊字符、超长输入
- `@deca/discord` session.ts
  - DM → 用户级 Key
  - Guild Channel → 频道级 Key
  - Thread → 帖子级 Key
- `@deca/terminal` session.ts
  - 默认用户 `local`
  - 自定义用户
- `@deca/http` session.ts
  - 有效 userId → 用户级 Key
  - 缺少 userId → 抛出错误

**覆盖率要求**：90%+

### Layer 2: Lint

**检查项**：
- TypeScript 类型正确性
- Biome 规则合规

### Layer 3: E2E Tests (Echo Mode)

**目标**：验证各 Channel 正确传递 Session Key 到 Agent

**测试场景**：
1. **Discord DM**：用户 A 发送消息 → Agent 收到 `agent:deca:user:{userA}` session
2. **Discord Guild**：用户 A、B 在同一频道发送消息 → Agent 收到相同 `agent:deca:channel:{guildId}:{channelId}` session
3. **Terminal**：发送消息 → Agent 收到 `agent:deca:user:local` session
4. **HTTP**：携带 userId 发送请求 → Agent 收到对应 session

### Layer 4: Behavioral Tests (Real LLM)

**目标**：验证 Session 隔离的业务正确性

**测试场景**：
1. **跨入口共享**：
   - 用户通过 Terminal 告诉 Agent "我的名字是 Alice"
   - 用户通过 Discord DM 询问 "我的名字是什么？"
   - Agent 应回答 "Alice"（共享同一 Session）

2. **用户隔离**：
   - 用户 A 通过 Discord DM 设置信息
   - 用户 B 通过 Discord DM 询问
   - Agent 不应泄露用户 A 的信息

3. **频道共享**：
   - 用户 A 在频道中设置上下文
   - 用户 B 在同一频道继续对话
   - Agent 应保持上下文连贯

## 参考

- OpenClaw Session 设计：`references/openclaw/src/routing/session-key.ts`
- OpenClaw dmScope 配置：支持 `main`、`per-peer`、`per-channel-peer` 等策略
