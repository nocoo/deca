# @deca/discord

Discord bot channel - handles Discord message receiving and sending.

## Architecture

```
packages/discord/src/
├── client.ts           # Discord client wrapper
├── gateway.ts          # Discord Gateway WebSocket
├── listener.ts         # Message listener
├── sender.ts           # Message sender (chunking support)
├── session.ts          # Session key derivation
├── allowlist.ts        # Channel/user allowlist
├── debounce.ts         # Message debouncing
├── chunk.ts            # Long message chunking
├── reaction.ts         # Reaction handling
├── reconnect.ts        # Auto-reconnect logic
├── graceful-shutdown.ts
├── slash-commands.ts   # Slash command registration
├── echo-handler.ts     # Echo handler for testing
├── e2e/                # E2E test infrastructure
│   ├── spawner.ts      # Subprocess launcher
│   ├── runner.ts       # Test runner
│   ├── webhook.ts      # Webhook sender
│   └── fetcher.ts      # Message fetcher
└── index.ts
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `gateway.ts` | WebSocket connection to Discord |
| `listener.ts` | Parse MESSAGE_CREATE events |
| `sender.ts` | Send messages with chunking |
| `session.ts` | Generate session key from channel/user |
| `debounce.ts` | Aggregate rapid messages |
| `allowlist.ts` | Filter allowed channels/users |

## Development & Testing

### Run Unit Tests

```bash
bun --filter @deca/discord test:unit
```

### Run E2E Tests

```bash
bun --filter @deca/discord test:e2e
```

E2E tests use real Discord Webhook to send messages to a test channel.

### E2E Architecture

```
spawner.ts → launches cli.ts as subprocess
           → subprocess connects to Discord
runner.ts  → sends Webhook message
           → verifies bot response via REST API
```

**Credentials**: `~/.deca/credentials/discord.json`

### Standalone Mode

```bash
cd packages/discord
DISCORD_TOKEN=xxx bun run standalone
```

### Quality Gates

| Principle | Requirement | Command |
|-----------|-------------|---------|
| Atomic Commits | Single logical change per commit | - |
| UT Coverage | > 90% | `bun --filter @deca/discord test:unit` |
| Lint Clean | No errors/warnings | `bun run lint` |
| E2E Tests | Pass before merge | `bun --filter @deca/discord test:e2e` |

### Current Stats

- **Unit Tests**: 218
- **E2E Tests**: 6

## Usage

```typescript
import { createDiscordChannel } from '@deca/discord';

const channel = createDiscordChannel({
  token: process.env.DISCORD_TOKEN,
  allowBots: false,
  debounceMs: 500,
});

await channel.start(async (content, context) => {
  // Handle message, return response
  return `Echo: ${content}`;
});
```
