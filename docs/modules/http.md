# @deca/http

HTTP API channel - provides REST API based on Hono framework.

## Architecture

```
packages/http/src/
├── server.ts           # Hono app & routes
├── session.ts          # Session key derivation
├── echo-handler.ts     # Echo handler for testing
├── types.ts            # Type definitions
├── e2e/                # E2E test infrastructure
│   ├── spawner.ts      # Subprocess launcher
│   └── runner.ts       # Test runner
└── index.ts
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `server.ts` | HTTP server with Hono |
| `session.ts` | Generate session key from request |
| `echo-handler.ts` | Echo handler for testing |

### API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health` | Health check | No |
| POST | `/message` | Send message | `x-api-key` header |
| POST | `/chat` | Chat (streaming) | `x-api-key` header |

### Request/Response

```bash
# Health check
curl http://localhost:3000/health

# Send message
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"content": "Hello"}'
```

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/http test:unit
```

### Run E2E Tests

```bash
bun --filter @deca/http test:e2e
```

### E2E Architecture

```
spawner.ts → launches cli.ts as subprocess (port 3456)
runner.ts  → sends HTTP requests via fetch
           → verifies response body/status
```

### Standalone Mode

```bash
cd packages/http
bun run standalone
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/http test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |
| E2E Tests | Pass before merge | `bun --filter @deca/http test:e2e` |

### Current Stats

- **Unit Tests**: 35
- **E2E Tests**: 9

## Usage

```typescript
import { createHttpChannel } from '@deca/http';

const channel = createHttpChannel({
  port: 3000,
  apiKey: process.env.DECA_API_KEY,
});

await channel.start(async (content, context) => {
  return `Echo: ${content}`;
});
```
