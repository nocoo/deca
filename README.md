# Deca

Local-first macOS control gateway for AI agents.

## Principles

- Bun runtime, TDD first
- Unit tests + lint required from day one
- Coverage target: 95%+
- Architecture favors testability and isolation
- Documentation updated alongside code changes
- Three-layer design: HTTP (Elysia) → Router → Executors
- Providers and executors are independent and testable
- Local only: bind to 127.0.0.1 and require `sk-` auth key
- HTTP APIs are atomic, orthogonal, and designed read-first
- Console is a first-class debug UI (React + Vite + shadcn/ui, MVVM)

## Structure

- `apps/api`: Elysia HTTP service
- `apps/console`: Debug Console UI
- `docs/deca`: Architecture and plan

## Local Auth

- Header: `x-deca-key`
- Key stored in ignored file: `config/secret.local.json`

## Local Domains

- API: `https://deca.dev.hexly.ai` (Caddy -> 127.0.0.1:7010)
- Console: `https://deca-console.dev.hexly.ai` (Caddy -> 127.0.0.1:7011)

## Dev

```bash
bun install
bun run dev
```

## Test & Lint

```bash
bun run test
bun run lint
```
