# Heartbeat Fix Plan

> Fix the heartbeat mechanism to achieve reliable: Wake -> Execute -> Deliver.

## Goal

Make heartbeat a working end-to-end loop:

```
Timer -> Detect tasks -> Call LLM -> Deliver result to user
```

Current state: Timer and detection work, but execution is fire-and-forget (callback not awaited), and delivery is Discord-gated.

## Steps

### Step 1: fix: await heartbeat callback in Agent

**Status**: [x] done (commit `2511c71`)

**Problem**: `agent.ts:828` — `callback(tasks, request)` is not awaited. This causes:
- `runOnce()` finishes before LLM responds, rescheduling prematurely
- Errors become unhandled promise rejections
- `text` is never returned, so duplicate suppression is broken

**Changes**:
- `packages/agent/src/core/agent.ts` — Change `startHeartbeat()` to await the callback and propagate result text

**Tests**:
- `packages/agent/src/core/agent.test.ts` — Verify callback is awaited, error is caught, result text propagates

**Verify**: `bun --filter @deca/agent test`

---

### Step 2: refactor: decouple heartbeat wiring from Discord

**Status**: [x] done (commit `fa33220`)

**Problem**: `setupHeartbeatCallback()` is called inside `if (discord)` block (gateway.ts:246). No Discord = no heartbeat execution.

**Changes**:
- `packages/gateway/src/gateway.ts` — Move `setupHeartbeatCallback()` out of `if (discord)` block
- `sendHeartbeatResult()` degrades gracefully: has Discord → send; no Discord → log only

**Tests**:
- `packages/gateway/src/heartbeat.test.ts` — Test heartbeat dispatches without Discord configured
- `packages/gateway/src/heartbeat.test.ts` — Test heartbeat delivers to Discord when configured

**Verify**: `bun --filter @deca/gateway test:unit`

---

### Step 3: test: rewrite heartbeat unit tests against real code paths

**Status**: [x] done (commit `61c8f79`)

**Problem**: Current `heartbeat.test.ts` inlines a copy of the dispatch logic instead of testing the actual `setupHeartbeatCallback` function.

**Changes**:
- `packages/gateway/src/gateway.ts` — Extract `setupHeartbeatCallback` to be testable (accept deps via params)
- `packages/gateway/src/heartbeat.test.ts` — Rewrite against real function with injected mocks:
  - Tasks exist → dispatcher.dispatch called with source="heartbeat"
  - No tasks → dispatcher.dispatch not called
  - Dispatch fails → error caught, next heartbeat not blocked
  - Success text → sendHeartbeatResult called

**Verify**: `bun --filter @deca/gateway test:unit`

---

### Step 4: feat: implement HEARTBEAT_OK protocol

**Status**: [x] done (commit `974b45f`)

**Problem**: Every heartbeat sends a message even when Agent has nothing to report. OpenClaw uses `HEARTBEAT_OK` token protocol to suppress noise.

**Changes**:
- `packages/agent/src/heartbeat/tokens.ts` — `HEARTBEAT_OK` constant + `stripHeartbeatToken()` function
- `packages/gateway/src/gateway.ts` — Strip token from response; skip delivery if result is empty after stripping
- Heartbeat instruction prompt: add "If nothing needs attention, reply with HEARTBEAT_OK"

**Tests**:
- `packages/agent/src/heartbeat/tokens.test.ts` — Token stripping edge cases
- `packages/gateway/src/heartbeat.test.ts` — HEARTBEAT_OK response skips Discord delivery

**Verify**: `bun --filter @deca/agent test && bun --filter @deca/gateway test:unit`

---

### Step 5: fix: make /heartbeat/trigger actually trigger execution

**Status**: [x] done (commit `1f6d182`)

**Problem**: `POST /heartbeat/trigger` calls `triggerHeartbeat()` which only returns task list. The name says "trigger" but it only reads.

**Changes**:
- `packages/gateway/src/gateway.ts` — `/heartbeat/trigger` calls `adapter.agent.requestNow("requested")` to trigger real execution
- Response: `{ triggered: true, pendingTasks: [...] }`

**Tests**:
- `packages/gateway/src/heartbeat.test.ts` — POST trigger causes dispatch
- `packages/gateway/behavioral-tests/heartbeat.test.ts` — HTTP trigger → Agent executes → result observable

**Verify**: `bun --filter @deca/gateway test:unit && bun --filter @deca/gateway test:behavioral`

---

### Step 6: fix: heartbeatIntervalMs=0 should disable heartbeat

**Status**: [x] done (commit `0b4ddde`)

**Problem**: `types.ts:132` comments say "0 to disable" but 0ms interval causes infinite loop.

**Changes**:
- `packages/agent/src/heartbeat/manager.ts` — `start()` returns early if `intervalMs <= 0`
- `packages/gateway/src/adapter.ts` — Pass `enabled: (config.heartbeatIntervalMs ?? 1) > 0`

**Tests**:
- `packages/agent/src/heartbeat/manager.test.ts` — intervalMs=0 → start() does not schedule

**Verify**: `bun --filter @deca/agent test`

---

## Execution Order

```
Step 1 (await fix) → Step 2 (decouple Discord) → Step 3 (rewrite tests)
    → Step 4 (HEARTBEAT_OK) → Step 5 (trigger endpoint)

Step 6 (intervalMs=0) — independent, can run anytime
```

## Validation Gate

After all steps: `bun run test:unit && bun run lint`
