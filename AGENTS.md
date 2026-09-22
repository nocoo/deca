# Deca

Local-first macOS agent gateway joining Discord, terminal and HTTP channels with file and command tools.
Human overview: [README.md](README.md). Architecture: [docs/01-architecture.md](docs/01-architecture.md). Profile: cli-library.

## Scope and instruction sources

- This file applies throughout the repository. Nested instruction files keep their own purpose.
- `workspace/AGENTS.md` is the runtime workspace personality loaded into agent sessions. `docs/prompts/openclaw/AGENTS.md` is a prompt template. Preserve both; do not impose this root template on them.
- `docs/modules/agent.md` is module documentation, not a root loading alias.
- Maintain this file as the only root handbook. Do not recreate `CLAUDE.md`, a symlink, an import or a compatibility alias.
- `references/openclaw` and `references/openclaw-mini` are upstream reference submodules. Exclude `references/` from ordinary project-code searches.
- Source of truth: root and `packages/*/package.json`, Vitest configs, `biome.json`, `.husky/` and `.github/workflows/ci.yml`. Record drift rather than lowering the contract.
- [docs/03-development.md](docs/03-development.md) still describes `bun run dev` as Echo-only. [docs/04-testing.md](docs/04-testing.md) still uses historical four-layer names, a 90% coverage table and a pre-push E2E claim. Follow this file and the manifests for those facts. Module map: [docs/02-modules.md](docs/02-modules.md).

## Setup and commands

Run from the repository root. Requires Bun (`packageManager` `bun@1.1.34`; CI selects Bun `1.4.2`) and Node.js 24+ for development tooling. Install frozen dependencies. Keep credential values out of Git. Variable names: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `DECA_PROVIDER`, `HTTP_API_KEY`, `HTTP_PORT`, `DISCORD_TOKEN`, `TERMINAL`, `WORKSPACE_DIR`, `ENABLE_MEMORY`, `MEMORY_DIR`, `ENABLE_CRON`, `CRON_STORAGE_PATH`, `ECHO_MODE`, `TAVILY_API_KEY`.

`bun run dev` and `bun run gateway` run `packages/gateway/serve.ts`. That entry loads provider, Discord and Tavily configuration from `~/.deca/` and requires a configured provider. Credential-free HTTP Echo uses `packages/gateway/cli.ts`. HTTP listens on loopback. `/health` needs no key; other routes need `X-API-Key` when `HTTP_API_KEY` is set. Example development port is `7014`.

```sh
bun install --frozen-lockfile
ECHO_MODE=true DISCORD_TOKEN= TERMINAL=false HTTP_PORT=7014 HTTP_API_KEY=local-demo-key bun run packages/gateway/cli.ts
bun run lint
bun run test:unit
bun run test:coverage
```

There is no bundler or root build script. TypeScript runs directly under Bun. `format` scripts can write files; they are not check gates.

Safe local integration, without a model or Discord:

```sh
bun run --cwd packages/storage test:e2e
bun run --cwd packages/http test:e2e
bun run --cwd packages/terminal test:e2e
```

The following live-service commands read `~/.deca` credentials and can call a real model or post to a Discord test channel. They need explicit live-test authorization and are out of scope for a handbook edit: root `bun run test:e2e`, root `bun run test:all`, `packages/agent` e2e, `packages/discord` e2e (`test:e2e` passes `--core`; `test:e2e:full` is the full runner), `packages/gateway` e2e, and every `test:behavioral*` script. `bun --filter @deca/gateway test:behavioral` runs only `behavioral-tests/tools.test.ts`. [docs/09-behavioral-tests.md](docs/09-behavioral-tests.md) describes a broader suite than that script.

## Project boundaries

- Gateway is the only composition point. Channels never import `@deca/agent` or each other. Agent may depend on Storage.
- Tools run with the current user's permissions. A workspace path is not a filesystem sandbox. Open channels only to trusted users.
- Preserve TDD, session persistence and channel isolation.
- Both Gateway entrypoints, `cli.ts` and `serve.ts`, must acquire `~/.deca/run/gateway.lock`. `acquireGatewayLock` returns null when `VITEST` or `NODE_ENV=test` is set, unless `forceAcquire` is passed. Spawned production children must not inherit those variables. The Discord E2E spawner strips them.
- Wait for an external process to finish before asserting files it creates. Shut down only the test-owned Gateway.
- Preserve per-package versions. No root release or deploy script exists. Contribution procedure: [docs/05-contributing.md](docs/05-contributing.md).
- Biome uses the recommended ruleset and two-space indent. Package lint scripts pass `--error-on-warnings`.

## Testing and quality contract

Run the checks relevant to the change. Hook and CI requirements still apply. Unit commands use in-package Vitest.

Historical names in [docs/04-testing.md](docs/04-testing.md) are an older scheme: unit `bun run test:unit`, lint `bun run lint`, Echo E2E `bun run test:e2e`, behavioral `bun --filter @deca/gateway test:behavioral`. They do not replace the dimensions below.

Statuses: `enforced`, `planned`, `manual`, `N/A`. A partial check does not certify the full requirement.

| Dimension | Required contract | Current status and evidence |
| --- | --- | --- |
| L1 — pre-commit quality | UT with statements, branches, functions and lines each ≥95%; strict types and check-only lint with zero errors/warnings; installed hook on the index snapshot; failure rejection; under 30s. No skipped or focused tests. | planned. Vitest thresholds are 95/95/95/95 except `@deca/agent` branches at 94. Coverage includes `src/**/*.ts` and excludes tests, `src/e2e/**`, `src/index.ts`, agent `src/tools/coding-agent/claude-code.ts`, and gateway `src/gateway.ts` plus `src/lock.ts`. Those exclusions are by design. HTTP uses Istanbul; other packages use v8. `bun run test:coverage` is `bun --filter '@deca/*' test --coverage`. `skills/eval` is outside that filter. Root `tsconfig.json` has `strict: true`; http and terminal extend it. No root `typecheck` script exists. CI sets `typecheck: false` with reason `no root typecheck script; workspace packages have standalone checks`. Lint is package Biome with `--error-on-warnings`: agent and storage use `biome check`; discord, http, terminal and gateway use `biome lint` (gateway also lints `behavioral-tests`). `core.hooksPath` is `.husky/_`; `prepare` runs `husky`. Pre-commit runs working-tree `bun run lint` then `bun run test:coverage`. Snapshot isolation, rejection and the 30s target are unverified. A name search found no `test.skip` or `it.only` in `packages/`; that search is not an L1 grade. |
| L2 — integration | Real local HTTP for owned endpoints, plus applicable process and storage integration | planned. HTTP and gateway spawners start a local process on a port in 40000–49999. Storage and terminal e2e runners exist. CI leaves the quality workflow `l2` input off. Full endpoint/method coverage is not established. |
| L3 — system | Critical channel and agent journeys | manual. Echo runners and behavioral scripts exist. Discord and LLM lanes use real external services. CI leaves `l3` off. |
| G2 — security | Dependency and secret scans; a missing required scanner fails | planned. CI calls `nocoo/base-ci` quality workflow `ad43150de3a2be2fa464b5cd2f921dc4fa9f8f0f` with `security` at its default true. That workflow runs pinned gitleaks and osv-scanner and fails if `bun.lock` is missing. `skills/eval/bun.lock` is outside the default lockfile input. Local hooks do not scan. |
| D1 — isolation | Test state separate from production and daily development; guards before destructive fixture operations | planned. Unit tests are local. HTTP e2e chooses a test port. Discord e2e reads `~/.deca/credentials/discord.json` and can post to a daily test channel. Gateway spawn can inherit `process.env`. Sessions, memory and the lock live under `.deca/` and `~/.deca/`. No SQLite database is used, so a SQLite marker is N/A. File and process isolation still apply and are not fully guarded. |

Current hooks: pre-commit checks the working tree with lint and coverage; pre-push runs `bun run test:unit && bun run lint`. CI on push and pull request to `main` uses the shared quality workflow with Bun `1.4.2`, `install-policy: blocked`, and `test-command: bun run test:coverage`. Build, L2 and L3 inputs stay off.

The owner merged former G1 into L1 on 2026-09-21. The framework keeps the 6DQ name: L1, L2, L3, G2 and D1. Use `system0-6dq-l1` for the L1 contract and its S/A/B/F rubric. This file assigns no L1 grade.

Target: pre-commit checks the index snapshot for unified L1 in under 30s; pre-push checks stdin push refs for L2 and G2 in parallel in under 3 minutes. Build is N/A because there is no bundler. Those hook targets are not implemented. Keep gates check-only. Do not bypass hooks or use autofix in checks.

## Resources and operational safety

| Purpose | Target / state | Boundary |
| --- | --- | --- |
| Development | `serve.ts` on loopback, example port 7014, state under `~/.deca/` | Loads real provider and Discord configuration. Echo checks use `cli.ts` with `ECHO_MODE=true` and an empty `DISCORD_TOKEN`. |
| Tests | In-package Vitest; HTTP and gateway e2e ports 40000–49999 | Keep tests away from `.deca/sessions`, `.deca/memory` and daily `~/.deca` state. Discord and behavioral lanes need explicit live-test scope. |
| Production | Local process; no deploy script | Credentials and session files stay on the operator machine. |

Deployment, release, imports and destructive resets require authorization for that operation. Operational detail: [docs/05-contributing.md](docs/05-contributing.md) and [docs/09-behavioral-tests.md](docs/09-behavioral-tests.md).

## Completion and documentation

- Stage explicit paths. Keep one logical change per commit. Preserve package versions.
- Update the human overview when behavior changes. README stays the overview; module detail stays in `docs/`.
- Report commands actually run. Inspected configuration is not a passing test.
- Accident narratives stay in [Retrospective.md](Retrospective.md). The boundaries above are the recurring project rules. Cross-project lessons go to global rules; deterministic checks belong in hooks and tests.
