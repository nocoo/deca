<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Deca logo" width="180" height="180" />
</p>

# 🤖 Deca

> 本地优先的 macOS AI Agent 控制网关

Deca 是一个本地运行的 AI Agent 系统，允许 AI 通过多种通道（Discord、Terminal、HTTP）与用户交互，并通过工具层控制本地 macOS 机器。

## ✨ 主要功能

- **🧠 AI Agent 核心** - 基于 Claude API 的对话管理和工具调用
- **💬 多通道支持** - Discord 机器人、终端 REPL、HTTP API
- **🔧 工具系统** - AppleScript、Shell 命令、文件操作等
- **💾 持久化存储** - SQLite 会话存储和凭证管理
- **🧠 长期记忆** - 基于文件系统的记忆检索和存储
- **⏰ 心跳机制** - 定时任务和主动唤醒

## 📁 目录结构

```
packages/
├── agent/      # AI Agent 核心（对话管理、工具执行）
├── storage/    # 持久化层（SQLite）
├── discord/    # Discord 机器人通道
├── terminal/   # 终端 REPL 通道
├── http/       # HTTP API 通道（Hono）
└── gateway/    # 组装层（组合 agent + channels）

docs/           # 项目文档
```

## 🚀 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器（Echo 模式，无需 API Key）
bun run dev

# 启动开发服务器（Agent 模式，需要 API Key）
ANTHROPIC_API_KEY=xxx bun run dev
```

## 🧪 测试

Deca 采用四层测试架构：

| 层级 | 类型 | 命令 | 特点 |
|------|------|------|------|
| 1 | Unit | `bun run test:unit` | Mock 依赖，快速 |
| 2 | Lint | `bun run lint` | 静态检查 |
| 3 | E2E | `bun --filter @deca/discord test:e2e` | Echo 模式 |
| 4 | Behavioral | `bun --filter @deca/gateway test:behavioral` | 真实 LLM |

```bash
# 单元测试
bun run test:unit

# 代码检查
bun run lint

# 行为测试（需要 LLM API + Discord）
bun --filter @deca/gateway test:behavioral
```

详见 [docs/04-testing.md](docs/04-testing.md)

## 📊 测试覆盖率

### 单元测试 (739 个)

| 模块 | 测试数 | 覆盖率目标 |
|------|--------|-----------|
| @deca/agent | 319 | 90%+ |
| @deca/discord | 254 | 90%+ |
| @deca/terminal | 47 | 90%+ |
| @deca/http | 35 | 90%+ |
| @deca/storage | 47 | 90%+ |
| @deca/gateway | 37 | 90%+ |

### E2E 测试 (103+ 个)

| 模块 | 测试数 | 说明 |
|------|--------|------|
| @deca/agent | 56 | Memory + Cron |
| @deca/discord | 3/6 | Core/Full |
| @deca/gateway | 7 | 集成测试 |
| @deca/http | 9 | API + Auth |
| @deca/terminal | 6 | REPL |
| @deca/storage | 22 | 持久化层 |

## 📚 文档

| 文档 | 说明 |
|------|------|
| [系统架构](docs/01-architecture.md) | 整体架构设计和模块依赖关系 |
| [模块详解](docs/02-modules.md) | 各模块功能和接口说明 |
| [开发指南](docs/03-development.md) | 本地开发环境配置和常用命令 |
| [测试规范](docs/04-testing.md) | **四层测试架构**、覆盖率要求 |
| [贡献指南](docs/05-contributing.md) | Git 规范、代码风格和提交要求 |
| [E2E 调试](docs/06-e2e-discord-debugging.md) | Discord E2E 调试闭环 |
| [Agent 工具](docs/07-agent-tools.md) | Agent 工具系统详解 |

---

## 🤖 AI Agent 须知

> 以下内容供 AI 编程助手阅读

### 核心原则

1. **TDD 优先** - 先写测试，后写实现
2. **90% 覆盖率** - 所有模块必须达到 90%+ 测试覆盖率
3. **原子化提交** - 每个 commit 代表一个单一且逻辑完整的变更
4. **文档同步** - 修改代码必须同步更新相关文档

### 模块边界规则

```
gateway → discord, terminal, http, agent, storage  (唯一组装点)
discord, terminal, http → (无依赖，各自独立)
agent → storage
```

**严格规则：**
- Gateway 是唯一可以组装 agent + channels 的地方
- Channels 不能依赖 @deca/agent
- Channels 不能相互依赖
- 每个 channel 定义自己的 MessageHandler 接口

### 开发流程

1. 理解需求，规划任务
2. 编写测试用例
3. 实现功能代码
4. 确保测试通过和 lint 通过
5. 更新相关文档
6. 原子化提交

### 常用命令

```bash
bun install              # 安装依赖
bun run dev              # 启动开发服务器
bun run test:unit        # 运行单元测试
bun run lint             # 运行代码检查
```

### Git 规范

遵循 Conventional Commits：
- `fix:` - Bug 修复
- `feat:` - 新功能
- `refactor:` - 代码重构
- `docs:` - 文档更新
- `test:` - 测试相关
- `chore:` - 维护任务

## 📄 许可证

MIT

Logo assets and usage: [guide](docs/12-logo-usage.md) · [identity study](https://hexly.ai/logos/deca).
