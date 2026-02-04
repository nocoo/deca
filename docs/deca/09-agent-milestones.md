# Agent 系统里程碑计划

## 概述

本文档定义 Deca Agent 系统的分阶段实现计划。每个里程碑遵循：

- **TDD**: 先写测试再实现
- **覆盖率**: >= 90%
- **验证**: 每个里程碑完成后运行 UT + Lint
- **增量交付**: 每个里程碑可独立验证和使用

---

## 里程碑总览

| 阶段 | 里程碑 | 目标 | 预计工时 |
|------|--------|------|---------|
| Phase 1 | M1-M3 | Agent 核心可用 | 2-3 天 |
| Phase 2 | M4-M5 | Discord 集成 | 1-2 天 |
| Phase 3 | M6-M7 | 工具扩展 + 知识库 | 2-3 天 |
| Phase 4 | M8 | 生产化 | 1-2 天 |

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

**接口**:
```typescript
// paths.ts
export function resolvePaths(options?: PathResolverOptions): PathResolver;

// config.ts  
export function createConfigManager(configPath?: string): ConfigManager;

// credentials.ts
export function createCredentialManager(credentialsDir?: string): CredentialManager;
```

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
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

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
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

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 任务解析正确
- [ ] 定时触发精确
- [ ] 与 Agent 集成验证

**依赖**: M2 (Agent)

---

## Phase 2: Discord 集成

### Milestone 4: Discord Gateway

**目标**: 实现 Discord Bot 连接

**交付物**:
- Discord 通道适配器 (`channels/discord/gateway.ts`)
- 消息处理器 (`channels/discord/handlers.ts`)
- 输出格式化 (`channels/discord/formatter.ts`)

**接口**:
```typescript
// gateway.ts
export function createDiscordGateway(config: DiscordConfig): DiscordGateway;

export interface DiscordGateway {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(channelId: string, message: string): Promise<void>;
  onMessage(handler: MessageHandler): void;
}
```

**验证标准**:
- [ ] `pnpm test` 通过 (Mock WebSocket)
- [ ] `pnpm lint` 通过
- [ ] 可以接收消息
- [ ] 可以发送消息
- [ ] 重连逻辑正确

**依赖**: M1 (Storage - credentials)

---

### Milestone 5: Discord + Agent 集成

**目标**: 完成 Discord 到 Agent 的完整链路

**交付物**:
- Agent 实例管理 (`apps/api/src/agent/instance.ts`)
- Discord 集成 (`apps/api/src/agent/discord.ts`)
- 启动脚本更新

**集成流程**:
```
1. 启动时初始化 Agent 实例
2. 启动 Discord Gateway
3. Discord 消息 → Agent.run()
4. Agent 响应 → Discord.send()
5. Heartbeat 触发 → Agent.run() → Discord.send()
```

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] 端到端消息验证 (手动)
- [ ] Heartbeat → Discord 验证 (手动)

**依赖**: M3 (Heartbeat), M4 (Discord Gateway)

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

**接口**:
```typescript
// registry.ts
export class ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  toAnthropicTools(): AnthropicTool[];
}

// 工具包装示例
export const applescriptTool: Tool = {
  name: 'applescript',
  description: 'Execute AppleScript on macOS',
  inputSchema: { /* ... */ },
  execute: async (input, context) => { /* ... */ }
};
```

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
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

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
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

**验证标准**:
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
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

## 验收检查清单

### 每个 Milestone

- [ ] 单元测试通过 (`pnpm test`)
- [ ] Lint 检查通过 (`pnpm lint`)
- [ ] 覆盖率 >= 90%
- [ ] 文档更新
- [ ] 代码审查

### Phase 完成

- [ ] 集成测试通过
- [ ] 手动验证通过
- [ ] 性能可接受
- [ ] 无已知严重 Bug

### 最终发布

- [ ] 所有 Milestone 完成
- [ ] 端到端测试通过
- [ ] 文档完整
- [ ] README 更新
- [ ] 版本号更新

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

- [07-agent-architecture.md](./07-agent-architecture.md) - Agent 架构设计
- [08-storage-system.md](./08-storage-system.md) - 存储系统设计
- [05-plan.md](./05-plan.md) - 现有里程碑计划
