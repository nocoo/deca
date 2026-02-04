# Discord Integration for OpenClaw-Mini

Design document for adding Discord messaging support to openclaw-mini, referencing the full OpenClaw implementation.

## Overview

Add Discord bot capabilities to openclaw-mini, enabling:
- Receive messages from Discord channels/DMs
- Process messages through the Agent
- Send replies back to Discord
- Support channel allowlists and thread replies
- Integrate with Heartbeat for proactive notifications

## Reference: OpenClaw Full Implementation

### Source Location

```
references/openclaw/
├── src/discord/                    # Core Discord module (~8,500 LOC)
│   ├── monitor/
│   │   ├── provider.ts            # Main entry, Carbon client creation
│   │   ├── listeners.ts           # Message/reaction/presence listeners
│   │   ├── message-handler.ts     # Message handler factory
│   │   ├── message-handler.preflight.ts  # Allowlist/policy checks
│   │   ├── message-handler.process.ts    # Route to AI agent
│   │   ├── threading.ts           # Thread management
│   │   └── allow-list.ts          # Guild/channel allowlist
│   ├── send.shared.ts             # Send utilities, chunking
│   ├── send.outbound.ts           # Send messages/polls/stickers
│   ├── chunk.ts                   # 2000 char limit chunking
│   ├── resolve-channels.ts        # Channel lookup
│   ├── resolve-users.ts           # User lookup
│   └── api.ts                     # Discord REST API client
│
├── src/channels/plugins/
│   └── onboarding/discord.ts      # Discord onboarding flow
│
└── src/config/types.discord.ts    # Discord config types
```

### Key Components to Reference

| Component | Full Version File | Purpose | Mini Adaptation |
|-----------|------------------|---------|-----------------|
| Gateway Connection | `monitor/provider.ts` | WebSocket to Discord | Use discord.js Client |
| Message Listener | `monitor/listeners.ts` | Receive MESSAGE_CREATE | discord.js `messageCreate` event |
| Preflight Check | `monitor/message-handler.preflight.ts` | Allowlist validation | Simplified allowlist check |
| Message Processing | `monitor/message-handler.process.ts` | Route to agent | Direct Agent.run() call |
| Send Message | `send.outbound.ts` | REST API send | discord.js channel.send() |
| Chunking | `chunk.ts` | Split long messages | Simple 2000 char split |
| Threading | `monitor/threading.ts` | Thread replies | discord.js thread API |
| Allowlist | `monitor/allow-list.ts` | Guild/channel filtering | Simplified config-based |

### Dependencies Used

| Full Version | Mini Version |
|--------------|--------------|
| `@buape/carbon` (custom framework) | `discord.js` (standard, well-documented) |
| `discord-api-types` | Included in discord.js |

**Why discord.js for Mini?**
- Larger community, better documentation
- Simpler API for basic use cases
- Built-in Gateway + REST handling
- No need for Carbon's advanced features

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         openclaw-mini                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐   │
│  │   CLI Mode  │     │Discord Mode │     │   (Future) Web Mode │   │
│  │  cli.ts     │     │cli-discord.ts│    │                     │   │
│  └──────┬──────┘     └──────┬──────┘     └─────────────────────┘   │
│         │                   │                                        │
│         │                   ▼                                        │
│         │           ┌───────────────┐                               │
│         │           │DiscordAdapter │                               │
│         │           │  - client.ts  │                               │
│         │           │  - listener.ts│                               │
│         │           │  - sender.ts  │                               │
│         │           └───────┬───────┘                               │
│         │                   │                                        │
│         ▼                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                         Agent                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│   │
│  │  │ Session  │ │  Memory  │ │  Context │ │    Heartbeat     ││   │
│  │  │ Manager  │ │  Manager │ │  Loader  │ │    Manager       ││   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Discord Message Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                        RECEIVE MESSAGE                                │
└──────────────────────────────────────────────────────────────────────┘

Discord Gateway (WebSocket)
        │
        │ MESSAGE_CREATE event
        ▼
┌───────────────────┐
│  discord.js       │
│  Client           │
└─────────┬─────────┘
          │
          │ 'messageCreate' event
          ▼
┌───────────────────┐     ┌───────────────────┐
│   listener.ts     │────▶│   allowlist.ts    │
│                   │     │   isAllowed()     │
│ onMessageCreate() │     └─────────┬─────────┘
└─────────┬─────────┘               │
          │                         │ false → ignore
          │ ◀───────────────────────┘ true  → continue
          ▼
┌───────────────────┐
│ Build session key │
│ discord:guild:    │
│ channel:user      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   Agent.run()     │
│                   │
│ sessionKey,       │
│ message.content,  │
│ callbacks         │
└─────────┬─────────┘
          │
          │ onTextDelta / onTextComplete
          ▼
┌───────────────────┐
│   sender.ts       │
│                   │
│ sendReply()       │
│ - chunk if needed │
│ - thread or reply │
└───────────────────┘


┌──────────────────────────────────────────────────────────────────────┐
│                        SEND MESSAGE (Heartbeat)                       │
└──────────────────────────────────────────────────────────────────────┘

┌───────────────────┐
│ HeartbeatManager  │
│                   │
│ onTasks() trigger │
└─────────┬─────────┘
          │
          │ tasks[], request
          ▼
┌───────────────────┐
│ Heartbeat Handler │
│                   │
│ buildMessage()    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   sender.ts       │
│                   │
│ sendToChannel()   │
│ target from config│
└───────────────────┘
```

### Session Key Format

```
CLI Mode:
  agent:main:cli:session-123

Discord Mode:
  agent:main:discord:guild-{guildId}:channel-{channelId}:user-{userId}

Discord Thread Mode:
  agent:main:discord:guild-{guildId}:thread-{threadId}:user-{userId}

Discord DM Mode:
  agent:main:discord:dm:user-{userId}
```

## File Structure

### New Files to Create

```
src/
├── discord/
│   ├── index.ts           # Module exports
│   ├── client.ts          # Discord.js client wrapper
│   ├── listener.ts        # Message event handler
│   ├── sender.ts          # Send/reply functions
│   ├── allowlist.ts       # Channel/user filtering
│   ├── session.ts         # Discord session key helpers
│   ├── chunk.ts           # Message chunking (2000 char limit)
│   └── types.ts           # Discord-specific types
│
├── cli-discord.ts         # Discord mode entry point
│
└── config/
    └── discord.ts         # Discord configuration loader
```

### Estimated Line Counts

| File | Lines | Description |
|------|-------|-------------|
| `discord/client.ts` | ~120 | Client creation, connection management |
| `discord/listener.ts` | ~150 | Message handling, routing to Agent |
| `discord/sender.ts` | ~100 | Send messages, handle threads |
| `discord/allowlist.ts` | ~80 | Guild/channel/user filtering |
| `discord/session.ts` | ~50 | Session key generation |
| `discord/chunk.ts` | ~60 | Split long messages |
| `discord/types.ts` | ~40 | Type definitions |
| `discord/index.ts` | ~20 | Exports |
| `cli-discord.ts` | ~120 | Entry point, config loading |
| `config/discord.ts` | ~60 | Config schema and defaults |
| **Total New** | **~800** | |

### Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| `agent.ts` | Add ChannelContext parameter | +30 |
| `session-key.ts` | Add Discord session helpers | +20 |
| `index.ts` | Export Discord module | +5 |
| **Total Modified** | | **~55** |

## Implementation Details

### 1. Discord Client (`discord/client.ts`)

```typescript
import { Client, GatewayIntentBits, Partials } from "discord.js";

export interface DiscordClientConfig {
  token: string;
  intents?: GatewayIntentBits[];
}

export function createDiscordClient(config: DiscordClientConfig): Client {
  const client = new Client({
    intents: config.intents ?? [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // Required for DMs
  });

  return client;
}

export async function connectDiscord(client: Client, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("ready", () => {
      console.log(`Discord connected as ${client.user?.tag}`);
      resolve();
    });
    client.once("error", reject);
    client.login(token);
  });
}
```

**Reference:** `references/openclaw/src/discord/monitor/provider.ts:100-200`

### 2. Message Listener (`discord/listener.ts`)

```typescript
import type { Client, Message } from "discord.js";
import type { Agent } from "../agent.js";
import { isAllowed } from "./allowlist.js";
import { resolveDiscordSessionKey } from "./session.js";
import { sendReply } from "./sender.js";

export interface ListenerConfig {
  allowlist?: AllowlistConfig;
  ignoreBots?: boolean;
  requireMention?: boolean;
}

export function setupMessageListener(
  client: Client,
  agent: Agent,
  config: ListenerConfig = {}
): void {
  client.on("messageCreate", async (message: Message) => {
    // Ignore bot messages
    if (config.ignoreBots !== false && message.author.bot) {
      return;
    }

    // Check allowlist
    if (config.allowlist && !isAllowed(message, config.allowlist)) {
      return;
    }

    // Check if mention required
    if (config.requireMention && !message.mentions.has(client.user!)) {
      return;
    }

    // Build session key
    const sessionKey = resolveDiscordSessionKey({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      threadId: message.channel.isThread() ? message.channelId : undefined,
    });

    // Extract message content (remove mention if present)
    const content = message.content
      .replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "")
      .trim();

    if (!content) {
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Run agent
    try {
      const result = await agent.run(sessionKey, content, {
        onTextDelta: () => {
          // Optionally refresh typing indicator
        },
      });

      // Send reply
      await sendReply(message, result.text);
    } catch (error) {
      console.error("[Discord] Agent error:", error);
      await sendReply(message, "Sorry, I encountered an error.");
    }
  });
}
```

**Reference:** `references/openclaw/src/discord/monitor/message-handler.process.ts`

### 3. Allowlist (`discord/allowlist.ts`)

```typescript
import type { Message } from "discord.js";

export interface AllowlistConfig {
  /** Allowed guild IDs (empty = all allowed) */
  guilds?: string[];
  /** Allowed channel IDs (empty = all allowed) */
  channels?: string[];
  /** Allowed user IDs (empty = all allowed) */
  users?: string[];
  /** Denied user IDs (checked first) */
  denyUsers?: string[];
}

export function isAllowed(message: Message, config: AllowlistConfig): boolean {
  // Check deny list first
  if (config.denyUsers?.includes(message.author.id)) {
    return false;
  }

  // Check user allowlist
  if (config.users?.length && !config.users.includes(message.author.id)) {
    return false;
  }

  // Check guild allowlist (skip for DMs)
  if (message.guildId) {
    if (config.guilds?.length && !config.guilds.includes(message.guildId)) {
      return false;
    }
  }

  // Check channel allowlist
  if (config.channels?.length && !config.channels.includes(message.channelId)) {
    return false;
  }

  return true;
}
```

**Reference:** `references/openclaw/src/discord/monitor/allow-list.ts`

### 4. Message Sender (`discord/sender.ts`)

```typescript
import type { Message, TextChannel, ThreadChannel } from "discord.js";
import { chunkMessage } from "./chunk.js";

export interface SendConfig {
  /** Use threads for replies */
  useThreads?: boolean;
  /** Thread name format */
  threadName?: string;
  /** Max message length before chunking */
  maxLength?: number;
}

export async function sendReply(
  message: Message,
  text: string,
  config: SendConfig = {}
): Promise<void> {
  const chunks = chunkMessage(text, config.maxLength ?? 2000);

  // If in thread, reply directly
  if (message.channel.isThread()) {
    for (const chunk of chunks) {
      await message.channel.send(chunk);
    }
    return;
  }

  // Use thread mode
  if (config.useThreads) {
    const threadName = config.threadName ?? `Reply to ${message.author.username}`;
    const thread = await message.startThread({
      name: threadName.slice(0, 100), // Discord limit
    });
    for (const chunk of chunks) {
      await thread.send(chunk);
    }
    return;
  }

  // Direct reply
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await message.channel.send(chunks[i]);
  }
}

export async function sendToChannel(
  channel: TextChannel | ThreadChannel,
  text: string,
  config: SendConfig = {}
): Promise<void> {
  const chunks = chunkMessage(text, config.maxLength ?? 2000);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}
```

**Reference:** `references/openclaw/src/discord/send.outbound.ts`

### 5. Message Chunking (`discord/chunk.ts`)

```typescript
const DISCORD_MAX_LENGTH = 2000;

export function chunkMessage(text: string, maxLength = DISCORD_MAX_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to break at newline
    let breakPoint = remaining.lastIndexOf("\n", maxLength);
    
    // If no newline, try space
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf(" ", maxLength);
    }
    
    // If still no good break point, hard break
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}
```

**Reference:** `references/openclaw/src/discord/chunk.ts`

### 6. Discord Session Key (`discord/session.ts`)

```typescript
import { normalizeAgentId } from "../session-key.js";

export interface DiscordSessionParams {
  agentId?: string;
  guildId?: string | null;
  channelId: string;
  userId: string;
  threadId?: string;
}

export function resolveDiscordSessionKey(params: DiscordSessionParams): string {
  const agentId = normalizeAgentId(params.agentId ?? "main");
  
  // DM mode
  if (!params.guildId) {
    return `agent:${agentId}:discord:dm:user-${params.userId}`;
  }

  // Thread mode
  if (params.threadId) {
    return `agent:${agentId}:discord:guild-${params.guildId}:thread-${params.threadId}:user-${params.userId}`;
  }

  // Channel mode
  return `agent:${agentId}:discord:guild-${params.guildId}:channel-${params.channelId}:user-${params.userId}`;
}
```

### 7. Entry Point (`cli-discord.ts`)

```typescript
#!/usr/bin/env node
import { Agent } from "./agent.js";
import { createDiscordClient, connectDiscord } from "./discord/client.js";
import { setupMessageListener } from "./discord/listener.js";
import type { AllowlistConfig } from "./discord/allowlist.js";

async function main() {
  // Load config
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("Error: DISCORD_TOKEN environment variable required");
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY required");
    process.exit(1);
  }

  // Parse allowlist from env
  const allowlist: AllowlistConfig = {
    guilds: process.env.DISCORD_GUILDS?.split(",").filter(Boolean),
    channels: process.env.DISCORD_CHANNELS?.split(",").filter(Boolean),
    users: process.env.DISCORD_USERS?.split(",").filter(Boolean),
  };

  // Create agent
  const agent = new Agent({
    apiKey,
    workspaceDir: process.cwd(),
    enableHeartbeat: process.env.ENABLE_HEARTBEAT === "true",
  });

  // Create Discord client
  const client = createDiscordClient({ token });

  // Setup message listener
  setupMessageListener(client, agent, {
    allowlist: Object.values(allowlist).some(v => v?.length) ? allowlist : undefined,
    ignoreBots: true,
    requireMention: process.env.DISCORD_REQUIRE_MENTION === "true",
  });

  // Connect
  console.log("Connecting to Discord...");
  await connectDiscord(client, token);
  console.log("Discord bot is ready!");

  // Setup heartbeat if enabled
  if (process.env.ENABLE_HEARTBEAT === "true") {
    const targetChannel = process.env.HEARTBEAT_CHANNEL;
    if (targetChannel) {
      agent.startHeartbeat(async (tasks) => {
        const channel = await client.channels.fetch(targetChannel);
        if (channel?.isTextBased()) {
          const message = tasks.map(t => `- ${t.description}`).join("\n");
          await (channel as any).send(`📋 Pending tasks:\n${message}`);
        }
      });
    }
  }

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    agent.stopHeartbeat();
    client.destroy();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

## Configuration

### Environment Variables

```bash
# Required
DISCORD_TOKEN=your-bot-token
ANTHROPIC_API_KEY=your-api-key

# Optional - Allowlist (comma-separated)
DISCORD_GUILDS=123456789,987654321
DISCORD_CHANNELS=111111111,222222222
DISCORD_USERS=333333333

# Optional - Behavior
DISCORD_REQUIRE_MENTION=true    # Only respond when @mentioned
ENABLE_HEARTBEAT=true           # Enable proactive notifications
HEARTBEAT_CHANNEL=444444444     # Channel for heartbeat messages
```

### Future: Config File Support

```yaml
# .openclaw-mini.yaml
discord:
  token: ${DISCORD_TOKEN}
  requireMention: true
  allowlist:
    guilds:
      - "123456789"
    channels:
      - "111111111"
  heartbeat:
    enabled: true
    channel: "444444444"
    interval: 30m
```

## Agent Modifications

### ChannelContext Addition

```typescript
// agent.ts

export interface ChannelContext {
  /** Channel type */
  channel: "cli" | "discord" | "telegram" | "web";
  /** Platform-specific channel ID */
  channelId?: string;
  /** Platform-specific user ID */
  userId?: string;
  /** Thread ID if in thread */
  threadId?: string;
  /** Message ID to reply to */
  replyToId?: string;
  /** Guild/server ID */
  guildId?: string;
}

// Modify run() signature
async run(
  sessionIdOrKey: string,
  userMessage: string,
  callbacks?: AgentCallbacks,
  context?: ChannelContext  // NEW
): Promise<RunResult>
```

This context can be used for:
1. Tool restrictions (e.g., disable `exec` in Discord)
2. Response formatting (e.g., Discord markdown)
3. Logging and analytics

## Testing Plan

### Unit Tests

```typescript
// discord/allowlist.test.ts
describe("isAllowed", () => {
  it("allows all when no config", () => {...});
  it("blocks denied users", () => {...});
  it("allows only listed guilds", () => {...});
  it("allows only listed channels", () => {...});
});

// discord/chunk.test.ts
describe("chunkMessage", () => {
  it("returns single chunk for short messages", () => {...});
  it("breaks at newlines", () => {...});
  it("breaks at spaces when no newline", () => {...});
  it("hard breaks when necessary", () => {...});
});
```

### Integration Tests

```typescript
// discord/listener.test.ts
describe("Message Listener", () => {
  it("ignores bot messages", () => {...});
  it("respects allowlist", () => {...});
  it("requires mention when configured", () => {...});
  it("calls agent.run with correct session key", () => {...});
});
```

### Manual Testing Checklist

- [ ] Bot connects to Discord
- [ ] Bot responds to messages in allowed channel
- [ ] Bot ignores messages in non-allowed channels
- [ ] Bot ignores other bot messages
- [ ] Long messages are chunked correctly
- [ ] Thread replies work
- [ ] DM responses work
- [ ] Heartbeat sends to configured channel
- [ ] Graceful shutdown on SIGINT

## Future Enhancements

### Phase 2 (Post-MVP)

1. **Slash Commands** - `/ask`, `/reset`, `/status`
2. **Reaction Handlers** - React to trigger actions
3. **Presence Detection** - Pause when user offline
4. **Rate Limiting** - Respect Discord rate limits
5. **Error Recovery** - Reconnect on disconnect

### Phase 3

1. **Multi-bot Support** - Run multiple Discord bots
2. **Web Dashboard** - Configure via UI
3. **Metrics** - Message counts, response times
4. **Plugins** - Custom message handlers

## Summary

| Aspect | Details |
|--------|---------|
| **New Code** | ~800 lines |
| **Modified Code** | ~55 lines |
| **Dependencies** | `discord.js` |
| **Complexity** | Medium |
| **Time Estimate** | 4-6 hours |

The implementation follows openclaw-mini's philosophy: minimal but functional. All advanced features from the full OpenClaw can be added incrementally.
