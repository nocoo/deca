# @deca/storage

Persistence layer - provides credential management and path utilities.

## Architecture

```
packages/storage/src/
├── config.ts        # Configuration management
├── credentials.ts   # Credential storage (~/.deca/credentials/)
├── paths.ts         # Path utilities for Deca data directory
├── types.ts         # Type definitions
└── index.ts
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `credentials.ts` | Read/write credentials (Discord token, API keys) |
| `config.ts` | Load/save configuration files |
| `paths.ts` | Resolve paths under `~/.deca/` |

### Data Layout

```
~/.deca/
├── credentials/
│   ├── discord.json    # { "botToken", "botApplicationId", "servers": { ... } }
│   └── anthropic.json  # { "apiKey": "..." }
├── config.json         # Global configuration
└── sessions/           # Session persistence (future)
```

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/storage test:unit
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/storage test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |

### Current Stats

- **Unit Tests**: 29
- **E2E Tests**: N/A (pure library, no runtime)

## Usage

```typescript
import { loadCredential, getDecaPath } from '@deca/storage';

// Load Discord token
const discord = await loadCredential('discord');
console.log(discord.token);

// Get path
const sessionsDir = getDecaPath('sessions');
```
