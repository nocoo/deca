# Scheduled Dispatch Unification Plan

> Unify the post-Dispatcher result handling for Heartbeat and Cron, so Cron results are actually delivered to users.

## Problem

Heartbeat and Cron share the same Dispatcher but have asymmetric post-dispatch behavior:

| | Heartbeat | Cron |
|---|---|---|
| Instruction builder | `buildHeartbeatInstruction()` — pure function | Inline string in `gateway.ts:151` |
| Noise suppression | `stripHeartbeatToken()` | None |
| Result delivery | `sendHeartbeatResult()` → Discord channel/DM | **Result discarded** |
| Error handling | `onError` callback | `console.error` |
| Testability | Pure functions, full UT coverage | Inline closure, untestable |

**Critical bug**: Cron job results are silently discarded. `gateway.ts:152` calls `await cronDispatcher.dispatch(...)` but ignores the return value. Users set scheduled tasks, Agent executes them, but the response goes nowhere.

## Design

**Do NOT merge HeartbeatManager and CronService** — their scheduling models are different (single interval timer vs per-job timers). Only unify the post-Dispatcher pipeline:

```
Before (asymmetric):

  Heartbeat → buildInstruction → dispatch → stripToken → sendResult ✅
  Cron      → inline string    → dispatch → (discard)              ❌

After (unified):

  Heartbeat → buildHeartbeatInstruction → dispatch → stripToken → sendResult ✅
  Cron      → buildCronInstruction      → dispatch → sendResult             ✅
              ↑ extracted pure function               ↑ no HEARTBEAT_OK needed
```

### Key differences preserved

| | Heartbeat Callback | Cron Callback |
|---|---|---|
| Instruction | `[HEARTBEAT: reason] Execute pending tasks: ...` | `[CRON TASK: jobName] instruction` |
| HEARTBEAT_OK | Yes — can suppress noise | **No** — always deliver results |
| Session key | `"main"` | `"cron"` |
| Dispatch source | `"heartbeat"` | `"cron"` |

## Steps

### Step 1: refactor: rename heartbeat.ts → scheduled.ts

**Status**: [x] done (commit `ca9ff2a`)
- Rename `packages/gateway/src/heartbeat.test.ts` → `packages/gateway/src/scheduled.test.ts`
- Update all imports in `gateway.ts`, test files, etc.
- No logic changes — pure rename

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 2: feat: extract createCronCallback + buildCronInstruction

**Status**: [x] done (commit `b60b0a8`)

**Changes**:
- `packages/gateway/src/scheduled.ts` — Add:
  - `buildCronInstruction(job: CronJob): string` — pure function
  - `createCronCallback(deps: ScheduledCallbackDeps)` — dispatch + deliver + error handling, no HEARTBEAT_OK stripping

**Tests**:
- `packages/gateway/src/scheduled.test.ts` — Add:
  - `buildCronInstruction` format tests
  - `createCronCallback` dispatch + delivery tests
  - `createCronCallback` error handling tests
  - `createCronCallback` does NOT strip HEARTBEAT_OK (always delivers)

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 3: refactor: replace cron inline closure in gateway.ts

**Status**: [x] done (commit `3e957f0`)

**Changes**:
- `packages/gateway/src/gateway.ts` — Replace `gateway.ts:148-159` inline closure with `createCronCallback()`
- Wire `sendResult` to the same delivery function as heartbeat

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 4: refactor: rename sendHeartbeatResult → sendScheduledResult

**Status**: [x] done (commit `d40328d`)

**Changes**:
- `packages/gateway/src/gateway.ts` — Rename function, update all call sites
- Both heartbeat and cron now share `sendScheduledResult()`

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 5: test: add cron callback unit tests (Layer 1)

**Status**: [x] done (merged into Step 2, commit `b60b0a8`)

**Changes**:
- `packages/gateway/src/scheduled.test.ts` — Add comprehensive cron unit tests:
  - Cron dispatch sends correct source/sessionKey/priority
  - Cron result always delivered (no HEARTBEAT_OK suppression)
  - Agent reply "HEARTBEAT_OK" is still delivered for cron
  - Error in dispatch → onError called, no crash
  - Error in sendResult → onError called, no crash

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 6: test: add cron Stage 2 behavioral integration tests (Layer 3)

**Status**: [x] done (commit `57c3ea0`)

**Changes**:
- `packages/gateway/src/scheduled.test.ts` — Add Stage 2 section for cron:
  - Wire real `createDispatcher` + `createCronCallback` + mock Agent handler
  - Cron trigger → dispatch → Agent response → sendResult called
  - Cron trigger → Agent failure → no delivery, no crash
  - Cron trigger → Agent replies "HEARTBEAT_OK" → still delivered (NOT suppressed)

**Verify**: `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`

---

### Step 7: test: extend behavioral-tests/cron.test.ts Phase 3 — Discord E2E (Layer 4)

**Status**: [x] done (commit `6371b38`)

**Changes**:
- `packages/gateway/behavioral-tests/cron.test.ts` — Add Phase 3: Cron Result Delivery
  - Test: `cron run → result appears in Discord channel`
    1. Add a cron job via chat
    2. Run the job via `cron run` action
    3. Wait for Agent response to appear in Discord
    4. Verify response is the cron task execution result (not a chat reply)
  - Test: `cron result not suppressed by HEARTBEAT_OK`
    1. Add job with instruction "reply exactly HEARTBEAT_OK"
    2. Run the job
    3. Verify Discord still receives a message (not suppressed)

**Verify**: Manual run — `bun run packages/gateway/behavioral-tests/cron.test.ts --debug`

---

## Execution Order

```
Step 1 (rename) → Step 2 (extract) → Step 3 (wire up) → Step 4 (rename sendResult)
    → Step 5 (L1 tests) → Step 6 (L3 tests) → Step 7 (L4 Discord E2E)
```

Each step is an atomic commit. Every commit passes `bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit`.

## Validation Gate

After all steps:

```bash
# Layer 1 + 2: Unit tests + Lint
bun --filter '@deca/*' lint && bun --filter '@deca/*' test:unit

# Layer 3: Covered by Stage 2 tests inside scheduled.test.ts

# Layer 4: Discord E2E (manual)
bun run packages/gateway/behavioral-tests/cron.test.ts --debug
```
