# Heartbeat 机制分析与修复计划

> 本文档分析 OpenClaw、OpenClaw-mini、Deca 三个项目的 Heartbeat 实现，并提出修复计划。

## 1. 概述

Heartbeat（心跳/主动唤醒）是 AI Agent 的核心能力之一，让 Agent 能够：

- **定时检查任务**：读取 `HEARTBEAT.md` 中的待办事项
- **主动执行**：不需要用户发消息，Agent 自己触发执行
- **主动汇报**：执行结果发送到指定通道（Discord DM、Channel 等）

## 2. 三个项目的实现对比

### 2.1 OpenClaw（完整版）

**位置**: `references/openclaw/src/infra/heartbeat-runner.ts`

**流程**:
```
Timer 触发
    ↓
检查 HEARTBEAT.md 是否有任务
    ↓
检查活跃时间窗口、队列状态
    ↓
调用 getReplyFromConfig(ctx, { isHeartbeat: true }, cfg)  ← 调用 LLM！
    ↓
Agent 执行任务，返回结果
    ↓
发送结果到 delivery target (Discord DM/Channel)
```

**关键代码** (`heartbeat-runner.ts:621`):
```typescript
const replyResult = await getReplyFromConfig(ctx, { isHeartbeat: true }, cfg);
```

**特点**:
- ✅ 完整闭环：定时器 → 检测 → **执行** → 发送
- ✅ 主动调用 LLM，不依赖用户消息
- ✅ 支持多种触发原因：interval、cron、exec、requested

### 2.2 OpenClaw-mini

**位置**: `references/openclaw-mini/src/heartbeat.ts`, `references/openclaw-mini/src/agent.ts`

**流程**:
```
Timer 触发
    ↓
检查 HEARTBEAT.md 是否有任务
    ↓
调用 callback 通知外部  ← 只是通知！
    ↓
（期望外部自己调用 agent.run()）
```

**HeartbeatManager 的 callback 设计** (`heartbeat.ts:354-363`):
```typescript
// 4. 执行回调 - 只是通知，不执行
for (const callback of this.callbacks) {
  try {
    const result = await callback(pending, request);
    if (result.text) {
      resultText = result.text;
    }
  } catch (err) {
    console.error("[Heartbeat] Callback error:", err);
  }
}
```

**buildTasksPrompt() 的用途** (`agent.ts:470-476`):
```typescript
// 只在 agent.run() 被调用时才注入任务
if (this.enableHeartbeat) {
  const tasksPrompt = await this.heartbeat.buildTasksPrompt();
  if (tasksPrompt) {
    processedMessage += tasksPrompt;
  }
}
```

**特点**:
- ⚠️ 半成品：定时器 → 检测 → 通知 → **缺少执行**
- ⚠️ `buildTasksPrompt()` 只在用户发消息时才会被调用
- ⚠️ 如果用户不发消息，任务永远不会执行

**设计意图分析**:
OpenClaw-mini 定位为 library，把"什么时候调用 agent"的决定权留给使用者。
这是一个"骨架"设计，期望上层（如 Gateway）补全闭环。

### 2.3 Deca（当前实现）

**位置**: `packages/gateway/src/gateway.ts`

**流程**:
```
Timer 触发
    ↓
检查 HEARTBEAT.md 是否有任务
    ↓
调用 callback
    ↓
只发送任务列表到 Discord  ← 错误！从未执行
    ↓
（Agent 从未被调用）
```

**当前实现** (`gateway.ts:72-97`):
```typescript
function setupHeartbeatCallback(): void {
  if (!discord?.heartbeatChannelId || !discordGateway || !adapter) {
    return;  // 缺少 heartbeatChannelId 就不启动
  }

  adapter.agent.startHeartbeat(
    async (tasks: HeartbeatTask[], _request: WakeRequest) => {
      if (tasks.length === 0) return;
      
      // ❌ 错误：只发送任务列表，不执行！
      const message = formatHeartbeatMessage(tasks);
      await sendToChannel(channel, message);  // "📋 Heartbeat (3 pending tasks)"
    }
  );
}
```

**启动条件** (`gateway.ts:199-201`):
```typescript
// 需要同时满足两个条件才启动
if (config.agent.enableHeartbeat && discord.heartbeatChannelId) {
  setupHeartbeatCallback();
}
```

**serve.ts 配置缺失**:
```typescript
// 没有传这两个参数，所以 heartbeat 根本没启动！
agent: {
  // ❌ 没有 enableHeartbeat: true
},
discord: {
  // ❌ 没有 heartbeatChannelId
}
```

**问题总结**:
1. ❌ 启动条件太严格（需要 enableHeartbeat + heartbeatChannelId）
2. ❌ callback 只发送通知，不调用 agent.run()
3. ❌ 从未真正执行 HEARTBEAT.md 中的任务

## 3. 对比 Cron 的正确实现

Gateway 中 Cron 的实现是正确的参考 (`gateway.ts:125-137`):

```typescript
if (adapter.cronService) {
  const cronDispatcher = dispatcher;
  adapter.cronService.setOnTrigger(async (job) => {
    const instruction = `[CRON TASK: ${job.name}] ${job.instruction}`;
    // ✅ 正确：通过 dispatcher 发送指令，dispatcher 会调用 agent.run()
    await cronDispatcher.dispatch({
      source: "cron",
      sessionKey: "cron",
      content: instruction,
      sender: { id: "cron", username: "cron-scheduler" },
      priority: 5,
    });
  });
}
```

**Cron 的正确闭环**:
```
Cron Timer 触发
    ↓
cronService.onTrigger 被调用
    ↓
dispatcher.dispatch() 发送指令
    ↓
Dispatcher 调用 adapter.handle() → agent.run()
    ↓
Agent 执行任务
    ↓
Dispatcher 把结果发送到 reply 回调
```

## 4. 修复计划

### 4.1 目标

1. **Heartbeat 默认启用**：删除 `enableHeartbeat` 开关，作为核心功能默认开启
2. **删除 `heartbeatChannelId` 依赖**：自动发送到 main session
3. **修复 callback**：让 heartbeat 通过 dispatcher 执行，像 cron 一样
4. **完整闭环**：定时器 → 检测 → **执行** → 发送结果

### 4.2 修复后的流程

```
Heartbeat Timer 触发
    ↓
HeartbeatManager 检测到任务
    ↓
调用 Gateway 的 callback
    ↓
Gateway 通过 dispatcher.dispatch() 发送 heartbeat 指令
    ↓
Dispatcher 调用 agent.run()
    ↓
agent.run() 内部调用 buildTasksPrompt() 注入任务
    ↓
Agent 执行任务，返回结果
    ↓
Dispatcher 通过 reply 回调把结果发送到 Discord
```

### 4.3 Session Key 策略

Heartbeat 使用固定的 session key: `heartbeat`

这样：
- 所有 heartbeat 执行共享同一个会话上下文
- Agent 能记住之前的执行历史
- 便于调试和追踪

### 4.4 结果发送目标

按优先级：
1. **Discord DM** (mainUserId) - 如果配置了 mainUserId
2. **Main Channel** (mainChannelId) - 如果配置了 mainChannelId
3. **日志输出** - 如果都没有配置

## 5. 原子化提交计划

### Commit 1: docs: add heartbeat mechanism analysis
- 添加本文档 `docs/08-heartbeat.md`

### Commit 2: test: add heartbeat unit tests for gateway
- 添加 `packages/gateway/src/heartbeat.test.ts`
- 测试 heartbeat callback 是否正确调用 dispatcher

### Commit 3: refactor: remove enableHeartbeat flag from agent config
- 删除 `AgentConfig.enableHeartbeat` 配置项
- Heartbeat 默认启用

### Commit 4: refactor: remove heartbeatChannelId from discord config
- 删除 `DiscordConfig.heartbeatChannelId` 配置项
- 使用 mainUserId/mainChannelId 作为发送目标

### Commit 5: fix: make heartbeat dispatch through dispatcher
- 修改 `setupHeartbeatCallback()` 使用 dispatcher
- 实现完整的 heartbeat 执行闭环

### Commit 6: feat: add heartbeat session key support
- 使用固定 session key `heartbeat`
- 确保 dispatcher 能正确路由

### Commit 7: test: add heartbeat behavioral test
- 添加 `packages/gateway/behavioral-tests/heartbeat.test.ts`
- 端到端测试 heartbeat 执行流程

### Commit 8: docs: update AGENTS.md with heartbeat info
- 更新项目文档，说明 heartbeat 使用方法

## 6. 测试计划

### 6.1 单元测试 (Layer 1)

**文件**: `packages/gateway/src/heartbeat.test.ts`

```typescript
describe("setupHeartbeatCallback", () => {
  it("should dispatch heartbeat instruction when tasks exist", async () => {
    // 模拟有任务
    // 验证 dispatcher.dispatch 被调用
    // 验证指令内容包含 [HEARTBEAT]
  });

  it("should not dispatch when no tasks", async () => {
    // 模拟无任务
    // 验证 dispatcher.dispatch 不被调用
  });

  it("should use 'heartbeat' as session key", async () => {
    // 验证 sessionKey 是 'heartbeat'
  });
});
```

### 6.2 行为测试 (Layer 4)

**文件**: `packages/gateway/behavioral-tests/heartbeat.test.ts`

```typescript
describe("Heartbeat Behavioral", () => {
  it("should execute HEARTBEAT.md tasks and return result", async () => {
    // 1. 创建 HEARTBEAT.md 文件，包含任务
    // 2. 启动 Gateway
    // 3. 手动触发 heartbeat
    // 4. 验证 Agent 执行了任务
    // 5. 验证结果被发送到正确的通道
  });

  it("should skip when HEARTBEAT.md is empty", async () => {
    // 1. 创建空的 HEARTBEAT.md
    // 2. 触发 heartbeat
    // 3. 验证没有调用 Agent
  });
});
```

## 7. 风险与注意事项

### 7.1 成本考虑

Heartbeat 会定期调用 LLM，产生 API 费用。默认间隔 30 分钟。

**建议**：
- 在 HEARTBEAT.md 为空时跳过执行（已实现）
- 考虑添加 `activeHours` 配置，只在工作时间执行
- 日志记录每次执行的 token 消耗

### 7.2 并发安全

Heartbeat 和用户消息可能同时到达。

**解决**：
- 使用 dispatcher 的队列机制
- 设置适当的 priority（heartbeat: 5, user: 10）

### 7.3 错误处理

如果 Agent 执行失败：
- 记录错误日志
- 不阻塞后续 heartbeat
- 考虑重试机制（已有 retry reason）

## 8. 参考文件

| 项目 | 文件 | 说明 |
|------|------|------|
| OpenClaw | `src/infra/heartbeat-runner.ts` | 完整实现参考 |
| OpenClaw-mini | `src/heartbeat.ts` | HeartbeatManager 源码 |
| OpenClaw-mini | `src/agent.ts` | buildTasksPrompt 用法 |
| Deca | `packages/gateway/src/gateway.ts` | 当前实现（需修复） |
| Deca | `packages/agent/src/heartbeat/manager.ts` | HeartbeatManager 复制版 |
