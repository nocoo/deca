# Modules Overview

> Index of Deca modules - click links for detailed documentation

## Module Summary

| Module | Package | Description | Tests | Docs |
|--------|---------|-------------|-------|------|
| Agent | @deca/agent | AI Agent core (LLM, tools, sessions) | 319 + 2 E2E | [agent.md](modules/agent.md) |
| Storage | @deca/storage | Persistence layer (credentials, paths) | 29 | [storage.md](modules/storage.md) |
| Discord | @deca/discord | Discord bot channel | 218 + 6 E2E | [discord.md](modules/discord.md) |
| Terminal | @deca/terminal | Terminal REPL channel | 36 + 6 E2E | [terminal.md](modules/terminal.md) |
| HTTP | @deca/http | HTTP API channel (Hono) | 35 + 9 E2E | [http.md](modules/http.md) |
| Gateway | @deca/gateway | Assembly layer | 14 + 4 E2E | [gateway.md](modules/gateway.md) |

**Total**: 651 unit tests + 27 E2E tests

## Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                    @deca/gateway                     │  Assembly
├──────────┬──────────┬──────────┬────────────────────┤
│ Discord  │ Terminal │   HTTP   │                    │  Channels
├──────────┴──────────┴──────────┼────────────────────┤
│                                │    @deca/agent     │  Core
├────────────────────────────────┴────────────────────┤
│                   @deca/storage                      │  Persistence
└─────────────────────────────────────────────────────┘
```

## Quality Principles

All modules must adhere to:

1. **Atomic Commits** - One logical change per commit
2. **UT Coverage > 90%** - Comprehensive unit test coverage
3. **Lint Clean** - Zero Biome errors/warnings
4. **E2E Tests** - Subprocess + real request verification

## Quick Links

- [System Architecture](01-architecture.md)
- [Development Guide](03-development.md)
- [Testing Standards](04-testing.md)
- [Contributing Guide](05-contributing.md)
