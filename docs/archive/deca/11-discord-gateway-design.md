# Discord 模块

> Discord Bot 集成模块，支持消息收发、通道过滤、反应确认和消息防抖。

## 概述

Discord 模块通过 `MessageHandler` 接口与外部系统解耦，可以独立测试和使用。

**核心特性**：
- 消息收发与自动分块（2000 字符限制）
- Guild/Channel/User 白名单过滤
- Mention 要求配置
- 👀/✅/❌ 反应确认
- 消息防抖（合并连续消息）
- Slash Commands（/ask, /clear, /status）

---

## 架构

### 模块依赖关系

```
apps/api/
├── channels/discord/          ← 独立模块，不依赖 @deca/agent
│   ├── types.ts               # 类型定义 + MessageHandler 接口
│   ├── chunk.ts               # 消息分块
│   ├── allowlist.ts           # 白名单过滤
│   ├── session.ts             # Session Key 生成
│   ├── client.ts              # Discord.js 客户端封装
│   ├── sender.ts              # 消息发送
│   ├── listener.ts            # 消息监听
│   ├── reaction.ts            # 反应管理
│   ├── debounce.ts            # 消息防抖
│   ├── slash-commands.ts      # 斜杠命令
│   ├── graceful-shutdown.ts   # 优雅关闭
│   ├── gateway.ts             # 组装层
│   └── e2e/                   # E2E 测试
│
└── discord-cli.ts             # CLI 入口（目前仅 echo 模式）
```

### 消息处理流程

```
Discord Gateway
     ↓
discord.js Client
     ↓
listener.ts (shouldProcessMessage)
     ├── 过滤 Bot 消息
     ├── 检查白名单
     └── 检查 Mention 要求
     ↓
debounce.ts (可选)
     ↓
reaction.ts: markReceived (👀)
     ↓
MessageHandler.handle()
     ↓
sender.ts: sendReply
     ↓
reaction.ts: markSuccess (✅) 或 markError (❌)
```

### 核心接口

```typescript
// MessageHandler - Discord 模块与外部系统的唯一接口
interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

interface MessageRequest {
  sessionKey: string;
  content: string;
  sender: { id: string; username: string; displayName?: string };
  channel: { id: string; type: "dm" | "guild" | "thread"; guildId?: string };
}

interface MessageResponse {
  text: string;
  success: boolean;
  error?: string;
}
```

---

## 文件结构

```
apps/api/src/channels/discord/
├── types.ts                   # 类型定义
├── chunk.ts                   # 消息分块 (12 tests)
├── allowlist.ts               # 白名单过滤 (20 tests)
├── session.ts                 # Session Key (15 tests)
├── client.ts                  # 客户端封装 (15 tests)
├── sender.ts                  # 消息发送 (15 tests)
├── listener.ts                # 消息监听 (25 tests)
├── reaction.ts                # 反应管理 (8 tests)
├── debounce.ts                # 消息防抖 (10 tests)
├── slash-commands.ts          # 斜杠命令 (10 tests)
├── graceful-shutdown.ts       # 优雅关闭 (8 tests)
├── gateway.ts                 # 组装层 (10 tests)
├── index.ts                   # 导出
└── e2e/
    ├── webhook.ts             # Webhook 消息发送
    ├── fetcher.ts             # API 消息获取
    ├── spawner.ts             # Bot 进程管理
    └── runner.ts              # E2E 测试运行器
```

---

## 开发指南

### 环境准备

1. 配置 Discord 凭证：
   ```bash
   mkdir -p ~/.deca/credentials
   chmod 700 ~/.deca/credentials
   
   cat > ~/.deca/credentials/discord.json << EOF
   {
     "botToken": "your-bot-token",
     "webhookUrl": "https://discord.com/api/webhooks/...",
     "testChannelId": "your-test-channel-id"
   }
   EOF
   chmod 600 ~/.deca/credentials/discord.json
   ```

2. 确保 Bot 权限：
   - `Send Messages`
   - `Add Reactions`
   - `Read Message History`
   - `Use Slash Commands`（如果使用 Slash Commands）

### 本地运行

```bash
# Echo 模式（测试用）
cd apps/api
bun run src/discord-cli.ts --echo

# 带 Agent 的完整模式
bun run src/discord-cli.ts

# 启用防抖
bun run src/discord-cli.ts --debounce

# 要求 @mention
bun run src/discord-cli.ts --require-mention
```

---

## 测试要求

### 单元测试

每个模块都有对应的单元测试，使用 Bun 测试框架。

```bash
# 运行 Discord 模块测试
cd apps/api && bun test src/channels/discord/

# 运行单个文件测试
bun test src/channels/discord/chunk.test.ts
```

**要求**：
- 所有新功能必须先写测试
- 测试覆盖率目标 >= 95%
- 当前状态：218 个测试，全部通过

### Lint 检查

```bash
# 运行 Lint
bun run lint

# 自动修复
bun run lint:fix
```

**要求**：
- 所有代码必须通过 Biome lint
- Pre-commit hook 会自动检查

### E2E 测试

E2E 测试验证真实 Discord API 交互。

```bash
# 运行 E2E 测试
cd apps/api && bun run src/channels/discord/e2e/runner.ts

# 带调试输出
bun run src/channels/discord/e2e/runner.ts --debug
```

**当前测试用例**：

| 测试 | 描述 |
|------|------|
| webhook can send messages | Webhook 发送消息正常 |
| can fetch channel messages | API 获取消息正常 |
| bot responds to messages | Bot 回复消息正常 |
| bot adds 👀 reaction | 收到消息后添加 👀 |
| bot replaces 👀 with ✅ | 处理完成后替换为 ✅ |
| bot merges rapid messages | 防抖合并连续消息 |

---

## E2E 测试最佳实践

### 设计原则

1. **隔离性**
   - 每个测试使用唯一 `testId`
   - 每个测试套件启动独立的 Bot 进程
   - 只验证自己发送的消息

2. **等待策略**
   - 永远使用轮询等待，不用固定 `sleep`
   - 设置合理超时（网络延迟 × 3）
   - 轮询间隔 300-500ms

3. **状态验证**
   - 用业务特征验证，不用技术特征
   - 验证最终状态，不验证中间状态
   - 失败时打印完整上下文

4. **调试友好**
   - 保留 `--debug` 模式
   - 失败时显示"期望 vs 实际"
   - 日志包含 testId 方便追踪

### 常见问题与解决方案

#### 问题 1: Reaction Cache Miss

**现象**: `removeReaction` 静默失败

**原因**: discord.js 的 `message.reactions.cache` 在同一请求中不会实时更新

**解决方案**: Cache miss 时降级到 REST API
```typescript
if (!cached) {
  await message.client.rest.delete(
    `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`
  );
}
```

#### 问题 2: 时序竞态

**现象**: 测试在 Bot 完成操作前就检查结果

**原因**: 网络延迟导致异步操作未完成

**解决方案**: 使用轮询等待
```typescript
// 错误：固定等待
await sleep(1000);
const reactions = await getReactions(messageId);

// 正确：轮询等待
const hasCheck = await waitForReaction(messageId, "✅", { timeout: 5000 });
```

#### 问题 3: Webhook 消息误判

**现象**: Webhook 发送的消息被误认为是 Bot 回复

**原因**: Discord 将 Webhook 消息的 `author.bot` 标记为 `true`

**解决方案**: 用业务特征区分
```typescript
// 只计算真正的 Bot 回复（有特定前缀）
if (!m.content.startsWith("🔊 Echo:")) return false;
```

### E2E 测试模板

```typescript
async function testFeature(ctx: TestContext): Promise<void> {
  const testId = generateTestId();  // 隔离性
  
  // 1. 执行操作
  await sendMessage(testId, "test input");
  
  // 2. 轮询等待结果
  const result = await waitFor(
    () => checkCondition(testId),
    { timeout: 10000, interval: 500 }
  );
  
  // 3. 验证业务特征
  if (!result || !result.content.startsWith("Expected Prefix")) {
    throw new Error(`Expected X, got: ${JSON.stringify(result)}`);
  }
}
```

---

## 已实现功能

### M4: Discord Gateway（已完成）

| 功能 | 状态 |
|------|------|
| discord.js 客户端连接 | ✅ |
| 消息接收 (messageCreate) | ✅ |
| 消息发送 (reply/send) | ✅ |
| 消息分块 (2000 字符) | ✅ |
| Bot 消息过滤 | ✅ |
| Guild/Channel/User 白名单 | ✅ |
| User 黑名单 | ✅ |
| DM 支持 | ✅ |
| Thread 支持 | ✅ |
| Session Key 生成 | ✅ |
| Typing 指示器 | ✅ |
| Require Mention | ✅ |
| MessageHandler 接口解耦 | ✅ |
| Agent 适配器 | ✅ |
| CLI 入口 | ✅ |
| 凭证存储 | ✅ |
| 断线重连 (Exponential Backoff) | ✅ |
| 优雅关闭 | ✅ |

### M5: 体验增强（已完成）

| 功能 | 状态 |
|------|------|
| Reaction Confirmation (👀→✅/❌) | ✅ |
| Message Debounce (3s 窗口) | ✅ |
| Slash Commands (/ask, /clear, /status) | ✅ |
| E2E 测试基础设施 | ✅ |

---

## 未来计划

以下功能已取消或推迟（1v1 场景不需要）：

| 功能 | 原计划 | 状态 |
|------|--------|------|
| History Context | M5.1 | 取消 - Agent 已内置 session 持久化 |
| Media/Attachments | M5.2 | 取消 - 1v1 场景不需要 |
| Auto-Thread | M6 | 取消 - 1v1 场景不需要 |
| Reply Context | M6 | 取消 - 1v1 场景不需要 |

---

## 依赖

```json
{
  "dependencies": {
    "discord.js": "^14.14.1"
  }
}
```

---

## 参考

- [Discord.js 文档](https://discord.js.org/)
- [Discord API 文档](https://discord.com/developers/docs)
