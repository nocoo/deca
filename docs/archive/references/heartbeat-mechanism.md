# Heartbeat Mechanism Deep Dive

OpenClaw's proactive wake system that enables AI agents to initiate conversations autonomously.

## Overview

Heartbeat is a "proactive initiative" mechanism that allows AI Agents to **actively send messages to users** rather than passively waiting for input. This is a key feature that differentiates intelligent agents from simple chatbots.

### Core Use Cases

1. **Task Reminders** - "You have 3 unfinished tasks today"
2. **Async Command Completion** - "The build you started 10 minutes ago has completed"
3. **Scheduled Reports** - "Daily summary: 5 issues resolved, 2 PRs merged"
4. **Proactive Assistance** - Agent notices something and alerts user

## Architecture Comparison

### OpenClaw (Full Version) - 1,064 lines

```
                    ┌─────────────────────────────────────────┐
                    │           heartbeat-runner.ts           │
                    │  - Multi-agent scheduling               │
                    │  - Config-driven (YAML)                 │
                    │  - Channel routing (Telegram/Discord)   │
                    │  - Session store integration            │
                    │  - Duplicate suppression (24h)          │
                    │  - Active hours + timezone              │
                    │  - LLM response processing              │
                    └────────────────┬────────────────────────┘
                                     │ setHeartbeatWakeHandler()
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │           heartbeat-wake.ts             │
                    │  - Request coalescing (250ms)           │
                    │  - Double buffering                     │
                    │  - Retry on busy queue                  │
                    └─────────────────────────────────────────┘
```

### OpenClaw-Mini - 626 lines

```
                    ┌─────────────────────────────────────────┐
                    │          HeartbeatManager               │
                    │  (combines Runner + Wake in one class)  │
                    │                                         │
                    │  - setTimeout scheduling                │
                    │  - HEARTBEAT.md parsing                 │
                    │  - Active hours checking                │
                    │  - Callback-based handlers              │
                    │  - Duplicate detection                  │
                    └────────────────┬────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │          HeartbeatWake (internal)       │
                    │  - Request coalescing                   │
                    │  - Priority merging                     │
                    │  - Double buffering                     │
                    └─────────────────────────────────────────┘
```

## Key Mechanisms

### 1. setTimeout Precision Scheduling (Not setInterval)

Both versions use `setTimeout` instead of `setInterval` for precise scheduling:

```typescript
// Calculate next due time precisely
const delay = Math.max(0, nextDue - now);
this.state.timer = setTimeout(() => {
  this.wake.request({ reason: "interval" });
}, delay);
```

**Why not setInterval?**
- `setInterval` accumulates drift over time
- Cannot adapt to dynamic interval changes
- `setTimeout` allows recalculation after each run

### 2. Request Coalescing (250ms Window)

Multiple wake requests within 250ms are merged into one execution:

```typescript
// heartbeat-wake.ts (OpenClaw)
const DEFAULT_COALESCE_MS = 250;

function schedule(coalesceMs: number) {
  if (timer) {
    return; // Already scheduled, merge with existing
  }
  timer = setTimeout(async () => {
    // Execute once for all coalesced requests
  }, coalesceMs);
}
```

**Use case:** User triggers 5 commands rapidly. Without coalescing, agent would wake 5 times. With coalescing, wakes once after 250ms pause.

### 3. Double Buffering (Run-While-Queued)

If a wake request arrives while handler is running:

```typescript
private async execute(): Promise<void> {
  this.state.running = true;
  // ... execute handler ...
  this.state.running = false;

  // If new requests arrived during execution, run again immediately
  if (this.state.scheduled) {
    this.state.scheduled = false;
    this.schedule(0);
  }
}

request(req: WakeRequest): void {
  if (this.state.running) {
    this.state.scheduled = true; // Queue for later
    return;
  }
  this.schedule(this.coalesceMs);
}
```

### 4. Wake Reason Priority

Multiple reasons are merged with priority:

```typescript
const priority: Record<WakeReason, number> = {
  exec: 4,      // Highest - async command finished
  cron: 3,      // Scheduled task completed
  interval: 2,  // Regular timer
  retry: 1,     // Retry after failure
  requested: 0, // Manual trigger
};
```

**Why?** When `exec` and `interval` coincide, the agent should prioritize reporting the exec result.

### 5. HEARTBEAT.md Task File

Both versions read tasks from a markdown file:

```markdown
# HEARTBEAT.md

## Today's Tasks
- [ ] Review PR #123
- [x] Fix login bug
- [ ] Update documentation

## Notes
Comments and headers are ignored by parser.
```

Parser extracts uncompleted tasks:
```typescript
// Checkbox format: - [ ] or - [x]
const checkboxMatch = trimmed.match(/^[-*+]\s*\[([\sXx]?)\]\s*(.+)$/);
if (checkboxMatch) {
  const [, check, description] = checkboxMatch;
  tasks.push({
    description: description.trim(),
    completed: check.toLowerCase() === "x",
    line: i + 1,
  });
}
```

### 6. Active Hours Window

Prevents notifications outside configured hours:

```typescript
interface ActiveHours {
  start: string; // "09:00"
  end: string;   // "18:00"
  timezone?: string;
}

// Handles overnight ranges (e.g., 22:00 - 06:00)
if (endMinutes <= startMinutes) {
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
return currentMinutes >= startMinutes && currentMinutes < endMinutes;
```

### 7. Duplicate Message Suppression (24h)

Prevents sending identical messages repeatedly:

```typescript
// OpenClaw-Mini
private isDuplicateMessage(text: string, nowMs: number): boolean {
  if (!this.state.lastText || !this.state.lastTextAt) {
    return false;
  }
  const timeSinceLast = nowMs - this.state.lastTextAt;
  if (timeSinceLast >= this.config.duplicateWindowMs) { // 24h
    return false;
  }
  return text.trim() === this.state.lastText.trim();
}
```

### 8. Queue Busy Check (OpenClaw Full)

Skips heartbeat if main command queue has pending requests:

```typescript
const queueSize = getQueueSize(CommandLane.Main);
if (queueSize > 0) {
  return { status: "skipped", reason: "requests-in-flight" };
}
```

**Why?** Don't interrupt user interactions with proactive messages.

## Feature Comparison Matrix

| Feature | OpenClaw Full | OpenClaw-Mini |
|---------|--------------|---------------|
| **Lines of Code** | 1,064 | 626 |
| **setTimeout Scheduling** | Yes | Yes |
| **Request Coalescing** | 250ms | 250ms |
| **Double Buffering** | Yes | Yes |
| **Reason Priority** | By source | exec > cron > interval |
| **HEARTBEAT.md Parsing** | Yes | Yes |
| **Active Hours** | Timezone-aware | Local only |
| **Duplicate Suppression** | 24h, text-based | 24h, text-based |
| **Queue Busy Check** | Yes | No |
| **Multi-Agent Support** | Yes (per-agent config) | No |
| **Channel Routing** | Telegram/Discord/etc | Callbacks only |
| **Exec Event Handling** | Specialized prompt | Basic |
| **Session Store Integration** | Full | None |
| **Config Source** | YAML file | Code/Constructor |
| **LLM Response Processing** | Strip HEARTBEAT_OK | None |

## OpenClaw Full - Extra Features

### 1. Multi-Agent Support

Manages separate schedules for different agents:

```typescript
const agents = new Map<string, HeartbeatAgentState>();
for (const agent of resolveHeartbeatAgents(cfg)) {
  agents.set(agent.agentId, {
    agentId: agent.agentId,
    intervalMs,
    nextDueMs,
    lastRunMs,
  });
}
```

### 2. Channel-Specific Delivery

Routes heartbeat messages to appropriate channels:

```typescript
const delivery = resolveHeartbeatDeliveryTarget({ cfg, entry, heartbeat });
// delivery.channel = "telegram" | "discord" | "slack" | ...
await deliverOutboundPayloads({
  channel: delivery.channel,
  to: delivery.to,
  payloads: [{ text: normalized.text, mediaUrls }],
});
```

### 3. HEARTBEAT_OK Token Handling

Agent can respond with `HEARTBEAT_OK` to indicate "nothing to report":

```typescript
const HEARTBEAT_TOKEN = "HEARTBEAT_OK";

// Strip the token from response
const stripped = stripHeartbeatToken(payload.text, {
  mode: "heartbeat",
  maxAckChars: ackMaxChars,
});
if (stripped.shouldSkip) {
  // Don't send message to user
}
```

### 4. Exec Event Special Handling

When async commands complete, use specialized prompt:

```typescript
const EXEC_EVENT_PROMPT =
  "An async command you ran earlier has completed. " +
  "Please relay the command output to the user in a helpful way.";

const hasExecCompletion = pendingEvents.some(
  (evt) => evt.includes("Exec finished")
);
const prompt = hasExecCompletion ? EXEC_EVENT_PROMPT : regularPrompt;
```

## Usage Example (OpenClaw-Mini)

```typescript
import { Agent } from "openclaw-mini";

const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  enableHeartbeat: true,       // Enable heartbeat
  heartbeatInterval: 30 * 60 * 1000, // 30 minutes
});

// Register callback
agent.startHeartbeat((tasks, request) => {
  console.log(`[Heartbeat] Reason: ${request.reason}`);
  console.log(`[Heartbeat] Pending tasks: ${tasks.length}`);
  
  // Send notification to user
  if (tasks.length > 0) {
    sendNotification(`You have ${tasks.length} pending tasks!`);
  }
});

// Create HEARTBEAT.md
await fs.writeFile("HEARTBEAT.md", `
# Tasks
- [ ] Review code
- [ ] Write tests
`);

// Manually trigger (for testing)
const tasks = await agent.triggerHeartbeat();
```

## Implementation Notes for Deca

If implementing heartbeat for Deca:

### Recommended Approach

1. **Start Simple** - Use Mini's single-class design
2. **Add Queue Check** - Prevent interrupting active sessions
3. **Consider Channels** - How will notifications reach users? (WebSocket, push, etc.)
4. **Store Last State** - Persist lastText/lastTextAt for duplicate detection across restarts

### Minimal Implementation

```typescript
class SimpleHeartbeat {
  private timer: NodeJS.Timeout | null = null;
  private lastText = "";
  private lastTextAt = 0;

  start(intervalMs: number, handler: () => Promise<string | null>) {
    const tick = async () => {
      const text = await handler();
      
      // Duplicate check
      if (text && text !== this.lastText) {
        this.lastText = text;
        this.lastTextAt = Date.now();
        await this.sendToUser(text);
      }
      
      // Schedule next
      this.timer = setTimeout(tick, intervalMs);
    };
    tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
}
```

### Advanced Features to Consider

1. **WebSocket Push** - Real-time delivery to connected clients
2. **iOS/macOS Push** - APNS for background notifications
3. **Email Digest** - Batch daily summaries
4. **Quiet Hours** - User-configurable active hours
5. **Priority Levels** - Urgent vs. informational heartbeats

## Conclusion

The Heartbeat mechanism is a sophisticated but well-designed system that:

1. **Precisely schedules** wake events without drift
2. **Efficiently coalesces** multiple triggers
3. **Prioritizes** important events (exec > scheduled)
4. **Prevents spam** through duplicate detection
5. **Respects user time** with active hours

OpenClaw-Mini provides ~60% of the functionality with ~60% of the code, making it an excellent starting point for understanding and implementing proactive agent behavior.
