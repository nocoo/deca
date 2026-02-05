# Gateway Refactoring Design

> Date: 2026-02-05
> Status: In Progress

## Overview

This document describes the architectural refactoring of Deca's Gateway system to achieve clear module boundaries, independent testability, and future extensibility.

## Background

### Problem Statement

The current architecture in `apps/api` mixes Discord integration with Gateway logic. This creates:
1. Tight coupling between components
2. Difficulty in testing modules independently
3. Risk of AI coding agents merging modules inappropriately
4. Challenges for future extraction of Agent to a separate process

### Reference: OpenClaw Architecture

We studied [OpenClaw](https://github.com/openclaw/openclaw) as a reference:
- **Same-process model**: Gateway and Agent run in the same process
- **Embedded Agent**: `runEmbeddedPiAgent()` is a function call, not RPC
- **Session persistence**: JSONL files on disk, state recovers after restart

**Key insight**: OpenClaw uses same-process for simplicity, but we need clearer module boundaries to:
1. Enable future process separation
2. Prevent accidental coupling by AI agents
3. Support independent testing and standalone operation

## Design Decisions

### Decision 1: Same-Process with Clear Boundaries

**Choice**: Same-process model (like OpenClaw), but with strict module boundaries

**Rationale**:
- Simpler implementation (no RPC layer)
- Lower latency (direct function calls)
- Module boundaries enforced by package structure and dependency rules

**Trade-off**: Future extraction to separate process requires adding RPC layer later

### Decision 2: Channels as Independent Packages

**Choice**: Each channel (Discord, Terminal, HTTP) is a separate package

**Rationale**:
- Each channel can be tested independently (90%+ coverage)
- Each channel can run standalone (Echo mode)
- Prevents cross-channel dependencies
- Clear ownership and responsibility

### Decision 3: Gateway as Assembly Layer

**Choice**: Gateway package is the ONLY place that imports all modules

**Rationale**:
- Single point of composition
- Channels define their own interfaces, Gateway adapts them
- Agent knows nothing about channels
- Clean dependency graph

### Decision 4: Channel Naming

| Package | Name | Rationale |
|---------|------|-----------|
| Discord | `@deca/discord` | Clear, specific |
| Terminal REPL | `@deca/terminal` | Avoids "CLI" confusion with command-line tools |
| HTTP API | `@deca/http` | Clear, specific |

### Decision 5: HTTP Framework

**Choice**: Hono

**Rationale**:
- Lightweight
- Bun-friendly
- TypeScript-first
- Good ecosystem

## Final Module Structure

```
packages/
├── agent/                    # AI Agent core
│   ├── src/
│   ├── cli.ts                # bun run agent:repl
│   └── package.json          # @deca/agent (depends: @deca/storage)
│
├── storage/                  # Persistence, credentials
│   ├── src/
│   └── package.json          # @deca/storage (depends: none)
│
├── discord/                  # Discord bot channel
│   ├── src/
│   │   ├── bot/              # Bot connection, reconnection
│   │   ├── handlers/         # Message handling, slash commands
│   │   ├── formatters/       # Message formatting
│   │   ├── types.ts          # DiscordMessageHandler interface
│   │   └── index.ts
│   ├── cli.ts                # bun run discord:standalone
│   └── package.json          # @deca/discord (depends: @deca/storage)
│
├── terminal/                 # Terminal REPL channel
│   ├── src/
│   │   ├── repl/             # REPL core
│   │   ├── types.ts          # TerminalMessageHandler interface
│   │   └── index.ts
│   ├── cli.ts                # bun run terminal:standalone
│   └── package.json          # @deca/terminal (depends: @deca/storage)
│
├── http/                     # HTTP API channel
│   ├── src/
│   │   ├── server/           # Hono server
│   │   ├── types.ts          # HttpMessageHandler interface
│   │   └── index.ts
│   ├── cli.ts                # bun run http:standalone
│   └── package.json          # @deca/http (depends: @deca/storage)
│
└── gateway/                  # Assembly layer
    ├── src/
    │   ├── dispatch/         # Message dispatch to Agent
    │   ├── adapters/         # Unified channel abstraction
    │   │   ├── types.ts      # GatewayChannel interface
    │   │   ├── discord.ts    # Discord -> GatewayChannel
    │   │   ├── terminal.ts   # Terminal -> GatewayChannel
    │   │   └── http.ts       # Http -> GatewayChannel
    │   └── index.ts
    ├── cli.ts                # bun run gateway:start
    └── package.json          # @deca/gateway (depends: all above)
```

## Dependency Rules

```
                    ┌─────────────┐
                    │   gateway   │  <- Only assembly point
                    └──────┬──────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │          │           │           │          │
    ▼          ▼           ▼           ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
│discord │ │terminal│ │  http  │ │ agent  │ │ storage │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └─────────┘
    │          │          │          │            ▲
    └──────────┴──────────┴──────────┴────────────┘
              (all depend on storage for credentials)
```

### Strict Rules

1. **NO cross-channel dependencies**: discord, terminal, http MUST NOT import each other
2. **NO channel→agent dependency**: Channels define their own MessageHandler interface
3. **NO agent→channel dependency**: Agent knows nothing about channels
4. **Channels can depend on storage**: For reading credentials only
5. **Gateway is the ONLY assembly point**: Only gateway imports agent + channels
6. **Gateway unifies channel interfaces**: Each channel has its own interface, gateway adapts them

## Testing Requirements

| Package | UT Coverage | Lint | E2E | Standalone |
|---------|-------------|------|-----|------------|
| @deca/storage | 90%+ | ✅ | - | - |
| @deca/agent | 90%+ | ✅ | ✅ | `agent:repl` |
| @deca/discord | 90%+ | ✅ | ✅ | `discord:standalone` |
| @deca/terminal | 90%+ | ✅ | ✅ | `terminal:standalone` |
| @deca/http | 90%+ | ✅ | ✅ | `http:standalone` |
| @deca/gateway | 90%+ | ✅ | ✅ | `gateway:start` |

## Implementation Plan

### Phase 1: Cleanup and Discord Migration
| Step | Commit | Status |
|------|--------|--------|
| 1.1 | `chore: remove apps/console` | ⬜ Pending |
| 1.2 | `refactor: create packages/discord skeleton` | ⬜ Pending |
| 1.3 | `refactor: move discord module to packages/discord` | ⬜ Pending |
| 1.4 | `feat: add discord standalone cli` | ⬜ Pending |

### Phase 2: Terminal Channel
| Step | Commit | Status |
|------|--------|--------|
| 2.1 | `feat: create packages/terminal skeleton` | ⬜ Pending |
| 2.2 | `feat: implement terminal repl core` | ⬜ Pending |
| 2.3 | `feat: add terminal standalone cli` | ⬜ Pending |

### Phase 3: HTTP Channel
| Step | Commit | Status |
|------|--------|--------|
| 3.1 | `feat: create packages/http skeleton` | ⬜ Pending |
| 3.2 | `feat: implement http server core` | ⬜ Pending |
| 3.3 | `feat: add http standalone cli` | ⬜ Pending |

### Phase 4: Gateway Assembly
| Step | Commit | Status |
|------|--------|--------|
| 4.1 | `feat: create packages/gateway skeleton` | ⬜ Pending |
| 4.2 | `feat: define gateway channel adapter interface` | ⬜ Pending |
| 4.3 | `feat: implement dispatch layer` | ⬜ Pending |
| 4.4 | `feat: implement channel adapters` | ⬜ Pending |
| 4.5 | `feat: implement gateway assembly` | ⬜ Pending |
| 4.6 | `feat: add gateway cli entry` | ⬜ Pending |

### Phase 5: Cleanup and Documentation
| Step | Commit | Status |
|------|--------|--------|
| 5.1 | `chore: delete apps/api` | ⬜ Pending |
| 5.2 | `docs: add module boundary rules to AGENTS.md` | ⬜ Pending |

## Key Interfaces

### Channel Message Handler Pattern

Each channel defines its own MessageHandler interface:

```typescript
// @deca/discord/src/types.ts
export interface DiscordMessageRequest {
  sessionKey: string;
  content: string;
  sender: { id: string; username: string; displayName?: string };
  channel: { id: string; type: ChannelType; guildId?: string };
  messageId: string;
}

export interface DiscordMessageResponse {
  text: string;
  success: boolean;
  error?: string;
}

export interface DiscordMessageHandler {
  handle(request: DiscordMessageRequest): Promise<DiscordMessageResponse>;
}
```

### Gateway Channel Adapter

Gateway unifies all channel interfaces:

```typescript
// @deca/gateway/src/adapters/types.ts
export type ChannelType = "discord" | "terminal" | "http";

export interface GatewayMessage {
  id: string;
  channel: ChannelType;
  sessionKey: string;
  content: string;
  sender: { id: string; name: string };
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface GatewayResponse {
  text: string;
  success: boolean;
  error?: string;
}

export interface GatewayChannel {
  readonly type: ChannelType;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: GatewayMessage) => Promise<GatewayResponse>): void;
}
```

### Dispatch Layer

```typescript
// @deca/gateway/src/dispatch/types.ts
export interface DispatchRequest {
  sessionKey: string;
  content: string;
  channel: ChannelType;
  sender: { id: string; name: string };
}

export interface DispatchResult {
  text: string;
  success: boolean;
  runId?: string;
  turns?: number;
  toolCalls?: number;
}

export interface Dispatcher {
  dispatch(request: DispatchRequest): Promise<DispatchResult>;
}
```

## Standalone Run Modes

Each channel can run independently in "Echo mode" without Agent:

```bash
# Discord (Echo mode - replies with "Echo: <message>")
bun run discord:standalone

# Terminal REPL (Echo mode)
bun run terminal:standalone

# HTTP Server (Echo mode)
bun run http:standalone

# Full system with Agent
bun run gateway:start
```

## Future Considerations

### Process Separation

If we need to separate Agent into its own process:

1. Add RPC layer (HTTP/WebSocket/IPC) to Agent
2. Gateway calls Agent via RPC instead of direct function call
3. Module boundaries remain unchanged
4. Only `@deca/gateway/src/dispatch/` needs modification

### Additional Channels

New channels follow the same pattern:
1. Create `packages/<channel-name>/`
2. Define own MessageHandler interface
3. Implement standalone Echo mode
4. Add adapter in `@deca/gateway/src/adapters/`

## Changelog

- 2026-02-05: Initial design document created
