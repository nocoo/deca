# M4: Discord Gateway 详细设计

> 本文档定义 Discord Gateway 模块的完整实现规范，包括 TDD 计划、原子化提交和 E2E 测试策略。

## 概述

### 目标

实现 Discord Bot 连接，支持消息收发、通道过滤，并与 Agent 集成。

### 核心原则

1. **模块独立性**: Discord 模块不直接依赖 `@deca/agent`，通过 `MessageHandler` 接口解耦
2. **TDD**: 所有功能先写测试再实现
3. **原子化提交**: 每个 commit 代表单一逻辑变更
4. **分层测试**: Mock → 集成 → Live 渐进验证

### 规模估算

| 指标 | 数量 |
|------|------|
| 新增代码 | ~900 行 |
| 新增测试 | ~120 个用例 |
| 预计覆盖率 | >= 95% |

---

## 架构设计

### 模块独立性

Discord 模块通过 `MessageHandler` 接口与外部系统解耦：

```
┌─────────────────────────────────────────────────────────────────┐
│                    apps/api                                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  channels/discord/  ← 完全独立，不依赖 @deca/agent         │ │
│  │  - 只依赖 discord.js                                       │ │
│  │  - 只依赖 MessageHandler 接口                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│                          │ implements                            │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  adapters/discord-agent-adapter.ts                         │ │
│  │  - 实现 MessageHandler                                     │ │
│  │  - 依赖 @deca/agent                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                       │
└──────────────────────────│───────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │      @deca/agent       │
              └────────────────────────┘
```

### 消息流程

```
Discord Gateway (WebSocket)
        │
        │ MESSAGE_CREATE event
        ▼
┌───────────────────┐
│  discord.js       │
│  Client           │
└─────────┬─────────┘
          │
          │ 'messageCreate' event
          ▼
┌───────────────────┐     ┌───────────────────┐
│   listener.ts     │────▶│   allowlist.ts    │
│                   │     │   isAllowed()     │
│ onMessageCreate() │     └─────────┬─────────┘
└─────────┬─────────┘               │
          │                         │ false → ignore
          │ ◀───────────────────────┘ true  → continue
          ▼
┌───────────────────┐
│ Check mention     │
│ (if required)     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Build MessageReq  │
│ + session key     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ MessageHandler    │  ← 抽象接口
│   .handle()       │
└─────────┬─────────┘
          │
          │ MessageResponse
          ▼
┌───────────────────┐
│   sender.ts       │
│                   │
│ sendReply()       │
│ - chunk if needed │
└───────────────────┘
```

---

## 文件结构

```
apps/api/
├── src/
│   ├── channels/
│   │   ├── types.ts                     # Channel 通用接口
│   │   └── discord/
│   │       ├── types.ts                 # Discord 类型 + MessageHandler 接口
│   │       ├── chunk.ts                 # 消息分块
│   │       ├── chunk.test.ts
│   │       ├── allowlist.ts             # 通道过滤
│   │       ├── allowlist.test.ts
│   │       ├── session.ts               # Session Key 生成
│   │       ├── session.test.ts
│   │       ├── client.ts                # Discord 客户端管理
│   │       ├── client.test.ts
│   │       ├── sender.ts                # 消息发送
│   │       ├── sender.test.ts
│   │       ├── listener.ts              # 消息监听
│   │       ├── listener.test.ts
│   │       ├── gateway.ts               # 组装层
│   │       ├── gateway.test.ts
│   │       └── index.ts                 # 导出
│   │
│   ├── adapters/
│   │   └── discord-agent-adapter.ts     # Agent 适配器
│   │
│   ├── discord-cli.ts                   # CLI 入口
│   │
│   └── e2e/
│       ├── discord.unit.e2e.test.ts     # Mock 全部
│       ├── discord.integration.e2e.test.ts  # Mock Discord, 真实 Agent
│       └── discord.live.e2e.test.ts     # 真实 Discord 连接
│
packages/storage/
└── src/types.ts                         # 已有 Discord 凭证类型 ✅
```

---

## 核心接口定义

### MessageHandler 接口

```typescript
// channels/discord/types.ts

/**
 * 消息处理器接口 - Discord 模块唯一的外部依赖点
 */
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

export interface MessageRequest {
  /** 会话标识 */
  sessionKey: string;
  /** 消息内容 */
  content: string;
  /** 发送者信息 */
  sender: {
    id: string;
    username: string;
    displayName?: string;
  };
  /** 频道信息 */
  channel: {
    id: string;
    name?: string;
    type: "dm" | "guild" | "thread";
    guildId?: string;
    threadId?: string;
  };
  /** 可选回调 */
  callbacks?: {
    onTextDelta?: (delta: string) => void;
  };
}

export interface MessageResponse {
  text: string;
  success: boolean;
  error?: string;
}
```

### Gateway 配置

```typescript
export interface DiscordGatewayConfig {
  /** Bot Token (如果不注入 client) */
  token?: string;
  
  /** 依赖注入 (用于测试) */
  client?: Client;
  handler?: MessageHandler;
  
  /** 功能配置 */
  allowlist?: AllowlistConfig;
  requireMention?: boolean;
  requireMentionByGuild?: Record<string, boolean>;
  requireMentionByChannel?: Record<string, boolean>;
  ignoreBots?: boolean;
}

export interface DiscordGateway {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly isConnected: boolean;
  readonly user: User | null;
  readonly guilds: Collection<string, Guild>;
}
```

### Allowlist 配置

```typescript
export interface AllowlistConfig {
  /** 允许的 Guild IDs (空 = 全部允许) */
  guilds?: string[];
  /** 允许的 Channel IDs (空 = 全部允许) */
  channels?: string[];
  /** 允许的 User IDs (空 = 全部允许) */
  users?: string[];
  /** 拒绝的 User IDs (优先检查) */
  denyUsers?: string[];
}
```

---

## Token 存储

### 凭证文件

```
~/.deca/credentials/discord.json
```

### 格式 (已定义于 @deca/storage)

```json
{
  "botToken": "your-bot-token",
  "applicationId": "optional-app-id"
}
```

### 文件权限

- 目录: `0700`
- 文件: `0600`

### 加载方式

```typescript
import { createCredentialManager, resolvePaths } from "@deca/storage";

const paths = resolvePaths();
const credentials = createCredentialManager(paths.credentialsDir);
const discord = await credentials.get("discord");

if (!discord?.botToken) {
  throw new Error("Discord bot token not configured");
}
```

---

## TDD 计划

### 开发顺序

| 顺序 | 模块 | 测试数 | 依赖 |
|------|------|--------|------|
| 1 | `types.ts` | - | 无 |
| 2 | `chunk.ts` | 12 | 无 |
| 3 | `allowlist.ts` | 20 | 无 |
| 4 | `session.ts` | 15 | 无 |
| 5 | `client.ts` | 15 | discord.js |
| 6 | `sender.ts` | 15 | discord.js, chunk |
| 7 | `listener.ts` | 25 | discord.js, allowlist, session, sender |
| 8 | `gateway.ts` | 10 | 全部 |
| 9 | `discord-agent-adapter.ts` | 8 | @deca/agent |

### 测试规范

每个模块遵循：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";

describe("ModuleName", () => {
  describe("functionName", () => {
    it("should do X when Y", () => {
      // Arrange
      // Act  
      // Assert
    });
  });
});
```

---

## 单元测试详细设计

### chunk.test.ts (12 tests)

```typescript
describe("chunkMessage", () => {
  describe("short messages", () => {
    it("returns single chunk for empty string", () => {});
    it("returns single chunk for short message", () => {});
    it("returns single chunk for exactly max length", () => {});
  });
  
  describe("long messages", () => {
    it("breaks at newlines when possible", () => {});
    it("breaks at spaces when no newline", () => {});
    it("hard breaks when no good break point", () => {});
    it("trims leading whitespace in subsequent chunks", () => {});
  });
  
  describe("edge cases", () => {
    it("handles unicode characters correctly", () => {});
    it("handles very long single word", () => {});
    it("handles multiple consecutive newlines", () => {});
    it("respects custom max length", () => {});
    it("handles mixed content", () => {});
  });
});
```

### allowlist.test.ts (20 tests)

```typescript
describe("isAllowed", () => {
  describe("empty config", () => {
    it("allows all messages with empty config", () => {});
    it("allows all messages with undefined config", () => {});
  });
  
  describe("deny list", () => {
    it("blocks denied users first", () => {});
    it("blocks denied users even if in allow list", () => {});
  });
  
  describe("user allowlist", () => {
    it("allows all when users list empty", () => {});
    it("allows only listed users", () => {});
    it("blocks unlisted users", () => {});
  });
  
  describe("guild allowlist", () => {
    it("allows all when guilds list empty", () => {});
    it("allows DMs regardless of guild list", () => {});
    it("allows only listed guilds", () => {});
    it("blocks unlisted guilds", () => {});
  });
  
  describe("channel allowlist", () => {
    it("allows all when channels list empty", () => {});
    it("allows only listed channels", () => {});
    it("blocks unlisted channels", () => {});
  });
  
  describe("combined rules", () => {
    it("requires user AND guild AND channel", () => {});
    it("blocks if any condition fails", () => {});
    it("allows if all conditions pass", () => {});
  });
  
  describe("thread handling", () => {
    it("checks thread channel ID", () => {});
    it("checks parent channel ID for threads", () => {});
  });
});
```

### session.test.ts (15 tests)

```typescript
describe("resolveDiscordSessionKey", () => {
  describe("DM mode", () => {
    it("generates DM session key", () => {});
    it("uses default agent ID for DM", () => {});
    it("uses custom agent ID for DM", () => {});
  });
  
  describe("guild mode", () => {
    it("generates channel session key", () => {});
    it("includes guild ID in key", () => {});
    it("includes channel ID in key", () => {});
    it("includes user ID in key", () => {});
  });
  
  describe("thread mode", () => {
    it("generates thread session key", () => {});
    it("uses thread ID instead of channel ID", () => {});
  });
  
  describe("agent ID normalization", () => {
    it("normalizes agent ID to lowercase", () => {});
    it("replaces invalid characters", () => {});
    it("uses default for empty agent ID", () => {});
  });
});

describe("parseDiscordSessionKey", () => {
  it("parses DM session key", () => {});
  it("parses channel session key", () => {});
  it("returns null for non-discord keys", () => {});
});
```

### client.test.ts (15 tests)

```typescript
describe("createDiscordClient", () => {
  it("creates client with default intents", () => {});
  it("creates client with custom intents", () => {});
  it("includes required partials for DMs", () => {});
  it("validates token format", () => {});
});

describe("connectDiscord", () => {
  it("resolves when ready event fires", () => {});
  it("rejects on error event", () => {});
  it("rejects on timeout", () => {});
  it("calls login with token", () => {});
  it("logs connection info on ready", () => {});
});

describe("disconnectDiscord", () => {
  it("calls client.destroy()", () => {});
  it("handles already disconnected client", () => {});
  it("clears event listeners", () => {});
});

describe("isConnected", () => {
  it("returns true when connected", () => {});
  it("returns false when disconnected", () => {});
  it("returns false before connect", () => {});
});
```

### sender.test.ts (15 tests)

```typescript
describe("sendReply", () => {
  describe("short messages", () => {
    it("sends single message as reply", () => {});
    it("uses message.reply()", () => {});
  });
  
  describe("long messages", () => {
    it("chunks long messages", () => {});
    it("sends first chunk as reply", () => {});
    it("sends subsequent chunks to channel", () => {});
  });
  
  describe("thread handling", () => {
    it("sends directly in thread", () => {});
    it("does not use reply in thread", () => {});
  });
  
  describe("error handling", () => {
    it("throws on send failure", () => {});
    it("includes original error message", () => {});
  });
});

describe("sendToChannel", () => {
  it("sends to text channel", () => {});
  it("sends to thread channel", () => {});
  it("chunks long messages", () => {});
  it("returns sent messages", () => {});
});

describe("showTyping", () => {
  it("calls sendTyping on channel", () => {});
  it("handles errors gracefully", () => {});
});
```

### listener.test.ts (25 tests)

```typescript
describe("setupMessageListener", () => {
  describe("bot filtering", () => {
    it("ignores bot messages by default", () => {});
    it("allows bot messages when configured", () => {});
    it("ignores own messages", () => {});
  });
  
  describe("allowlist", () => {
    it("respects guild allowlist", () => {});
    it("respects channel allowlist", () => {});
    it("respects user allowlist", () => {});
    it("respects deny list", () => {});
  });
  
  describe("mention requirement", () => {
    it("requires mention when global config set", () => {});
    it("requires mention for specific guild", () => {});
    it("requires mention for specific channel", () => {});
    it("processes without mention when not required", () => {});
    it("removes mention from content", () => {});
    it("handles multiple mentions", () => {});
  });
  
  describe("content processing", () => {
    it("trims whitespace", () => {});
    it("ignores empty content after processing", () => {});
  });
  
  describe("handler invocation", () => {
    it("calls handler with correct MessageRequest", () => {});
    it("includes sender info", () => {});
    it("includes channel info", () => {});
    it("generates correct session key", () => {});
  });
  
  describe("response handling", () => {
    it("sends reply on success", () => {});
    it("sends error message on failure", () => {});
    it("handles handler exceptions", () => {});
  });
  
  describe("typing indicator", () => {
    it("shows typing before handler call", () => {});
  });
});
```

### gateway.test.ts (10 tests)

```typescript
describe("createDiscordGateway", () => {
  it("creates gateway with token", () => {});
  it("creates gateway with injected client", () => {});
  it("creates gateway with injected handler", () => {});
});

describe("DiscordGateway", () => {
  describe("connect", () => {
    it("connects client with token", () => {});
    it("sets up message listener", () => {});
    it("updates isConnected", () => {});
  });
  
  describe("disconnect", () => {
    it("disconnects client", () => {});
    it("updates isConnected", () => {});
  });
  
  describe("properties", () => {
    it("exposes user info", () => {});
    it("exposes guild list", () => {});
  });
});
```

---

## E2E 测试设计

### 测试层次

| 测试类型 | 文件 | Discord | Handler | 凭证要求 | CI 运行 |
|---------|------|---------|---------|---------|--------|
| 单元 E2E | `discord.unit.e2e.test.ts` | Mock | Mock/Echo | 无 | ✅ |
| 集成 E2E | `discord.integration.e2e.test.ts` | Mock | 真实 Agent | Anthropic | ⚠️ 可选 |
| Live E2E | `discord.live.e2e.test.ts` | 真实 | 真实 Agent | Discord + Anthropic | ❌ 手动 |

### discord.unit.e2e.test.ts

```typescript
describe("Discord Unit E2E", () => {
  describe("Echo Handler", () => {
    it("should process message through full pipeline", async () => {});
    it("should chunk long echo responses", async () => {});
    it("should respect allowlist", async () => {});
    it("should require mention when configured", async () => {});
  });
  
  describe("Error Handling", () => {
    it("should handle handler errors gracefully", async () => {});
    it("should send error message on failure", async () => {});
  });
  
  describe("Session Key", () => {
    it("should generate unique keys per user/channel", async () => {});
    it("should generate DM session key", async () => {});
    it("should generate thread session key", async () => {});
  });
});
```

### discord.integration.e2e.test.ts

```typescript
describe("Discord Integration E2E", () => {
  beforeAll(() => {
    // 检查 Anthropic 凭证
    credentials = loadAnthropicCredentials();
  });
  
  describe("Real Agent Response", () => {
    it("should get LLM response for simple question", async () => {});
    it("should handle multi-turn conversation", async () => {});
    it("should chunk long LLM responses", async () => {});
  });
  
  describe("Tool Usage", () => {
    it("should execute tools and return result", async () => {});
  });
});
```

### discord.live.e2e.test.ts

```typescript
const LIVE_TEST = process.env.DISCORD_LIVE_TEST === "true";

describe("Discord Live E2E", () => {
  it.skipIf(!LIVE_TEST)("should connect to real Discord", async () => {});
  it.skipIf(!LIVE_TEST)("should list guilds", async () => {});
  it.skipIf(!LIVE_TEST)("should respond to test message", async () => {});
});
```

---

## 原子化 Commit 计划

### Phase 1: 基础模块 (无 discord.js 依赖)

```
1. feat: add discord channel types and MessageHandler interface
   - channels/discord/types.ts

2. test: add chunk message unit tests
   feat: implement discord message chunking
   - channels/discord/chunk.ts
   - channels/discord/chunk.test.ts

3. test: add allowlist filter unit tests
   feat: implement discord allowlist filtering
   - channels/discord/allowlist.ts
   - channels/discord/allowlist.test.ts

4. test: add discord session key unit tests
   feat: implement discord session key generation
   - channels/discord/session.ts
   - channels/discord/session.test.ts
```

### Phase 2: Discord.js 模块

```
5. chore: add discord.js dependency to apps/api
   - apps/api/package.json

6. test: add discord client unit tests with mock
   feat: implement discord client wrapper
   - channels/discord/client.ts
   - channels/discord/client.test.ts

7. test: add discord sender unit tests
   feat: implement discord message sender
   - channels/discord/sender.ts
   - channels/discord/sender.test.ts

8. test: add discord listener unit tests
   feat: implement discord message listener
   - channels/discord/listener.ts
   - channels/discord/listener.test.ts
```

### Phase 3: 集成层

```
9. test: add discord gateway unit tests
   feat: implement discord gateway assembly
   - channels/discord/gateway.ts
   - channels/discord/gateway.test.ts

10. feat: export discord channel module
    - channels/discord/index.ts

11. test: add agent adapter unit tests
    feat: implement discord agent adapter
    - adapters/discord-agent-adapter.ts
    - adapters/discord-agent-adapter.test.ts

12. feat: add discord cli entry point
    - discord-cli.ts
```

### Phase 4: E2E 测试

```
13. test: add discord unit e2e tests
    - e2e/discord.unit.e2e.test.ts

14. test: add discord integration e2e tests
    - e2e/discord.integration.e2e.test.ts

15. test: add discord live e2e tests
    - e2e/discord.live.e2e.test.ts
```

### Phase 5: 文档

```
16. docs: update implementation status for M4
    - docs/deca/10-implementation-status.md
```

---

## 验收标准

### 功能验收

- [ ] Discord Bot 可以连接
- [ ] 可以接收消息
- [ ] 可以发送回复
- [ ] 长消息正确分块
- [ ] Allowlist 过滤生效
- [ ] Require Mention 生效
- [ ] Session Key 正确生成
- [ ] 凭证从 ~/.deca/credentials/discord.json 加载

### 质量验收

- [ ] `bun test` 通过
- [ ] `bun run lint` 通过
- [ ] 覆盖率 >= 95%
- [ ] 所有 E2E 测试通过

### 文档验收

- [ ] 本设计文档完成
- [ ] 实现状态文档更新
- [ ] 凭证配置说明

---

## M4 功能范围

### 包含

| 功能 | 状态 |
|------|------|
| discord.js 客户端连接 | ✅ |
| 消息接收 (messageCreate) | ✅ |
| 消息发送 (reply/send) | ✅ |
| 消息分块 (2000 字符) | ✅ |
| Bot 消息过滤 | ✅ |
| Guild/Channel/User Allowlist | ✅ |
| User Deny List | ✅ |
| DM 基础支持 | ✅ |
| Thread 基础支持 | ✅ |
| Session Key 生成 | ✅ |
| Typing 指示器 | ✅ |
| Require Mention | ✅ |
| MessageHandler 接口解耦 | ✅ |
| Agent 适配器 | ✅ |
| CLI 入口 | ✅ |
| 凭证存储 | ✅ |

### 不包含 (后续里程碑)

| 功能 | 计划里程碑 |
|------|-----------|
| Slash Commands | M5.1 |
| 消息去重 (Debounce) | M5.1 |
| History Context | M5.1 |
| Media/Attachments | M5.2 |
| Code Fence 保持 | M5.2 |
| Auto-Thread | M6 |
| Reply Context | M6 |
| Ack Reaction | M6 |

---

## 依赖

### 新增依赖

```json
{
  "dependencies": {
    "discord.js": "^14.14.1"
  }
}
```

### 现有依赖

- `@deca/storage` - 凭证管理
- `@deca/agent` - Agent 核心 (仅适配器依赖)

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Discord API 变更 | 功能失效 | 使用稳定版 discord.js，关注更新 |
| Rate Limiting | 消息丢失 | 添加重试逻辑，监控告警 |
| 凭证泄露 | 安全风险 | 文件权限 0600，不打印日志 |
| 重连失败 | 服务中断 | 指数退避重连，健康检查 |

---

## 参考

- [Discord.js 文档](https://discord.js.org/)
- [OpenClaw Discord 实现](../references/discord-integration-design.md)
- [Agent 架构设计](./07-agent-architecture.md)
- [里程碑计划](./09-agent-milestones.md)
