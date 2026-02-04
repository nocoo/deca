# Deca Agent 实现状态文档

> 本文档为 AI Agent 接手项目时的参考指南。
> 最后更新: 2026-02-05

## 项目概述

**Deca** 是一个 macOS 控制 Agent 服务，允许 AI Agent 通过 Web 界面安全地操控本地机器。

### 核心架构

```
用户 → Discord/Web → Agent → Tools → macOS
                       ↑
               Heartbeat (主动唤醒)
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Bun (不是 Node.js) |
| 后端框架 | Elysia |
| 前端框架 | React + Vite |
| AI SDK | @anthropic-ai/sdk |
| 测试 | bun:test |
| Lint | Biome |
| Monorepo | Bun workspaces |

---

## 里程碑完成状态

| 里程碑 | 状态 | 覆盖率 | 说明 |
|--------|------|--------|------|
| M1: Storage 包 | ✅ 完成 | 100% | 路径解析、配置管理、凭证管理 |
| M2: Agent 核心包 | ✅ 完成 | 97.28% | Agent 循环、会话管理、上下文、工具 |
| M3: Heartbeat 机制 | ✅ 完成 | 99.66% | 主动唤醒、任务解析、调度 |
| E2E 验证 | ✅ 完成 | 33 tests | 真实 LLM API 调用测试 |
| Husky Hooks | ✅ 完成 | - | Pre-commit (lint+unit), Pre-push (e2e) |
| M4: Discord Gateway | ✅ 完成 | 180+ tests | Discord Bot 连接、消息处理、重连、优雅关闭 |
| M5: Discord 增强 | ✅ 完成 | 218 tests | Reaction, Debounce, Slash Commands |

---

## 包结构详解

### apps/api/ (Discord Gateway)

**职责**: API 服务和 Discord Gateway

```
apps/api/
├── src/
│   ├── channels/discord/
│   │   ├── types.ts           # MessageHandler 接口、配置类型
│   │   ├── chunk.ts           # 消息分块 (2000 字符限制)
│   │   ├── chunk.test.ts      # 14 个测试
│   │   ├── allowlist.ts       # 白名单过滤
│   │   ├── allowlist.test.ts  # 23 个测试
│   │   ├── session.ts         # 会话 Key 生成
│   │   ├── session.test.ts    # 18 个测试
│   │   ├── client.ts          # discord.js 包装器
│   │   ├── client.test.ts     # 12 个测试
│   │   ├── sender.ts          # 消息发送
│   │   ├── sender.test.ts     # 12 个测试
│   │   ├── listener.ts        # 消息监听 + Reaction 集成
│   │   ├── listener.test.ts   # 29 个测试
│   │   ├── gateway.ts         # 网关组装
│   │   ├── gateway.test.ts    # 10 个测试
│   │   ├── echo-handler.ts    # 测试用回显处理器
│   │   ├── echo-handler.test.ts # 9 个测试
│   │   ├── reconnect.ts       # 重连管理器
│   │   ├── reconnect.test.ts  # 19 个测试
│   │   ├── graceful-shutdown.ts # 优雅关闭
│   │   ├── graceful-shutdown.test.ts # 16 个测试
│   │   ├── reaction.ts        # 反应确认 (👀→✅/❌)
│   │   ├── reaction.test.ts   # 11 个测试
│   │   ├── debounce.ts        # 消息去重
│   │   ├── debounce.test.ts   # 10 个测试
│   │   ├── slash-commands.ts  # Slash Commands
│   │   ├── slash-commands.test.ts # 12 个测试
│   │   ├── e2e/               # E2E 测试
│   │   └── index.ts           # 模块导出
│   ├── adapters/
│   │   ├── discord-agent-adapter.ts      # Agent 适配器
│   │   └── discord-agent-adapter.test.ts # 7 个测试
│   └── discord-cli.ts         # CLI 入口点
└── package.json               # 添加 discord.js, @deca/agent, @deca/storage
```

**核心接口**:

```typescript
// MessageHandler - 解耦 Discord 和 Agent
interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

interface MessageRequest {
  sessionKey: string;
  content: string;
  userId: string;
  userName: string;
  channelId: string;
  guildId?: string;
}

interface MessageResponse {
  content: string;
}

// Discord Gateway 配置
interface DiscordGatewayConfig {
  botToken: string;
  agentId?: string;
  allowlist?: AllowlistConfig;
  requireMention?: boolean;
}
```

**CLI 使用**:

```bash
# Echo 模式 (测试)
bun run discord:echo

# Agent 模式
bun run discord

# 带选项
bun run discord -- --require-mention
```

---

### packages/storage/

**职责**: 统一存储访问层

```
packages/storage/
├── src/
│   ├── types.ts           # 类型定义 (PathResolver, Config, Credential)
│   ├── paths.ts           # 路径解析 (resolvePaths)
│   ├── paths.test.ts      # 6 个测试
│   ├── config.ts          # 配置管理 (createConfigManager)
│   ├── config.test.ts     # 12 个测试
│   ├── credentials.ts     # 凭证管理 (createCredentialManager)
│   ├── credentials.test.ts # 11 个测试
│   └── index.ts           # 统一导出
├── package.json
└── tsconfig.json
```

**核心类型**:

```typescript
// 凭证类型 (支持 model 配置)
interface CredentialStore {
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
    models?: ModelConfig;  // 新增: 支持模型覆盖
  };
  discord?: { botToken: string; applicationId?: string };
  github?: { token: string };
  openai?: { apiKey: string; baseUrl?: string; models?: ModelConfig };
}

interface ModelConfig {
  default?: string;
  haiku?: string;
  sonnet?: string;
  opus?: string;
  reasoning?: string;
}
```

**存储路径**:

| 路径 | 说明 | Git |
|------|------|-----|
| `~/.deca/config.json` | 全局配置 | 不在 repo |
| `~/.deca/credentials/*.json` | API 凭证 (600 权限) | 不在 repo |
| `~/.deca/sessions/*.jsonl` | 会话历史 | 不在 repo |
| `<project>/.deca/` | 项目级存储 | .gitignore |
| `<project>/HEARTBEAT.md` | 任务文件 | 可 check in |

---

### packages/agent/

**职责**: Agent 核心逻辑

```
packages/agent/
├── src/
│   ├── core/
│   │   ├── agent.ts           # Agent 核心类 (830 行)
│   │   ├── agent-events.ts    # 事件发射器 (✅ 9 tests)
│   │   ├── command-queue.ts   # 命令队列 (✅ 21 tests)
│   │   ├── lru-cache.ts       # LRU 缓存 (✅ 13 tests)
│   │   ├── memory.ts          # 长期记忆 (✅ 23 tests)
│   │   ├── session.ts         # 会话管理 (✅ 17 tests)
│   │   ├── session-key.ts     # 会话 key 解析 (✅ 25 tests)
│   │   ├── skills.ts          # 技能匹配 (✅ 18 tests)
│   │   └── tool-policy.ts     # 工具策略 (✅ 24 tests)
│   │
│   ├── context/
│   │   ├── bootstrap.ts       # Bootstrap 上下文 (✅ 15 tests)
│   │   ├── compaction.ts      # 上下文压缩 (✅ 10 tests, 75.82%)
│   │   ├── loader.ts          # 上下文加载器 (✅ 19 tests)
│   │   ├── pruning.ts         # 上下文裁剪 (✅ 22 tests)
│   │   └── tokens.ts          # Token 估算 (✅ 10 tests)
│   │
│   ├── heartbeat/
│   │   └── manager.ts         # Heartbeat 管理器 (✅ 93 tests, 99.66%)
│   │
│   ├── tools/
│   │   ├── builtin.ts         # 内置工具 (✅ 66 tests, 99.13%)
│   │   └── types.ts           # Tool 接口定义
│   │
│   ├── e2e/
│   │   ├── agent.e2e.test.ts      # Agent E2E 测试 (真实 LLM)
│   │   └── heartbeat.e2e.test.ts  # Heartbeat E2E 测试
│   │
│   └── index.ts               # 统一导出
├── package.json
└── tsconfig.json
```

**Agent 核心类**:

```typescript
interface AgentConfig {
  apiKey: string;
  baseUrl?: string;        // 新增: 支持自定义 API 端点
  model?: string;
  agentId?: string;
  systemPrompt?: string;
  tools?: Tool[];
  toolPolicy?: ToolPolicy;
  sandbox?: { enabled?: boolean; allowExec?: boolean; allowWrite?: boolean };
  maxTurns?: number;
  sessionDir?: string;
  workspaceDir?: string;
  memoryDir?: string;
  enableMemory?: boolean;
  enableContext?: boolean;
  enableSkills?: boolean;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  contextTokens?: number;
}

class Agent {
  constructor(config: AgentConfig);
  run(sessionId: string, message: string, callbacks?: AgentCallbacks): Promise<RunResult>;
}
```

**Agent Loop 流程**:

```
1. 加载会话历史
2. 技能匹配 (如果启用)
3. 记忆检索注入 (工具化)
4. Heartbeat 任务注入 (如果启用)
5. 上下文压缩 (如果超出 token 限制)
6. while (turns < maxTurns):
   a. 调用 LLM (流式)
   b. 处理 text → 回调
   c. 处理 tool_use → 执行工具 → 添加结果
   d. 如果无工具调用，break
7. 保存会话
8. 返回结果
```

**内置工具**:

| 工具名 | 描述 | 测试状态 |
|--------|------|----------|
| read | 读取文件 | ✅ |
| write | 写入文件 | ✅ |
| edit | 编辑文件 (字符串替换) | ✅ |
| list | 列出目录 | ✅ |
| grep | 搜索内容 | ✅ |
| exec | 执行 shell 命令 | ✅ |
| memory_search | 搜索记忆 | ✅ |
| memory_get | 获取记忆详情 | ✅ |
| spawn_subagent | 启动子代理 | ✅ |

---

### Heartbeat 机制

**核心概念**:

1. **HeartbeatWake** - 请求合并层 (coalesce 250ms)
2. **HeartbeatManager** - 调度层 (setTimeout 精确调度)

**唤醒原因 (WakeReason)**:

| 原因 | 优先级 | 说明 |
|------|--------|------|
| exec | 4 | 命令执行完成 |
| cron | 3 | 定时任务完成 |
| interval | 2 | 定时器到期 |
| retry | 1 | 重试 |
| requested | 0 | 手动请求 |

**HEARTBEAT.md 格式**:

```markdown
# Tasks

- [ ] 未完成任务
- [x] 已完成任务
- 普通列表项 (视为未完成任务)
```

---

## 测试规范

### 单元测试 (Unit Tests)

**命名规范**: `<module>.test.ts`

**位置**: 与源文件同目录

**运行命令**:

```bash
# 运行所有测试
cd packages/agent && bun test

# 运行特定文件
bun test src/core/session.test.ts

# 带覆盖率
bun test --coverage
```

**测试模式**:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("ModuleName", () => {
  describe("functionName", () => {
    it("should do something when condition", () => {
      // Arrange
      // Act
      // Assert
    });

    it("should throw error when invalid input", () => {
      expect(() => fn(invalidInput)).toThrow("Expected error message");
    });
  });
});
```

**Mock 策略**:

- LLM API: 使用 Mock 响应对象
- 文件系统: 使用 `os.tmpdir()` 临时目录
- 时间: 使用 `Date.now()` 注入

### E2E 测试 (End-to-End Tests)

**位置**: `packages/agent/src/e2e/`

**运行命令**:

```bash
# 需要配置 ~/.deca/credentials/anthropic.json
bun test src/e2e/
```

**凭据配置**:

```json
// ~/.deca/credentials/anthropic.json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://api.minimaxi.com/anthropic",
  "models": {
    "default": "MiniMax-M2.1",
    "haiku": "MiniMax-M2.1",
    "sonnet": "MiniMax-M2.1"
  }
}
```

**E2E 测试特点**:

1. 跳过逻辑: 如果没有凭据，测试会跳过而不是失败
2. 超时设置: 60-120 秒
3. 真实 API 调用: 验证完整链路

---

## Lint 规范

**工具**: Biome

**运行命令**:

```bash
# 检查 lint
cd /Users/nocoo/workspace/personal/deca && bun run lint

# 只检查特定包
cd packages/agent && bunx biome check ./src
```

**配置文件**: 项目根目录 `biome.json`

**常见问题**:

| 问题 | 解决方案 |
|------|----------|
| React key 使用 index | 改用 `crypto.randomUUID()` |
| 未使用变量 | 删除或加 `_` 前缀 |
| useEffect 依赖 | 使用 `useRef` 或 `useMemo` |
| 未转义字符 | 使用 `&apos;` 替代 `'` |

---

## 命令速查

### 开发常用

```bash
# 安装依赖
bun install

# 运行单元测试
bun run test:unit

# 运行 E2E 测试
bun run test:e2e

# 运行所有测试
bun run test:all

# Lint
bun run lint

# 带覆盖率
cd packages/agent && bun test --coverage
```

### Git Hooks (Husky)

| Hook | 触发时机 | 检查内容 |
|------|----------|----------|
| pre-commit | commit 前 | lint + unit tests |
| pre-push | push 前 | e2e tests |

### Git 规范

```bash
# 原子化提交
git add packages/storage/src/types.ts
git commit -m "feat: add model configuration support"

git add packages/agent/src/e2e/
git commit -m "test: add e2e tests for agent with real LLM"
```

**Commit 类型**:

| 类型 | 说明 |
|------|------|
| fix | Bug 修复 |
| feat | 新功能 |
| test | 测试代码 |
| refactor | 重构 |
| docs | 文档 |
| chore | 杂项 |

---

## 文件变更摘要 (本次会话)

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/agent/src/e2e/agent.e2e.test.ts` | Agent E2E 测试 |
| `packages/agent/src/e2e/heartbeat.e2e.test.ts` | Heartbeat E2E 测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/storage/src/types.ts` | 添加 `ModelConfig` 类型 |
| `packages/agent/src/core/agent.ts` | 添加 `baseUrl` 配置支持 |
| `.gitignore` | 添加 `.deca/`, `.mini-agent/` 等 |

### 外部配置

| 文件 | 说明 |
|------|------|
| `~/.deca/credentials/anthropic.json` | API 凭据 (不在 git) |

---

## 下一步任务

### M6: 基础工具集 (待开始)

1. **工具注册中心** - 动态工具注册
2. **更多内置工具** - applescript, 高级 shell
3. **工具权限控制** - 细粒度工具策略

---

## 凭证配置

### Discord Bot

```bash
mkdir -p ~/.deca/credentials
echo '{"botToken":"your-bot-token"}' > ~/.deca/credentials/discord.json
chmod 600 ~/.deca/credentials/discord.json
```

### Anthropic API (Agent 模式需要)

```bash
echo '{"apiKey":"your-api-key"}' > ~/.deca/credentials/anthropic.json
chmod 600 ~/.deca/credentials/anthropic.json
```

---

## 参考资源

### 项目内文档

- `docs/deca/07-agent-architecture.md` - Agent 架构设计
- `docs/deca/08-storage-system.md` - 存储系统设计
- `docs/deca/09-agent-milestones.md` - 里程碑计划

### 参考项目

- `references/openclaw-mini/` - 简化教学版 (~4,800 行)
- `references/openclaw/` - 完整生产版 (~50,000+ 行)

### 外部链接

- [Anthropic API 文档](https://docs.anthropic.com/)
- [Discord.js 指南](https://discord.js.org/)
- [Bun 文档](https://bun.sh/docs)

---

## 注意事项

### 关键原则

1. **TDD 优先**: 先写测试再实现
2. **覆盖率 >= 90%**: 每个模块
3. **原子化提交**: 每个 commit 可独立回滚
4. **使用 Bun**: 不是 pnpm/npm 执行

### 安全要求

1. 凭据文件权限 600
2. 不要在日志中打印 API Key
3. `.deca/` 目录已在 `.gitignore`

### 调试技巧

```bash
# 查看测试覆盖率详情
bun test --coverage 2>&1 | grep -A 5 "Coverage"

# 运行单个测试
bun test --test-name-pattern "should handle"

# 查看凭据
cat ~/.deca/credentials/anthropic.json | jq
```

---

## 更新日志

### 2026-02-05

- ✅ 完成 M5 Discord 增强实现
- ✅ P0: Reaction Confirmation (👀→✅/❌) - 11 tests
- ✅ P1: Message Debounce (3s 窗口合并) - 10 tests
- ✅ P2: Slash Commands (/ask, /clear, /status) - 12 tests
- ✅ Discord 测试从 206 增加到 218 个
- ✅ 完成 M4 Discord Gateway 实现
- ✅ 12 个原子化提交
- ✅ 129 个 Discord 相关测试
- ✅ 实现 MessageHandler 接口解耦
- ✅ Discord CLI 入口点 (echo + agent 模式)
- ✅ Agent 适配器 (discord-agent-adapter.ts)

### 2026-02-04 (晚)

- 📝 完成 M4 Discord Gateway 详细设计文档
- 📝 定义 MessageHandler 接口实现模块解耦
- 📝 规划 16 个原子化提交
- 📝 设计三层 E2E 测试策略 (Mock → 集成 → Live)

### 2026-02-04

- ✅ 完成 M1-M3 所有单元测试
- ✅ 添加 E2E 测试 (真实 LLM 调用)
- ✅ 扩展 CredentialStore 支持 ModelConfig
- ✅ Agent 支持 baseUrl 配置
- ✅ 验证 Agent + Heartbeat 完整链路
- ✅ 设置 Husky pre-commit/pre-push hooks
- ✅ 扩展 E2E 测试至 33 个 (Agent + Heartbeat)
