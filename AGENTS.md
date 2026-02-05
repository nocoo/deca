# AI Agent Instructions

This file contains instructions for AI coding agents working on this codebase.

## Project Overview

Deca is a local-first macOS control gateway for AI agents. It uses Bun runtime and follows TDD practices.

## Module Structure

```
packages/
  agent/      - AI Agent core (tool execution, conversation management)
  storage/    - Persistence layer (SQLite)
  discord/    - Discord bot channel
  terminal/   - Terminal REPL channel
  http/       - HTTP API channel (Hono)
  gateway/    - Assembly layer (combines agent + channels)
```

## Critical Dependency Rules

### Gateway is the Single Assembly Point

```
gateway → discord, terminal, http, agent, storage
```

The `packages/gateway` is the ONLY place that can:
- Import `@deca/agent`
- Import multiple channels together
- Create the bridge between channels and agent

### Channels are Independent

```
discord  → (no package dependencies)
terminal → (no package dependencies)
http     → (no package dependencies)
```

Channels:
- CANNOT import `@deca/agent` - this would create tight coupling
- CANNOT import other channels - they must remain independent
- MUST define their own `MessageHandler` interface
- CAN be run standalone with an echo handler for testing

### Agent depends on Storage

```
agent → storage
```

The agent package is the core intelligence layer and only depends on storage for persistence.

## Adding a New Channel

1. Create `packages/<channel>/` with its own `package.json`
2. Define a `MessageHandler` type in `src/types.ts`:
   ```typescript
   export type MessageHandler = (message: string, context: SomeContext) => Promise<string>;
   ```
3. Implement the channel entry point that accepts a `MessageHandler`
4. Create a standalone CLI with echo handler for testing
5. Add bridge in `packages/gateway/src/adapter.ts`
6. Export from gateway

## Testing Philosophy

- Every module must have unit tests
- Use `bun test` for running tests
- Target 95%+ coverage
- Run `bun run test:unit` from root to test all packages
- Run `bun run lint` before committing

## Commands

```bash
# Development
bun install           # Install dependencies
bun run dev           # Start development servers

# Testing
bun run test:unit     # Run all unit tests
bun run lint          # Run linter

# Package-specific
bun --filter @deca/agent test:unit
bun --filter @deca/gateway test:unit
```

## Code Style

- Use Biome for formatting and linting
- Prefer functional patterns over classes where appropriate
- Export types explicitly
- Use barrel exports (`index.ts`) for public APIs

## Git Conventions

Follow Conventional Commits:
- `fix:` - Bug fixes
- `feat:` - New features
- `refactor:` - Code restructuring
- `docs:` - Documentation updates
- `test:` - Test additions/fixes
- `chore:` - Maintenance tasks

Commit frequently with atomic changes. Each commit should be self-contained and pass all tests.
