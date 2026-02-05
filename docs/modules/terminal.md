# @deca/terminal

Terminal REPL channel - provides command-line interactive interface.

## Architecture

```
packages/terminal/src/
├── repl.ts             # REPL core (readline-based)
├── session.ts          # Session key management
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
| `repl.ts` | Read user input, display streaming output |
| `session.ts` | Generate/manage session key |
| `echo-handler.ts` | Echo handler for testing |

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/terminal test:unit
```

### Run E2E Tests

```bash
bun --filter @deca/terminal test:e2e
```

### E2E Architecture

```
spawner.ts → launches cli.ts as subprocess
runner.ts  → writes to stdin
           → reads stdout
           → verifies response
```

Tests run with `--non-interactive` flag to disable readline.

### Standalone Mode

```bash
cd packages/terminal
bun run standalone
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/terminal test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |
| E2E Tests | Pass before merge | `bun --filter @deca/terminal test:e2e` |

### Current Stats

- **Unit Tests**: 36
- **E2E Tests**: 6

## Usage

```typescript
import { createTerminalChannel } from '@deca/terminal';

const channel = createTerminalChannel({
  prompt: 'deca> ',
});

await channel.start(async (content, context) => {
  return `Echo: ${content}`;
});
```
