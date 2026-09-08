<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" height="128" alt="Deca logo" />
</p>
<h1 align="center">Deca</h1>
<p align="center">通过 Discord、终端或本机 HTTP 接口，与能使用文件和命令工具的个人 Agent 交互。</p>
<p align="center"><a href="docs/README.en.md">English</a></p>

## 这是什么

Deca 是本地运行的个人 Agent 系统，开发和使用以 macOS 为主。Gateway 将对话核心与 Discord、终端 REPL、HTTP 通道组合起来，用模型处理请求，并按需要调用文件、Shell 和其他工具。

会话与配置保存在本地文件中；模型请求、Discord 消息和可选的网络搜索会访问相应外部服务。它适合由自己配置和管理的本机工作流。

## 功能

- 通过 Discord、终端和 HTTP 对话；Gateway 的队列统一处理来自不同通道的请求。
- 使用 Anthropic SDK 调用模型，支持配置兼容的 API 地址和模型名称。
- 读取、写入、编辑、列出和搜索文件，执行 Shell 命令；可选调用已安装的 Claude Code CLI。
- 用 JSONL 保存对话记录，按会话键恢复上下文；用文件记忆和关键词检索回看已有信息。
- 加载工作区上下文和 `SKILL.md`，处理上下文裁剪、摘要与后台子任务。
- 读取 `HEARTBEAT.md` 中的任务；按配置启用 cron 调度。网络搜索和研究工具需要 Tavily 凭据。

文件和命令工具以当前用户权限执行。工作目录用于定位文件和命令，不构成文件系统沙箱；应只向自己信任的用户和通道开放 Agent。

## 使用

需要 Bun；开发工具建议使用 Node.js 24 或更新版本。

```bash
git clone https://github.com/nocoo/deca.git
cd deca
bun install --frozen-lockfile
```

### 先运行 Echo 模式

以下命令只启用本机 HTTP 对话，不需要模型或 Discord 凭据：

```bash
ECHO_MODE=true DISCORD_TOKEN= TERMINAL=false HTTP_PORT=7014 HTTP_API_KEY=local-demo-key \
  bun run packages/gateway/cli.ts
```

在另一个终端请求：

```bash
curl http://127.0.0.1:7014/health

curl http://127.0.0.1:7014/chat \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: local-demo-key' \
  -d '{"senderId":"readme-demo","message":"hello"}'
```

Echo 模式回传输入，用来检查通道连接。HTTP 默认只监听 `127.0.0.1`，配置 `HTTP_API_KEY` 后请求需要 `X-API-Key`；`/health` 不需要鉴权。

### 接入模型和其他通道

环境变量入口是 `packages/gateway/cli.ts`。将真实凭据注入进程环境后启动：

```bash
HTTP_PORT=7014 bun run packages/gateway/cli.ts
```

| 配置 | 作用 |
| --- | --- |
| `ANTHROPIC_API_KEY` | 启用 Agent 模式；未设置时使用 Echo |
| `ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL` | 选择兼容服务和模型 |
| `HTTP_API_KEY` | 本机 HTTP 接口密钥 |
| `DISCORD_TOKEN` | 启用 Discord bot 通道 |
| `TERMINAL=true` | 启用终端 REPL |
| `WORKSPACE_DIR` | 文件工具和工作区上下文的目录 |
| `ENABLE_MEMORY`、`MEMORY_DIR` | 文件记忆开关与目录 |
| `ENABLE_CRON=true`、`CRON_STORAGE_PATH` | 定时任务开关与存储路径 |

切换到 Agent 模式时，确保没有保留 `ECHO_MODE=true`。默认会话目录为进程工作目录下的 `.deca/sessions/`，默认记忆目录为 `.deca/memory/`；固定启动目录便于持续使用同一份记录。

另一个入口 `bun run dev` 调用 `packages/gateway/serve.ts`，会自动读取用户目录中的配置和凭据。当前 provider resolver 接受 `glm` 和 `minimax`，读取对应 JSON 中的 `apiKey`、`baseUrl` 和 `models.default`，并按 `DECA_PROVIDER`、`config.activeProvider`、可用凭据顺序选择。它要求已配置 provider，并会接入发现的 Discord 配置。需要只用环境变量或运行 Echo 时，使用上面的 `cli.ts` 入口。

## 开发

```bash
bun run lint
bun run test:unit
```

项目直接用 Bun 运行 TypeScript。Gateway 是 Agent 与各通道的组装入口。

| 路径 | 内容 |
| --- | --- |
| `packages/agent/` | 模型调用、工具、会话、记忆、上下文、技能与定时任务 |
| `packages/gateway/` | 通道组装、调度、启动入口和单实例锁 |
| `packages/discord/` | Discord bot、消息与命令处理 |
| `packages/http/` | Hono HTTP 接口 |
| `packages/terminal/` | 终端 REPL |
| `packages/storage/` | JSON 配置与凭据、路径和 provider 选择 |

配置和凭据通常位于 `~/.deca/`；会话使用 JSONL，记忆索引使用 JSON。Shell、Claude Code 和可选服务的前置条件取决于启用的工具。

## 测试

运行各模块的单元测试：

```bash
bun run test:unit
```

不需要模型或 Discord 的本地集成测试：

```bash
bun run --cwd packages/storage test:e2e
bun run --cwd packages/http test:e2e
bun run --cwd packages/terminal test:e2e
```

它们分别验证临时文件存储、真实 HTTP 子进程和终端输入输出。

下面的测试会读取凭据，可能调用真实模型或向 Discord 测试频道发送消息，运行前应配置专门的测试账号、服务和频道：

```bash
bun run --cwd packages/agent test:e2e
bun run --cwd packages/discord test:e2e
bun run --cwd packages/gateway test:e2e
bun run --cwd packages/gateway test:behavioral
```

全量集成入口为 `bun run test:e2e`，其中也包含上述外部服务测试。行为测试验证模型的工具使用；单独通过 Echo 测试不能说明模型行为已验证。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| Bun、TypeScript | 本地运行环境与工作区 |
| Anthropic SDK | 模型对话和工具调用协议 |
| Hono | HTTP 通道 |
| discord.js | Discord 连接、消息与命令 |
| p-queue | Gateway 请求队列 |
| JSONL、JSON、Markdown | 会话、配置、记忆和工作区上下文 |
| Vitest、Bun test | 单元与集成测试 |

## 文档

- [架构设计背景](docs/01-architecture.md)
- [Agent 工具](docs/07-agent-tools.md)
- [会话设计](docs/09-session-design.md)
- [Heartbeat 说明](docs/08-heartbeat.md)
- [当前启动入口](packages/gateway/cli.ts)

## 许可证

[MIT](LICENSE)
