# Behavioral Tests 行为测试

> 记录 Deca 项目的行为测试套件及其运行状态

## 概述

行为测试（Behavioral Tests）是 Deca 四层测试架构的第四层，使用真实的 LLM 和 Discord 连接来验证 Agent 的端到端行为。

```bash
# 运行所有行为测试
bun --filter @deca/gateway test:behavioral

# 运行特定测试
bun run behavioral-tests/<test-name>.test.ts
```

## 测试套件清单

| 套件 | 文件 | 测试数 | 描述 |
|------|------|--------|------|
| tools | `tools.test.ts` | 8 | 文件操作工具（write/read/edit/exec/grep/list） |
| heartbeat | `heartbeat.test.ts` | 4 | 心跳机制和定时触发 |
| main-session | `main-session.test.ts` | 3 | 主会话路由（mainChannelId/mainUserId） |
| cross-channel-session | `cross-channel-session.test.ts` | 10 | 跨频道会话共享（HTTP ↔ Discord） |
| memory | `memory.test.ts` | 8 | 长期记忆系统（memory_search/memory_get） |
| dispatcher | `dispatcher.test.ts` | 4 | 并发调度和请求处理 |
| skills | `skills.test.ts` | 6 | 内置技能（/review, /explain, /refactor 等） |
| autonomy | `agent-autonomy.test.ts` | 4 | Agent 自主任务完成能力 |
| claude-code | `claude-code.test.ts` | 2 | Claude CLI 集成 |
| cron | `cron.test.ts` | 7 | 定时任务系统 |
| session | `session.test.ts` | 9 | 会话隔离和持久化 |
| prompt-cache | `prompt-cache.test.ts` | 2 | Prompt 缓存验证 |
| proactive-search | `proactive-search.test.ts` | 1 | 主动搜索能力 |

**总计**: 12 个套件，66 个测试用例

---

## 最近运行结果

**运行日期**: 2026-02-09 (after session cleanup fix)

### 汇总

| 状态 | 套件数 | 百分比 |
|------|--------|--------|
| ✅ 全部通过 | 9 | 75% |
| ⏱️ 超时 | 3 | 25% |

### 详细结果

| 套件 | 状态 | 通过/总数 | 备注 |
|------|------|-----------|------|
| session | ✅ PASS | 9/9 | **已修复** - 会话持久化正常 |
| tools | ✅ PASS | 8/8 | **已修复** - 工具调用稳定 |
| memory | ✅ PASS | 8/8 | **已修复** - 记忆系统正常 |
| main-session | ✅ PASS | 3/3 | **已修复** - 主会话路由正常 |
| dispatcher | ✅ PASS | 4/4 | 并发调度正常 |
| heartbeat | ✅ PASS | 4/4 | 心跳机制正常 |
| proactive-search | ✅ PASS | 1/1 | 主动搜索正常 |
| cron | ✅ PASS | 7/7 | **已修复** - 定时任务正常 |
| skills | ⏱️ TIMEOUT | 4/6+ | 超时于 /search 测试 |
| autonomy | ⏱️ TIMEOUT | 2/4+ | 超时于 code-investigation |
| cross-channel | ⏱️ TIMEOUT | 2/10+ | Discord 阶段超时 |
| claude-code | ⏱️ TIMEOUT | 1/2+ | 超时于 weather fetch |

---

## 关键修复记录

### 2026-02-09: botUserId 修复

**问题**: 多个测试套件（session, tools, memory, main-session）出现间歇性失败

**根因分析**:

1. **错误的 botUserId**: 测试使用 `creds.botUserId`（undefined），导致回退到 `msg.author.bot` 判断。但 **webhook 消息也有 `bot: true`**，导致用户消息被误判为 Bot 响应。

2. **Session 历史污染**: 测试未清理之前的 session 文件，LLM 看到多个历史 secret，可能返回错误的值。

**修复方案**:

```typescript
// Before (incorrect)
botUserId: creds.botUserId  // undefined, falls back to msg.author.bot

// After (correct)
botUserId: creds.clientId   // Bot's actual Discord ID
```

**影响范围**: 所有 behavioral tests 文件

**相关 Commit**:
- `4043270 fix: clean up session files before behavioral tests and use correct botUserId`
- `b1574c5 fix: use clientId as botUserId in all behavioral tests`

### 2026-02-09: cron 测试修复

**问题**: cron 测试在 remove 操作时超时，Agent 执行了 add 而不是 remove

**根因分析**:

1. **Session 历史污染**: 测试通道的 session 文件积累了大量历史对话（591KB），导致 Agent 困惑
2. **处理消息过滤不完整**: `isProcessingMessage` 没有过滤 `🔧 正在执行...` 格式的消息

**修复方案**:

```typescript
// 1. 清理 session 文件
const sessionFile = join(sessionDir, `agent%3Adeca%3Achannel%3A${guildId}%3A${testChannelId}.jsonl`);
if (existsSync(sessionFile)) {
  rmSync(sessionFile);
}

// 2. 使用 jobId 直接删除而不是 name
const result = await sendAndWait(
  config,
  `Use the cron tool with action 'remove' and jobId '${jobId}'.`,
);
```

**相关 Commit**:
- `7b45083 fix: add session cleanup to cron behavioral test to avoid context pollution`
- `9fbaf37 refactor: extract isProcessingMessage to shared utils for behavioral tests`

---

## Discord Credentials 说明

```json
// ~/.deca/credentials/discord.json
{
  "clientId": "1468704508317139060",   // Bot's Discord ID - 用作 botUserId
  "userId": "1376095313496117338",      // Human user's Discord ID
  "botToken": "...",
  "webhookUrl": "...",
  "testChannelId": "..."
}
```

**重要**: `clientId` 是 Bot 的 Discord ID，应作为 `botUserId` 传递给 spawner。

---

## 超时问题分析

部分测试因 LLM 响应时间过长而超时（180s），这通常是因为：

1. **复杂任务**: 如 `/search`、`/refactor` 等需要多轮工具调用
2. **外部依赖**: 如 `claude-code` 需要启动 Claude CLI
3. **Discord 延迟**: 跨频道测试需要等待 Discord 消息传递

**建议**:
- 增加单个测试的超时时间
- 或拆分为更小的测试用例
- 跳过已知耗时较长的测试

---

## 运行指南

### 运行核心测试（快速验证）

```bash
# 核心功能测试（约 10 分钟）
cd packages/gateway
for test in session tools memory main-session dispatcher heartbeat proactive-search; do
  echo "=== $test ===" && bun run behavioral-tests/$test.test.ts
done
```

### 运行全部测试

```bash
# 依次运行所有行为测试（可能需要 30+ 分钟）
for test in tools heartbeat main-session cross-channel-session memory \
            dispatcher skills agent-autonomy claude-code cron session \
            proactive-search; do
  echo "Running $test..."
  bun run behavioral-tests/$test.test.ts
done
```

### 运行单个测试

```bash
# 在 packages/gateway 目录下
bun run behavioral-tests/<test-name>.test.ts
```

### 清理卡住的进程

```bash
pkill -9 -f "bun.*cli.ts"; rm -f ~/.deca/gateway.lock
```

### 环境要求

- `ANTHROPIC_API_KEY` - Claude API 密钥
- `DISCORD_BOT_TOKEN` - Discord 机器人 token
- `DISCORD_CHANNEL_ID` - 测试频道 ID
- `DISCORD_MAIN_CHANNEL_ID` - 主频道 ID (可选)
- `DISCORD_MAIN_USER_ID` - 主用户 ID (可选)

---

## 历史记录

| 日期 | 总通过率 | 备注 |
|------|----------|------|
| 2026-02-09 (v3) | 75% (9/12 套件) | cron 修复后，增加到 9 个套件全绿 |
| 2026-02-09 (v2) | 62% (8/13 套件) | botUserId 修复后，核心测试全部通过 |
| 2026-02-09 (v1) | ~80% (52/65+) | 初次全量运行记录 |
