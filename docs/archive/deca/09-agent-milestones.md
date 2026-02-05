# Agent 系统里程碑计划

## 核心原则

### 开发规范

| 原则 | 标准 |
|------|------|
| **TDD** | 所有功能先写测试再实现 |
| **覆盖率** | >= 90% |
| **Lint** | 每次提交前必须通过 |
| **MVVM** | 严格分离 Model / ViewModel / View |

### 提交规范

遵循 Conventional Commits，原子化提交：

| 类型 | 说明 |
|------|------|
| `fix` | 修复 Bug、处理边缘情况 |
| `feat` | 新功能或显著改进 |
| `refactor` | 代码重构，不改变逻辑 |
| `test` | 增加或修正测试代码 |
| `docs` | 文档更新 |
| `chore` | 维护任务、依赖管理 |

**提交触发条件**:
- 测试通过后立即提交
- 错误修复后立即提交
- 文档同步更新时提交
- 重构前先提交当前进度

### 架构原则

| 层级 | 职责 | 测试策略 |
|------|------|---------|
| **Model** | 类型定义、数据结构 | Schema 验证 |
| **ViewModel** | 业务逻辑、状态管理 | 单元测试 |
| **View** | 纯 UI 渲染 | 组件测试 |

### 里程碑验收标准

每个里程碑完成必须满足：

- [ ] 单元测试通过 (`pnpm test`)
- [ ] Lint 检查通过 (`pnpm lint`)
- [ ] 覆盖率 >= 90%
- [ ] 文档同步更新
- [ ] 原子化提交，每个 commit 可独立回滚

---

## 里程碑总览

| 阶段 | 里程碑 | 目标 |
|------|--------|------|
| Phase 1 | M1-M3 | Agent 核心可用 |
| Phase 2 | M4-M5 | Discord 集成 |
| Phase 3 | M6-M7 | 工具扩展 + 知识库 |
| Phase 4 | M8 | 生产化 |

---

## Phase 1: Agent 核心

### Milestone 1: Storage 包骨架

**目标**: 建立统一存储访问层

**交付物**:
- `packages/storage/` 包结构
- 路径解析 (`paths.ts`)
- 配置管理 (`config.ts`)
- 凭证管理 (`credentials.ts`)
- 完整单元测试

**MVVM 分层**:
```
packages/storage/
├── src/
│   ├── types.ts           # Model: 类型定义
│   ├── paths.ts           # ViewModel: 路径解析逻辑
│   ├── config.ts          # ViewModel: 配置读写逻辑
│   ├── credentials.ts     # ViewModel: 凭证管理逻辑
│   └── index.ts           # 导出
```

**接口**:
```typescript
// paths.ts
export function resolvePaths(options?: PathResolverOptions): PathResolver;

// config.ts  
export function createConfigManager(configPath?: string): ConfigManager;

// credentials.ts
export function createCredentialManager(credentialsDir?: string): CredentialManager;
```

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] 可以读写 `~/.deca/config.json`
- [ ] 可以读写 `~/.deca/credentials/*.json`
- [ ] 环境变量覆盖生效

**依赖**: 无

---

### Milestone 2: Agent 核心包

**目标**: 实现 Agent 核心循环

**交付物**:
- `packages/agent/` 包结构
- Agent 核心类 (`core/agent.ts`)
- 会话管理 (`core/session.ts`)
- 工具接口定义 (`tools/types.ts`)
- Mock LLM 用于测试

**MVVM 分层**:
```
packages/agent/
├── src/
│   ├── types.ts              # Model: Agent 类型定义
│   ├── core/
│   │   ├── agent.ts          # ViewModel: Agent 核心逻辑
│   │   └── session.ts        # ViewModel: 会话管理逻辑
│   ├── tools/
│   │   ├── types.ts          # Model: Tool 接口定义
│   │   └── registry.ts       # ViewModel: 工具注册逻辑
│   └── index.ts
```

**接口**:
```typescript
// agent.ts
export class Agent {
  constructor(config: AgentConfig);
  run(sessionId: string, message: string, callbacks?: AgentCallbacks): Promise<RunResult>;
  reset(sessionId: string): Promise<void>;
  getHistory(sessionId: string): Message[];
}
```

**Agent Loop 伪代码**:
```
1. 加载会话历史
2. 添加用户消息
3. while (turns < maxTurns):
   a. 调用 LLM
   b. 解析响应
   c. if text: 回调 onTextDelta/onTextComplete
   d. if tool_use: 执行工具，添加 tool_result
   e. if stop_reason == "end_turn": break
4. 保存会话
5. 返回结果
```

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] Mock LLM 场景测试通过
- [ ] 工具调用链路验证
- [ ] 会话持久化验证

**依赖**: M1 (Storage)

---

### Milestone 3: Heartbeat 机制

**目标**: 实现主动唤醒机制

**交付物**:
- Heartbeat 管理器 (`heartbeat/manager.ts`)
- HEARTBEAT.md 解析器 (`heartbeat/parser.ts`)
- 与 Agent 集成

**MVVM 分层**:
```
packages/agent/
├── src/
│   ├── heartbeat/
│   │   ├── types.ts          # Model: Heartbeat 类型定义
│   │   ├── parser.ts         # ViewModel: 解析逻辑
│   │   └── manager.ts        # ViewModel: 调度逻辑
```

**接口**:
```typescript
// manager.ts
export class HeartbeatManager {
  constructor(config: HeartbeatConfig);
  start(): void;
  stop(): void;
  trigger(): Promise<HeartbeatTask[]>;
  onTasks(callback: HeartbeatHandler): void;
}

// parser.ts
export function parseHeartbeatFile(content: string): HeartbeatTask[];
export function markTaskCompleted(content: string, lineNumber: number): string;
```

**Heartbeat 流程**:
```
1. setTimeout 精确调度
2. 到期时读取 HEARTBEAT.md
3. 解析任务列表
4. 如果有未完成任务:
   a. 回调注册的 handler
   b. handler 可以调用 Agent
5. 调度下一次检查
```

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] 任务解析正确
- [ ] 定时触发精确
- [ ] 与 Agent 集成验证

**依赖**: M2 (Agent)

---

## Phase 2: Discord 集成

### Milestone 4: Discord Gateway

> **详细设计**: [11-discord-gateway-design.md](./11-discord-gateway-design.md)

**目标**: 实现 Discord Bot 连接，支持消息收发和通道过滤

**核心设计决策**:
- **模块独立性**: Discord 模块不直接依赖 `@deca/agent`，通过 `MessageHandler` 接口解耦
- **测试策略**: 三层 E2E 测试 (Mock → 集成 → Live)
- **CLI 入口**: 独立的 `discord-cli.ts` 可单独运行和测试

**交付物**:
```
apps/api/src/
├── channels/discord/
│   ├── types.ts          # MessageHandler 接口 + Discord 类型
│   ├── chunk.ts          # 消息分块 (2000 字符限制)
│   ├── allowlist.ts      # Guild/Channel/User 过滤
│   ├── session.ts        # Discord Session Key 生成
│   ├── client.ts         # discord.js 客户端管理
│   ├── sender.ts         # 消息发送 + 分块
│   ├── listener.ts       # 消息监听 + 路由
│   ├── gateway.ts        # 组装层
│   └── index.ts          # 导出
├── discord-cli.ts        # CLI 入口（目前仅 echo 模式）
└── e2e/
    ├── discord.unit.e2e.test.ts        # Mock 全部
    ├── discord.integration.e2e.test.ts # Mock Discord, 真实 Agent
    └── discord.live.e2e.test.ts        # 真实 Discord 连接
```

**核心接口**:
```typescript
// MessageHandler - Discord 模块唯一的外部依赖点
export interface MessageHandler {
  handle(request: MessageRequest): Promise<MessageResponse>;
}

export interface MessageRequest {
  sessionKey: string;
  content: string;
  sender: { id: string; username: string; displayName?: string };
  channel: { id: string; type: "dm" | "guild" | "thread"; guildId?: string };
}

export interface MessageResponse {
  text: string;
  success: boolean;
  error?: string;
}

// Gateway
export interface DiscordGateway {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly isConnected: boolean;
  readonly user: User | null;
}
```

**功能范围**:
| 功能 | M4 |
|------|-----|
| discord.js 连接 | ✅ |
| 消息接收 (messageCreate) | ✅ |
| 消息发送 (reply/send) | ✅ |
| 消息分块 (2000 字符) | ✅ |
| Bot 消息过滤 | ✅ |
| Guild/Channel/User Allowlist | ✅ |
| User Deny List | ✅ |
| DM 基础支持 | ✅ |
| Thread 基础支持 | ✅ |
| Require Mention | ✅ |
| Session Key 生成 | ✅ |
| Typing 指示器 | ✅ |
| MessageHandler 解耦 | ✅ |
| Agent 适配器 | ✅ |
| CLI 入口 | ✅ |
| Slash Commands | ❌ (M5) |
| Debounce | ❌ (M5) |
| History Context | ❌ (M5) |

**测试矩阵**:
| 测试类型 | Discord | Handler | 凭证要求 | CI |
|---------|---------|---------|---------|-----|
| 单元测试 | Mock | Mock | 无 | ✅ |
| 单元 E2E | Mock | Echo | 无 | ✅ |
| 集成 E2E | Mock | 真实 Agent | Anthropic | ⚠️ |
| Live E2E | 真实 | 真实 Agent | Discord + Anthropic | ❌ |

**验收标准**:
- [ ] `bun test` 通过
- [ ] `bun run lint` 通过
- [ ] 覆盖率 >= 95%
- [ ] ~120 个测试用例
- [ ] CLI 可独立运行
- [ ] 凭证从 `~/.deca/credentials/discord.json` 加载

**依赖**: M1 (Storage - credentials)

---

### Milestone 5: Discord 增强

**目标**: 增强 Discord 功能，添加 Slash Commands 和上下文支持

**交付物**:
- Slash Commands (`/ask`, `/reset`, `/status`)
- 消息去重 (Debounce, 250ms 窗口)
- History Context (群聊历史 20 条)
- HTTP API 控制端点 (`/discord/start`, `/discord/stop`, `/discord/status`)

**验收标准**:
- [ ] `bun test` 通过
- [ ] `bun run lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] Slash Commands 可用
- [ ] 群聊上下文验证

**依赖**: M4 (Discord Gateway)

---

## Phase 3: 工具扩展

### Milestone 6: 基础工具集

**目标**: 实现 Agent 可用的工具

**交付物**:
- 工具注册中心 (`packages/agent/src/tools/registry.ts`)
- 内置工具:
  - `applescript` - 包装现有 executor
  - `shell` - 执行命令
  - `read` - 读取文件
  - `write` - 写入文件
  - `edit` - 编辑文件 (字符串替换)
  - `list` - 列出目录
  - `grep` - 搜索内容

**MVVM 分层**:
```
packages/agent/src/tools/
├── types.ts                  # Model: Tool 接口
├── registry.ts               # ViewModel: 注册逻辑
├── builtin/
│   ├── applescript.ts        # ViewModel: AppleScript 工具
│   ├── shell.ts              # ViewModel: Shell 工具
│   ├── read.ts               # ViewModel: 读取工具
│   ├── write.ts              # ViewModel: 写入工具
│   ├── edit.ts               # ViewModel: 编辑工具
│   ├── list.ts               # ViewModel: 目录工具
│   └── grep.ts               # ViewModel: 搜索工具
```

**接口**:
```typescript
// registry.ts
export class ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  toAnthropicTools(): AnthropicTool[];
}
```

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] 每个工具独立测试通过
- [ ] 工具注册和查找正确
- [ ] Agent 调用工具验证

**依赖**: M2 (Agent)

---

### Milestone 7: 知识库集成

**目标**: 支持项目知识库

**交付物**:
- 知识库管理 (`packages/storage/src/knowledge.ts`)
- 上下文注入到 Agent
- 知识文件模板

**MVVM 分层**:
```
packages/storage/src/
├── knowledge.ts              # ViewModel: 知识库管理逻辑
├── knowledge.test.ts
```

**接口**:
```typescript
// knowledge.ts
export function createKnowledgeManager(knowledgeDir?: string): KnowledgeManager;

export interface KnowledgeManager {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  list(): Promise<KnowledgeFile[]>;
  buildPrompt(names?: string[]): Promise<string>;
}
```

**知识文件**:
- `AGENTS.md` - Agent 行为指南
- `IDENTITY.md` - Agent 身份设定
- `CONTEXT.md` - 项目上下文

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] 知识文件读写正确
- [ ] 上下文注入到 system prompt
- [ ] Agent 响应验证

**依赖**: M1 (Storage), M2 (Agent)

---

## Phase 4: 生产化

### Milestone 8: 生产就绪

**目标**: 完善错误处理、日志、监控

**交付物**:
- 结构化日志
- 错误恢复机制
- 健康检查端点
- 配置验证
- CLI 工具 (`deca` 命令)

**CLI 命令**:
```bash
# 初始化
deca init

# 配置管理
deca config get <key>
deca config set <key> <value>
deca config set-credential <provider>

# Agent 控制
deca agent start
deca agent stop
deca agent status

# 会话管理
deca sessions list
deca sessions clear <id>
```

**验收标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 覆盖率 >= 90%
- [ ] CLI 命令可用
- [ ] 日志输出正确
- [ ] 错误恢复验证
- [ ] 长时间运行稳定性

**依赖**: M5 (Discord + Agent 集成)

---

## 依赖关系图

```
M1 (Storage)
    │
    ├──────────────────┐
    │                  │
    ▼                  ▼
M2 (Agent)         M4 (Discord Gateway)
    │                  │
    ├──────────────────┤
    │                  │
    ▼                  │
M3 (Heartbeat)         │
    │                  │
    └────────┬─────────┘
             │
             ▼
    M5 (Discord + Agent)
             │
             ├───────────────┐
             │               │
             ▼               ▼
    M6 (Tools)        M7 (Knowledge)
             │               │
             └───────┬───────┘
                     │
                     ▼
              M8 (Production)
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Discord API 变更 | M4-M5 | 使用稳定版本，抽象接口 |
| LLM API 限流 | M2 | 重试机制，请求合并 |
| 工具执行超时 | M6 | 超时控制，异步执行 |
| 凭证泄露 | 安全 | 权限控制，环境变量 |

---

## 相关文档

- [02-testing.md](./02-testing.md) - 测试策略
- [04-console.md](./04-console.md) - Console MVVM 规范
- [07-agent-architecture.md](./07-agent-architecture.md) - Agent 架构设计
- [08-storage-system.md](./08-storage-system.md) - 存储系统设计
- [10-implementation-status.md](./10-implementation-status.md) - 实现状态
- [11-discord-gateway-design.md](./11-discord-gateway-design.md) - M4 Discord Gateway 详细设计
