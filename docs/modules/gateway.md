# @deca/gateway

Assembly layer - combines Agent with Channels into a unified runtime.

## Architecture

```
packages/gateway/src/
├── gateway.ts          # Gateway orchestrator
├── adapter.ts          # Agent adapter (bridges Channel → Agent)
├── types.ts            # Type definitions
├── e2e/                # E2E test infrastructure
│   └── runner.ts       # Test runner
└── index.ts
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `gateway.ts` | Start/stop channels, lifecycle management |
| `adapter.ts` | Create message handler that routes to Agent |

### Flow

```
Channel receives message
       ↓
Gateway routes to Adapter
       ↓
Adapter calls Agent.run()
       ↓
Agent executes (LLM + tools)
       ↓
Response sent back via Channel
```

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/gateway test:unit
```

### Run E2E Tests

```bash
bun --filter @deca/gateway test:e2e
```

### Standalone Mode

```bash
cd packages/gateway

# Echo mode (no API key needed)
bun run start

# Agent mode
ANTHROPIC_API_KEY=xxx bun run start
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/gateway test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |
| E2E Tests | Pass before merge | `bun --filter @deca/gateway test:e2e` |

### Current Stats

- **Unit Tests**: 14
- **E2E Tests**: 4

## Usage

```typescript
import { createGateway, createEchoGateway } from '@deca/gateway';

// Echo mode (for testing)
const gateway = createEchoGateway();
await gateway.start();

// Full mode with Agent
const gateway = createGateway({
  agent: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
  },
  terminal: {
    enabled: true,
  },
  http: {
    port: 3000,
  },
});

await gateway.start();
```
