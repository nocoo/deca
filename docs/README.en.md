<p align="center">
  <img src="../assets/brand/icon-rounded.png" width="128" height="128" alt="Deca logo" />
</p>
<h1 align="center">Deca</h1>
<p align="center">Talk through Discord, a terminal, or local HTTP to a personal agent with file and command tools.</p>
<p align="center"><a href="../README.md">简体中文</a></p>

## What it does

Deca is a personal agent system that runs locally, primarily developed and used on macOS. Its Gateway connects the conversation core to Discord, a terminal REPL, and HTTP. A model handles requests and can call file, shell, and other tools as needed.

Sessions and configuration are stored in local files. Model requests, Discord messages, and optional web searches use their respective external services. The project is intended for a local workflow you configure and manage yourself.

## Features

- Chat through Discord, a terminal, or HTTP, with a Gateway queue handling requests from the different channels.
- Call models through the Anthropic SDK, with configurable compatible API addresses and model names.
- Read, write, edit, list, and search files; execute shell commands; optionally call an installed Claude Code CLI.
- Save conversations as JSONL and restore context by session key, with file-based memory and keyword retrieval.
- Load workspace context and `SKILL.md` files, prune and summarize context, and run background subtasks.
- Read tasks from `HEARTBEAT.md` and enable cron scheduling through configuration. Web search and research tools require Tavily credentials.

File and command tools run with the current user's permissions. The working directory locates files and commands; it is not a filesystem sandbox. Restrict agent access to users and channels you trust.

## Usage

Bun is required. Node.js 24 or newer is recommended for development tools.

```bash
git clone https://github.com/nocoo/deca.git
cd deca
bun install --frozen-lockfile
```

### Start with Echo mode

This command enables local HTTP chat without model or Discord credentials:

```bash
ECHO_MODE=true DISCORD_TOKEN= TERMINAL=false HTTP_PORT=7014 HTTP_API_KEY=local-demo-key \
  bun run packages/gateway/cli.ts
```

Send requests from another terminal:

```bash
curl http://127.0.0.1:7014/health

curl http://127.0.0.1:7014/chat \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: local-demo-key' \
  -d '{"senderId":"readme-demo","message":"hello"}'
```

Echo mode returns the input so you can check the channel connection. HTTP listens on `127.0.0.1` by default. When `HTTP_API_KEY` is configured, requests need `X-API-Key`; `/health` remains unauthenticated.

### Connect a model and other channels

The environment-driven entry point is `packages/gateway/cli.ts`. Supply real credentials in the process environment, then start it:

```bash
HTTP_PORT=7014 bun run packages/gateway/cli.ts
```

| Setting | Role |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enable Agent mode; without it, the entry point uses Echo |
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Select a compatible service and model |
| `HTTP_API_KEY` | Protect the local HTTP API |
| `DISCORD_TOKEN` | Enable the Discord bot channel |
| `TERMINAL=true` | Enable the terminal REPL |
| `WORKSPACE_DIR` | Directory for file tools and workspace context |
| `ENABLE_MEMORY`, `MEMORY_DIR` | File memory switch and directory |
| `ENABLE_CRON=true`, `CRON_STORAGE_PATH` | Scheduled task switch and storage path |

Remove any retained `ECHO_MODE=true` setting when switching to Agent mode. Sessions default to `.deca/sessions/` under the process working directory, and memory defaults to `.deca/memory/`. Use a consistent startup directory to keep using the same records.

The separate `bun run dev` entry point runs `packages/gateway/serve.ts` and loads configuration and credentials from the user directory. Its current provider resolver accepts `glm` and `minimax`, reading `apiKey`, `baseUrl`, and `models.default` from their JSON files. It selects a provider by `DECA_PROVIDER`, then `config.activeProvider`, then available credentials. This entry point requires a configured provider and connects any discovered Discord configuration. Use `cli.ts` above for environment-only configuration or Echo mode.

## Development

```bash
bun run lint
bun run test:unit
```

The project runs TypeScript directly with Bun. Gateway is the assembly point for the agent and channels.

| Path | Contents |
| --- | --- |
| `packages/agent/` | Model calls, tools, sessions, memory, context, skills, and scheduled tasks |
| `packages/gateway/` | Channel assembly, dispatch, entry points, and single-instance lock |
| `packages/discord/` | Discord bot, messages, and commands |
| `packages/http/` | Hono HTTP API |
| `packages/terminal/` | Terminal REPL |
| `packages/storage/` | JSON configuration and credentials, paths, and provider selection |

Configuration and credentials usually live under `~/.deca/`. Sessions use JSONL, and the memory index uses JSON. Shell tools, Claude Code, and optional services have their own prerequisites depending on what you enable.

## Tests

Run unit tests across the modules:

```bash
bun run test:unit
```

Local integration tests that do not need a model or Discord:

```bash
bun run --cwd packages/storage test:e2e
bun run --cwd packages/http test:e2e
bun run --cwd packages/terminal test:e2e
```

These check temporary file storage, a real HTTP subprocess, and terminal input and output respectively.

The following tests load credentials and may call real models or send messages to a Discord test channel. Configure dedicated test accounts, services, and channels before running them:

```bash
bun run --cwd packages/agent test:e2e
bun run --cwd packages/discord test:e2e
bun run --cwd packages/gateway test:e2e
bun run --cwd packages/gateway test:behavioral
```

The full integration entry point is `bun run test:e2e`, which includes those external-service tests. Behavioral tests check model tool use; passing Echo tests alone does not verify model behavior.

## Stack

| Technology | Role |
| --- | --- |
| Bun, TypeScript | Local runtime and workspaces |
| Anthropic SDK | Model conversations and tool-call protocol |
| Hono | HTTP channel |
| discord.js | Discord connection, messages, and commands |
| p-queue | Gateway request queue |
| JSONL, JSON, Markdown | Sessions, configuration, memory, and workspace context |
| Vitest, Bun test | Unit and integration tests |

## Documentation

- [Architecture background](01-architecture.md)
- [Agent tools](07-agent-tools.md)
- [Session design](09-session-design.md)
- [Heartbeat](08-heartbeat.md)
- [Current environment entry point](../packages/gateway/cli.ts)

## License

[MIT](../LICENSE)
