# Deca

Local personal Agent gateway joining Discord, terminal and HTTP channels with file and command tools.
Profile: cli-library.
Direction: [architecture](docs/01-architecture.md). Frameworks must preserve this handbook.

## Sources of Truth

This file is the quality contract; hooks, CI and config are enforcement. Close implementation gaps without lowering the contract. Historical test results are not evidence of a current passing run.

| Fact | Where |
|---|---|
| Human / module docs | [README.md](README.md), [AGENTS.md](AGENTS.md), [module boundaries](docs/02-modules.md) |
| Test / development procedures | [testing](docs/04-testing.md), [development](docs/03-development.md) |
| Packages / versions | `package.json` workspaces and `packages/*/package.json` |
| Enforcement | `.husky/pre-commit`, `.husky/pre-push`, package Vitest configs and CI |
| Accidents | [Retrospective.md](Retrospective.md) |
| Machine workflow | global `AGENTS.md` and Git rules |

## Project Invariants

- Gateway is the sole composition point. Channels never import Agent or each other; Agent may depend on Storage.
- Tools run with the current user's permissions; workspace paths are not a filesystem sandbox. Open channels only to trusted users.
- Preserve TDD, session persistence and channel isolation; exclude `references/` from ordinary project-code searches.
- Both Gateway entrypoints must acquire `~/.deca/run/gateway.lock`; spawned production children must not inherit test variables that bypass locking.
- `bun run dev` uses `serve.ts` and loads real provider/Discord configuration; use the explicit CLI Echo entrypoint for credential-free local checks.
- Keep credentials outside Git; behavioral tests can invoke real models, Discord and external tools and need explicit live-test scope.

## Stack / Layout

| Component | Path / choice |
|---|---|
| Composition | `packages/gateway`, Bun TypeScript |
| Agent / storage | `packages/agent`, `packages/storage`; JSONL and local files |
| Channels | `packages/discord`, `packages/http`, `packages/terminal` |
| Tooling | Bun workspaces, Vitest and Biome; root pins Bun 1.1.34 while CI selects 1.4.2 |

## Commands

Run from root with Bun and Node 24+ for development tooling. Install frozen dependencies. HTTP defaults to loopback; set `HTTP_API_KEY` for authenticated requests. `ANTHROPIC_API_KEY`, provider options, Discord and Tavily credentials are needed only for their live features.

```bash
bun install --frozen-lockfile
bun run lint
bun run test:unit
bun run test:coverage
bun --filter @deca/http test:e2e
ECHO_MODE=true DISCORD_TOKEN= TERMINAL=false HTTP_PORT=7014 bun run packages/gateway/cli.ts
bun --filter @deca/gateway test:behavioral  # authorized real-service testing only
```

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1 (test isolation). Status: `enforced`, `planned`, `manual`, or `N/A`; partial enforcement below does not certify the full required bar.
L1 requires statements, branches, functions and lines each ≥95%, with no skipped/focused tests; preserve any stricter package threshold. Native tools must identify unmeasured metrics as gaps.
G1 requires check-only strict analysis/formatting with zero errors/warnings. G2 requires dependency and secret scans, with missing required scanners failing.

| Dimension | Status | Required proof and current evidence/gap |
|---|---|---|
| L1 TypeScript | planned | Hook/CI run coverage. Agent branches currently require 94%; other package metrics are 95%, with gateway/lock/tool entry exclusions still requiring review. |
| L2 HTTP / storage | planned | HTTP runner spawns a local server; storage/integration runners exist. Full 100% API method coverage and a mandatory integration gate are not established. |
| L3 channel / Agent | manual | Echo and behavioral runners exist; Discord/LLM lanes use real external services and credentials. |
| G1 TypeScript | planned | Hooks/CI enforce Biome, but CI explicitly disables root typechecking and package lint coverage differs. |
| G2 | enforced | Shared base-ci quality workflow enables gitleaks and OSV by default; local hooks contain no security scan. |
| D1 | planned | HTTP spawner selects a test port; provider/Discord runners can load daily credentials and state. Per-run storage and destructive-operation guards need complete enforcement. |

Pre-commit runs working-tree lint and coverage; pre-push runs unit tests and lint, not the old documented E2E lane. CI uses shared quality checks with typechecking disabled. No bundler/build script exists: applications run directly with Bun.

Target hooks: pre-commit checks G1 + L1 against the index snapshot (`git checkout-index`) in <30s; pre-push checks L2 and G2 in parallel against every stdin push ref/commit in <3min, plus build where applicable. L3 runs in CI or an explicit manual lane.
Never bypass commit/push hooks, force-push, or use autofix in checks. Documentation changes do not authorize deploying or implementing new gates.

## Resources / Isolation

Keep tests separate from `.deca/sessions`, `.deca/memory` and `~/.deca` daily state. HTTP test ports are chosen in 40000–49999; development example port is 7014. Discord and behavioral tests may send messages, so do not run them for handbook normalization.

## Operations / Release

Follow [contributing](docs/05-contributing.md) and [behavioral testing](docs/09-behavioral-tests.md). Preserve per-package versions; no root release/deploy script exists. Process shutdown must target only the test-owned Gateway, never other active sessions.

## Retrospective

Move accident narratives to [Retrospective.md](Retrospective.md); keep at most about ten concise recurring project rules here. Put architecture and operational detail in linked docs.

- Wait for actual external-process completion before checking tool-created files.
- Keep Gateway singleton locks and child environment cleanup intact.
