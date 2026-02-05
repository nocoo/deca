# Deca

Local-first macOS control gateway for AI agents.

## Principles

- Bun runtime, TDD first
- Unit tests + lint required from day one
- Coverage target: 95%+
- Architecture favors testability and isolation
- Documentation updated alongside code changes
- Gateway is the single assembly point for agent + channels
- Channels are independent and don't depend on each other
- Local only: bind to 127.0.0.1 and require API key auth

## Structure

```
packages/
  agent/      - AI Agent core (tool execution, conversation management)
  storage/    - Persistence layer (SQLite)
  discord/    - Discord bot channel
  terminal/   - Terminal REPL channel
  http/       - HTTP API channel (Hono)
  gateway/    - Assembly layer (combines agent + channels)

docs/
  deca/       - Architecture and design documents
```

## Module Dependencies

```
gateway → discord, terminal, http, agent, storage  (single assembly point)
discord, terminal, http → (no dependencies, each is independent)
agent → storage
```

**Key rules:**
- Gateway is the only place that can combine agent + channels
- Channels cannot depend on @deca/agent
- Channels cannot depend on each other
- Each channel defines its own MessageHandler interface

## Quick Start

```bash
# Install dependencies
bun install

# Run gateway with echo mode (no API key required)
bun run dev

# Run gateway with agent (requires API key)
ANTHROPIC_API_KEY=xxx bun run dev

# Run individual channel standalone
cd packages/discord && DISCORD_TOKEN=xxx bun run standalone
cd packages/terminal && bun run standalone
cd packages/http && bun run standalone
```

## Development

```bash
# Run all tests
bun run test:unit

# Run lint
bun run lint

# Run specific package tests
bun --filter @deca/agent test:unit
bun --filter @deca/gateway test:unit
```

## Test Stats

| Package | Tests |
|---------|-------|
| @deca/agent | 319 |
| @deca/discord | 218 |
| @deca/terminal | 36 |
| @deca/http | 35 |
| @deca/storage | 29 |
| @deca/gateway | 14 |
| **Total** | **651** |
