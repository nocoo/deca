# @deca/agent

AI Agent core module - manages conversation, tool execution, and session context.

## Architecture

```
packages/agent/src/
├── core/           # Core agent loop & session management
├── context/        # Context window management (tokens, pruning, compaction)
├── heartbeat/      # Scheduled task (HEARTBEAT.md) execution
├── tools/          # Tool interface & built-in tools
├── e2e/            # E2E tests
└── index.ts
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `agent.ts` | Main agent loop - message → LLM → tool calls → response |
| `session.ts` | Session state management |
| `memory.ts` | In-memory session cache (LRU) |
| `context/` | Token counting, context pruning, compaction |
| `heartbeat/` | Parse HEARTBEAT.md, schedule periodic tasks |
| `tools/` | Tool registry, built-in tools (file, shell, etc.) |

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/agent test:unit
```

### Run E2E Tests

```bash
bun --filter @deca/agent test:e2e
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/agent test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |
| E2E Tests | Pass before merge | `bun --filter @deca/agent test:e2e` |

### Current Stats

- **Unit Tests**: 319
- **E2E Tests**: 2 (agent.e2e.test.ts, heartbeat.e2e.test.ts)

## Usage

```typescript
import { createAgent } from '@deca/agent';

const agent = createAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',
  tools: [...],
});

const result = await agent.run('session-123', 'Hello', {
  onTextDelta: (delta) => process.stdout.write(delta),
});
```
