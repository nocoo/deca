# 存储系统设计

## 概述

Deca 存储系统负责管理配置、凭证、会话、知识库等数据的统一存储和访问。

### 设计目标

1. **统一接口** - 所有模块通过 `@deca/storage` 包访问存储
2. **分层管理** - 配置、凭证、数据、缓存分开存储
3. **安全优先** - 敏感信息加密存储，权限控制
4. **Git 友好** - 明确哪些文件可以 check in

---

## 存储结构

### 用户级存储 (`~/.deca/`)

全局存储，跨项目共享。

```
~/.deca/
├── config.json                    # 全局配置
├── credentials/                   # 敏感凭证 (700 权限)
│   ├── anthropic.json             # { apiKey, baseUrl }
│   ├── discord.json               # { botToken, applicationId }
│   ├── github.json                # { token }
│   └── openai.json                # { apiKey, baseUrl }
├── sessions/                      # 对话历史
│   ├── <sessionId>.jsonl          # JSONL 格式
│   └── ...
├── memory/                        # 长期记忆
│   ├── index.json                 # 记忆索引
│   └── entries/                   # 记忆条目
└── cache/                         # 临时缓存
    └── ...
```

### 项目级存储 (`<project>/.deca/`)

项目特定存储，部分可 check in。

```
<project>/.deca/
├── config.local.json              # 项目本地配置 (不 check in)
├── HEARTBEAT.md                   # Heartbeat 任务 (可 check in)
├── knowledge/                     # 项目知识库 (可 check in)
│   ├── AGENTS.md                  # Agent 行为指南
│   ├── IDENTITY.md                # Agent 身份设定
│   ├── CONTEXT.md                 # 项目上下文
│   └── ...
└── sessions/                      # 项目会话 (不 check in)
    └── ...
```

---

## Git 策略

### 应该 Check In

| 路径 | 说明 |
|------|------|
| `.deca/knowledge/*.md` | 项目知识库，公开信息 |
| `.deca/HEARTBEAT.md` | 任务列表，团队共享 |
| `config/schema.json` | 配置 Schema 定义 |
| `config/default.json` | 默认配置模板 |

### 不应该 Check In

| 路径 | 说明 |
|------|------|
| `~/.deca/**` | 用户级存储，不在 repo 内 |
| `.deca/config.local.json` | 可能包含本地路径 |
| `.deca/credentials/**` | 绝对不能 check in |
| `.deca/sessions/**` | 对话历史，隐私数据 |
| `.deca/cache/**` | 临时缓存 |

### .gitignore 配置

```gitignore
# Deca local state
.deca/config.local.json
.deca/credentials/
.deca/sessions/
.deca/cache/

# Keep knowledge and heartbeat
!.deca/knowledge/
!.deca/HEARTBEAT.md
```

---

## 包结构

```
packages/storage/
├── src/
│   ├── paths.ts               # 路径解析
│   ├── paths.test.ts
│   ├── config.ts              # 配置读写
│   ├── config.test.ts
│   ├── credentials.ts         # 凭证管理
│   ├── credentials.test.ts
│   ├── session.ts             # 会话管理
│   ├── session.test.ts
│   ├── knowledge.ts           # 知识库访问
│   ├── knowledge.test.ts
│   ├── types.ts               # 类型定义
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## 接口设计

### 路径解析

```typescript
// packages/storage/src/paths.ts

export interface PathResolver {
  /** 用户级状态目录 (~/.deca) */
  stateDir: string;
  /** 项目级目录 (<cwd>/.deca，可能不存在) */
  projectDir: string | null;
  
  /** 配置文件路径 */
  configPath: string;
  /** 凭证目录 */
  credentialsDir: string;
  /** 会话目录 */
  sessionsDir: string;
  /** 记忆目录 */
  memoryDir: string;
  /** 知识库目录（项目级） */
  knowledgeDir: string | null;
  /** Heartbeat 文件路径（项目级） */
  heartbeatPath: string | null;
}

export interface PathResolverOptions {
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 当前工作目录 */
  cwd?: string;
  /** 自定义用户目录 */
  homedir?: string;
}

/**
 * 解析存储路径
 */
export function resolvePaths(options?: PathResolverOptions): PathResolver;

/**
 * 检查项目目录是否存在
 */
export function hasProjectDir(cwd?: string): boolean;

/**
 * 初始化项目目录结构
 */
export function initProjectDir(cwd?: string): Promise<void>;
```

### 配置管理

```typescript
// packages/storage/src/config.ts

export interface DecaConfig {
  /** 模型配置 */
  models?: {
    default?: string;
    providers?: {
      [name: string]: {
        baseUrl?: string;
        model?: string;
      };
    };
  };
  
  /** Agent 配置 */
  agent?: {
    maxTurns?: number;
    enableHeartbeat?: boolean;
    heartbeatInterval?: number;
  };
  
  /** 通道配置 */
  channels?: {
    discord?: {
      enabled?: boolean;
      defaultChannelId?: string;
      allowedUsers?: string[];
    };
  };
  
  /** 日志配置 */
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

export interface ConfigManager {
  /** 加载配置 */
  load(): Promise<DecaConfig>;
  /** 保存配置 */
  save(config: DecaConfig): Promise<void>;
  /** 获取配置值 */
  get<K extends keyof DecaConfig>(key: K): Promise<DecaConfig[K] | undefined>;
  /** 设置配置值 */
  set<K extends keyof DecaConfig>(key: K, value: DecaConfig[K]): Promise<void>;
}

/**
 * 创建配置管理器
 */
export function createConfigManager(configPath?: string): ConfigManager;
```

### 凭证管理

```typescript
// packages/storage/src/credentials.ts

export interface CredentialStore {
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
  };
  discord?: {
    botToken: string;
    applicationId?: string;
  };
  github?: {
    token: string;
  };
  openai?: {
    apiKey: string;
    baseUrl?: string;
  };
}

export interface CredentialManager {
  /** 获取凭证 */
  get<K extends keyof CredentialStore>(key: K): Promise<CredentialStore[K] | null>;
  /** 设置凭证 */
  set<K extends keyof CredentialStore>(key: K, value: CredentialStore[K]): Promise<void>;
  /** 删除凭证 */
  delete(key: keyof CredentialStore): Promise<void>;
  /** 列出已配置的凭证 */
  list(): Promise<(keyof CredentialStore)[]>;
  /** 检查凭证是否存在 */
  has(key: keyof CredentialStore): Promise<boolean>;
}

/**
 * 创建凭证管理器
 */
export function createCredentialManager(credentialsDir?: string): CredentialManager;
```

### 会话管理

```typescript
// packages/storage/src/session.ts

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: number;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  // ... 具体字段根据类型
}

export interface SessionManager {
  /** 加载会话历史 */
  load(sessionId: string): Promise<Message[]>;
  /** 追加消息 */
  append(sessionId: string, message: Message): Promise<void>;
  /** 清空会话 */
  clear(sessionId: string): Promise<void>;
  /** 列出所有会话 */
  list(): Promise<string[]>;
  /** 获取会话元数据 */
  getMeta(sessionId: string): Promise<SessionMeta | null>;
}

export interface SessionMeta {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/**
 * 创建会话管理器
 */
export function createSessionManager(sessionsDir?: string): SessionManager;
```

### 知识库访问

```typescript
// packages/storage/src/knowledge.ts

export interface KnowledgeFile {
  name: string;
  path: string;
  content: string;
  updatedAt: number;
}

export interface KnowledgeManager {
  /** 读取知识文件 */
  read(name: string): Promise<string | null>;
  /** 写入知识文件 */
  write(name: string, content: string): Promise<void>;
  /** 列出所有知识文件 */
  list(): Promise<KnowledgeFile[]>;
  /** 检查文件是否存在 */
  exists(name: string): Promise<boolean>;
  /** 构建知识 prompt */
  buildPrompt(names?: string[]): Promise<string>;
}

/**
 * 创建知识库管理器
 */
export function createKnowledgeManager(knowledgeDir?: string): KnowledgeManager;
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DECA_STATE_DIR` | 覆盖用户级状态目录 | `~/.deca` |
| `DECA_CONFIG_PATH` | 覆盖配置文件路径 | `~/.deca/config.json` |
| `ANTHROPIC_API_KEY` | 直接设置 API Key | - |
| `ANTHROPIC_BASE_URL` | 直接设置 API Base URL | - |
| `DISCORD_BOT_TOKEN` | 直接设置 Discord Token | - |

环境变量优先级高于文件配置。

---

## 文件格式

### config.json

```json
{
  "models": {
    "default": "claude-sonnet-4-20250514",
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com"
      },
      "minimax": {
        "baseUrl": "https://api.minimaxi.com/anthropic",
        "model": "MiniMax-M2.1"
      }
    }
  },
  "agent": {
    "maxTurns": 20,
    "enableHeartbeat": true,
    "heartbeatInterval": 1800000
  },
  "channels": {
    "discord": {
      "enabled": true,
      "defaultChannelId": "123456789"
    }
  }
}
```

### credentials/anthropic.json

```json
{
  "apiKey": "sk-ant-...",
  "baseUrl": "https://api.anthropic.com"
}
```

### sessions/<id>.jsonl

```jsonl
{"role":"user","content":"Hello","timestamp":1700000000000}
{"role":"assistant","content":"Hi! How can I help you?","timestamp":1700000001000}
{"role":"user","content":"What time is it?","timestamp":1700000002000}
```

### HEARTBEAT.md

```markdown
# Heartbeat Tasks

- [ ] Check email and summarize important messages
- [ ] Review today's calendar
- [x] Send daily status report
```

---

## 安全措施

### 文件权限

| 目录 | 权限 | 说明 |
|------|------|------|
| `~/.deca/` | 700 | 仅所有者可访问 |
| `~/.deca/credentials/` | 700 | 凭证目录 |
| `~/.deca/credentials/*.json` | 600 | 凭证文件 |
| `~/.deca/config.json` | 600 | 可能包含敏感配置 |

### 凭证处理

1. 从不在日志中打印完整凭证
2. 凭证验证失败时提示重新配置
3. 支持从环境变量读取（CI/CD 场景）

---

## 与 Agent 的集成

```typescript
// apps/api/src/agent/instance.ts

import { 
  resolvePaths, 
  createConfigManager, 
  createCredentialManager,
  createSessionManager 
} from '@deca/storage';
import { Agent } from '@deca/agent';

export async function createAgentInstance() {
  const paths = resolvePaths();
  const config = createConfigManager(paths.configPath);
  const credentials = createCredentialManager(paths.credentialsDir);
  const sessions = createSessionManager(paths.sessionsDir);
  
  // 获取 API 凭证
  const anthropic = await credentials.get('anthropic');
  if (!anthropic?.apiKey) {
    throw new Error('Anthropic API key not configured. Run: deca config set-credential anthropic');
  }
  
  // 加载配置
  const agentConfig = await config.get('agent');
  const modelConfig = await config.get('models');
  
  return new Agent({
    apiKey: anthropic.apiKey,
    baseUrl: anthropic.baseUrl,
    model: modelConfig?.default ?? 'claude-sonnet-4-20250514',
    maxTurns: agentConfig?.maxTurns ?? 20,
    sessionManager: sessions,
    heartbeat: agentConfig?.enableHeartbeat ? {
      enabled: true,
      intervalMs: agentConfig.heartbeatInterval ?? 1800000,
      filePath: paths.heartbeatPath ?? undefined
    } : undefined
  });
}
```

---

## 迁移策略

### 从环境变量迁移

```bash
# 旧方式
export ANTHROPIC_API_KEY=sk-ant-...

# 新方式
deca config set-credential anthropic --api-key sk-ant-...
```

### 初始化向导

```bash
$ deca init

Welcome to Deca!

Setting up storage...
  Created ~/.deca/
  Created ~/.deca/credentials/
  Created ~/.deca/sessions/

Configure Anthropic API:
  API Key: sk-ant-...
  Saved to ~/.deca/credentials/anthropic.json

Configure Discord (optional):
  Bot Token: (skip)

Done! Run 'deca agent start' to begin.
```

---

## 相关文档

- [07-agent-architecture.md](./07-agent-architecture.md) - Agent 架构设计
- [09-agent-milestones.md](./09-agent-milestones.md) - 里程碑计划
