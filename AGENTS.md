# Deca - AI Agent 控制网关

> 本地优先的 macOS AI Agent 系统

## 📚 文档索引

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 项目概览、快速开始 |
| [docs/01-architecture.md](docs/01-architecture.md) | 系统架构设计 |
| [docs/02-modules.md](docs/02-modules.md) | 模块详解 |
| [docs/03-development.md](docs/03-development.md) | 开发环境配置 |
| [docs/04-testing.md](docs/04-testing.md) | **四层测试架构** |
| [docs/05-contributing.md](docs/05-contributing.md) | 贡献指南 |

### 调试与高级

| 文档 | 说明 |
|------|------|
| [docs/06-e2e-discord-debugging.md](docs/06-e2e-discord-debugging.md) | Discord E2E 调试闭环 |
| [docs/07-agent-tools.md](docs/07-agent-tools.md) | Agent 工具系统 |

### 模块文档

| 模块 | 文档 |
|------|------|
| @deca/agent | [docs/modules/agent.md](docs/modules/agent.md) |
| @deca/discord | [docs/modules/discord.md](docs/modules/discord.md) |
| @deca/gateway | [docs/modules/gateway.md](docs/modules/gateway.md) |
| @deca/http | [docs/modules/http.md](docs/modules/http.md) |
| @deca/storage | [docs/modules/storage.md](docs/modules/storage.md) |
| @deca/terminal | [docs/modules/terminal.md](docs/modules/terminal.md) |

## 📁 项目结构

```
deca/
├── packages/
│   ├── agent/           # AI Agent 核心
│   ├── discord/         # Discord 通道
│   ├── gateway/         # 组装层
│   │   └── behavioral-tests/  # Agent 行为测试
│   ├── http/            # HTTP API 通道
│   ├── storage/         # 持久化层
│   └── terminal/        # 终端 REPL 通道
├── docs/                # 项目文档
├── prompts/             # Agent Prompt 模板
└── eval/                # Prompt 评估系统
```

## 🧪 四层测试

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Behavioral Tests (Real LLM + Discord)         │
│           bun --filter @deca/gateway test:behavioral    │
├─────────────────────────────────────────────────────────┤
│  Layer 3: E2E Tests (Echo Mode, Real Channels)          │
│           bun --filter @deca/discord test:e2e           │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Lint (Biome)                                  │
│           bun run lint                                  │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Unit Tests (Mocked, Fast)                     │
│           bun run test:unit                             │
└─────────────────────────────────────────────────────────┘
```

详见 [docs/04-testing.md](docs/04-testing.md)

## 🔧 常用命令

```bash
# 开发
bun install              # 安装依赖
bun run dev              # 启动开发服务器（Echo 模式）

# 测试
bun run test:unit        # 单元测试
bun run lint             # 代码检查
bun --filter @deca/gateway test:behavioral  # 行为测试

# Git
git commit               # 触发 pre-commit hooks (unit + lint)
git push                 # 触发 pre-push hooks (unit + lint + e2e)
```

## 📐 模块边界

```
gateway → discord, terminal, http, agent, storage  (唯一组装点)
discord, terminal, http → (无依赖，各自独立)
agent → storage
```

**规则**:
- Gateway 是唯一组装 agent + channels 的地方
- Channels 不能依赖 @deca/agent
- Channels 不能相互依赖
