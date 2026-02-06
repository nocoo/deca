# Discord E2E 闭环测试

> 本文档记录通过 Discord Webhook 进行端到端 Agent 测试的方法论，用于自动化验证 Agent 的完整行为链路。

## 概述

Discord E2E 测试模块允许我们：

1. **模拟真实用户输入** - 通过 Webhook 发送消息到真实 Discord 频道
2. **验证 Agent 响应** - 轮询频道获取 Bot 回复，检查内容正确性
3. **测试完整链路** - 消息 → Discord → Bot → Agent (LLM) → Bot → Discord → 验证

这套方法特别适合需要经过大模型处理的场景，可以由 AI Agent 设计测试问题、发送、等待响应、验证结果，形成完整的自动化调试闭环。

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         E2E Test Runner                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐ │
│  │   spawner    │     │   webhook    │     │      fetcher         │ │
│  │              │     │              │     │                      │ │
│  │  启动/停止    │     │  发送测试消息 │     │  轮询验证响应         │ │
│  │  Bot 进程     │     │  (模拟用户)   │     │  (检查 Bot 回复)      │ │
│  └──────┬───────┘     └──────┬───────┘     └──────────┬───────────┘ │
│         │                    │                        │              │
└─────────┼────────────────────┼────────────────────────┼──────────────┘
          │                    │                        │
          ▼                    ▼                        ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     Discord Server (真实环境)                  │
    │                                                               │
    │   Webhook ──发送──▶ #test-channel ◀──读取── Bot Token API     │
    │                          │                                    │
    │                          ▼                                    │
    │                    Discord Bot                                │
    │                          │                                    │
    │                          ▼                                    │
    │                    Agent (LLM)                                │
    │                          │                                    │
    │                          ▼                                    │
    │                    Bot 发送响应                                │
    └───────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. webhook.ts - 消息发送

通过 Discord Webhook 发送测试消息，模拟用户输入。

```typescript
import { sendWebhookMessage, generateTestId, createTestMessage } from "./e2e";

// 生成唯一测试 ID (格式: e2e-<timestamp>-<random>)
const testId = generateTestId();  // "e2e-m2k8x9-a3b7c2"

// 创建带 ID 的测试消息
const message = createTestMessage(testId, "请帮我计算 2+2");
// → "[e2e-m2k8x9-a3b7c2] 请帮我计算 2+2"

// 发送到 Discord
const result = await sendWebhookMessage(
  { url: webhookUrl },
  { content: message }
);

// result.id = 发送的消息 ID (用于后续验证 reactions)
// result.success = true/false
```

**关键设计：Test ID**

每条测试消息都嵌入唯一 ID `[e2e-xxx-yyy]`，用于：
- 在海量频道消息中精确匹配 Bot 响应
- 支持并发测试（不同测试使用不同 ID）
- 验证响应关联性（确保响应的是正确的请求）

### 2. fetcher.ts - 响应验证

通过 Bot Token 调用 Discord API 轮询频道消息。

```typescript
import { waitForBotResponse, waitForReaction, extractTestId } from "./e2e";

// 等待 Bot 响应（带超时和轮询）
const response = await waitForBotResponse(
  { botToken, channelId },
  testId,
  {
    timeout: 15000,   // 最长等待 15 秒
    interval: 1000,   // 每秒轮询一次
    botUserId: clientId, // clientId 即 Bot User ID
  }
);

if (response) {
  // 验证响应内容
  const extractedId = extractTestId(response.content);
  assert(extractedId === testId, "响应关联正确");
  assert(response.content.includes("4"), "计算结果正确");
}

// 等待特定 Reaction（如确认处理状态）
const hasCheck = await waitForReaction(
  { botToken, channelId },
  messageId,
  { emoji: "✅", timeout: 5000 }
);
```

### 3. spawner.ts - 进程管理

自动启动/停止 Bot 子进程，支持不同测试配置。

```typescript
import { spawnBot, getApiDir } from "./e2e";

// 启动 Bot（echo 模式，用于基础测试）
const bot = await spawnBot({
  cwd: getApiDir(),
  mode: "echo",        // "echo" | "agent"
  debounce: false,     // 是否启用消息合并
  allowBots: true,     // 允许处理 webhook 消息
  startupTimeout: 15000,
  debug: false,
});

console.log(`Bot started (PID: ${bot.pid})`);

// ... 运行测试 ...

// 清理
await bot.stop();
```

**模式说明：**

| 模式 | 用途 | Agent 调用 |
|------|------|-----------|
| `echo` | 基础连通性测试 | 无 (直接回显) |
| `agent` | 完整 Agent 测试 | 是 (调用 LLM) |

### 4. runner.ts - 测试编排

组织 Test Suites，每个 Suite 可以有独立的 Bot 配置。

```typescript
// 定义测试套件
const basicSuite = suite("Basic Bot Functionality", false); // debounce=false

basicSuite.tests.push({
  name: "bot responds to messages",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "hello");
    
    // 发送
    await sendWebhookMessage({ url: config.webhookUrl }, { content: message });
    
    // 等待响应
    const response = await waitForBotResponse(
      { botToken: config.botToken, channelId: config.testChannelId },
      testId,
      { timeout: 15000 }
    );
    
    // 验证
    if (!response) {
      throw new Error("Bot did not respond");
    }
  },
});
```

## 凭证配置

E2E 测试需要真实的 Discord 凭证，存储在 `~/.deca/credentials/discord.json`：

```json
{
  "botToken": "Bot Token (用于 API 认证)",
  "clientId": "Application ID (用于 Slash Commands 和 Bot User ID 过滤)",
  "webhookUrl": "Webhook URL (用于发送测试消息)",
  "testChannelId": "测试频道 ID",
  "guildId": "服务器 ID (用于 Guild 级别命令注册)"
}
```

**获取方式：**

1. **botToken**: Discord Developer Portal → Application → Bot → Token
2. **clientId**: Discord Developer Portal → Application → General Information → Application ID (同时也是 Bot 的 User ID)
3. **webhookUrl**: 服务器设置 → 集成 → Webhooks → 创建 Webhook
4. **testChannelId**: 开启开发者模式 → 右键频道 → 复制 ID
5. **guildId**: 开启开发者模式 → 右键服务器 → 复制 ID

## 测试场景

### 场景 1: 基础连通性 (Echo Mode)

验证消息收发链路正常，无需 LLM 调用。

```typescript
{
  name: "webhook → bot → echo response",
  fn: async ({ config }) => {
    const testId = generateTestId();
    await sendWebhookMessage(...);
    const response = await waitForBotResponse(...);
    assert(response.content.includes(testId));
  }
}
```

### 场景 2: Reaction 状态确认

验证 Bot 通过 Reaction 表示处理状态。

```typescript
{
  name: "bot adds 👀 when receiving, ✅ when done",
  fn: async ({ config }) => {
    const result = await sendWebhookMessage(...);
    
    // 收到消息时应添加 👀
    const hasEyes = await waitForReaction(..., { emoji: "👀" });
    assert(hasEyes, "Should add 👀 on receive");
    
    // 处理完成后应替换为 ✅
    await waitForBotResponse(...);
    const hasCheck = await waitForReaction(..., { emoji: "✅" });
    assert(hasCheck, "Should add ✅ on success");
  }
}
```

### 场景 3: 消息 Debounce (合并)

验证连续快速消息被正确合并处理。

```typescript
{
  name: "rapid messages are debounced",
  fn: async ({ config }) => {
    const testId = generateTestId();
    
    // 快速发送 3 条消息（在 debounce 窗口内）
    for (const part of ["part 1", "part 2", "part 3"]) {
      await sendWebhookMessage(..., createTestMessage(testId, part));
      await sleep(500);
    }
    
    // 等待 debounce + 处理
    await sleep(5000);
    
    // 验证：应该只有 1 条合并响应
    const messages = await fetchChannelMessages(...);
    const responses = messages.filter(m => m.content.includes(testId) && m.author.bot);
    assert(responses.length < 3, "Should debounce to fewer responses");
  }
}
```

### 场景 4: Agent 完整链路 (LLM Mode)

验证完整的 Agent 处理流程，包括 LLM 调用。

```typescript
{
  name: "agent processes and responds correctly",
  fn: async ({ config }) => {
    const testId = generateTestId();
    const message = createTestMessage(testId, "What is 2 + 2?");
    
    await sendWebhookMessage(...);
    
    const response = await waitForBotResponse(..., {
      timeout: 30000, // LLM 可能需要更长时间
    });
    
    assert(response, "Agent should respond");
    assert(response.content.includes("4"), "Should contain correct answer");
  }
}
```

## AI Agent 自动化调试

这套 E2E 框架的核心价值在于支持 **AI Agent 自主调试 AI Agent**：

### 工作流

```
┌───────────────────────────────────────────────────────────────────┐
│                    AI Agent (调试者)                               │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. 设计测试场景                                                    │
│     → "测试 Agent 对数学问题的处理能力"                              │
│                                                                    │
│  2. 生成测试消息                                                    │
│     → createTestMessage(testId, "计算 123 × 456 的结果")           │
│                                                                    │
│  3. 通过 Webhook 发送                                               │
│     → sendWebhookMessage(...)                                      │
│                                                                    │
│  4. 等待目标 Agent 响应                                             │
│     → waitForBotResponse(...)                                      │
│                                                                    │
│  5. 验证响应正确性                                                  │
│     → 检查是否包含 "56088"                                          │
│                                                                    │
│  6. 发现问题 → 分析 → 修复 → 重新测试                                │
│     → 形成自动化调试闭环                                            │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

### 典型调试场景

| 场景 | 测试内容 | 验证方法 |
|------|---------|---------|
| 基础响应 | Agent 是否正常回复 | 检查响应存在 |
| 内容质量 | 回答是否正确/合理 | 内容匹配/语义分析 |
| 工具调用 | 是否正确使用工具 | 检查工具调用日志 |
| 错误处理 | 异常输入的处理 | 检查优雅降级 |
| 性能 | 响应时间 | 计时比较 |
| 状态管理 | 多轮对话上下文 | 连续问答验证 |

### 代码示例：自动化调试循环

```typescript
// AI Agent 可以这样使用这套工具进行自动化调试

async function debugAgentMathCapability() {
  const testCases = [
    { input: "2 + 2", expected: "4" },
    { input: "10 × 10", expected: "100" },
    { input: "144 的平方根", expected: "12" },
  ];
  
  const results = [];
  
  for (const tc of testCases) {
    const testId = generateTestId();
    
    // 发送测试
    await sendWebhookMessage(
      { url: webhookUrl },
      { content: createTestMessage(testId, tc.input) }
    );
    
    // 等待响应
    const response = await waitForBotResponse(
      { botToken, channelId },
      testId,
      { timeout: 30000 }
    );
    
    // 验证
    const passed = response?.content.includes(tc.expected);
    results.push({
      input: tc.input,
      expected: tc.expected,
      actual: response?.content,
      passed,
    });
  }
  
  // 分析结果，决定下一步调试方向
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log("Failed cases:", failures);
    // → 进一步分析问题，调整 Agent 实现
  }
}
```

## 运行测试

```bash
# 运行完整 E2E 测试
bun run packages/discord/src/e2e/runner.ts

# Debug 模式（显示 Bot 输出）
bun run packages/discord/src/e2e/runner.ts --debug
```

## 最佳实践

### 1. 测试隔离

每个测试使用独立的 `testId`，确保并发测试不会相互干扰。

### 2. 超时设置

- Echo 模式：5-10 秒
- Agent 模式（LLM）：15-30 秒
- 包含工具调用：30-60 秒

### 3. 清理策略

每个 Test Suite 运行完毕后调用 `bot.stop()` 清理进程。

### 4. 失败诊断

测试失败时记录：
- 发送的消息内容
- 期望的响应
- 实际收到的响应（如果有）
- 超时时间

### 5. Flaky Test 处理

网络和 Discord API 可能不稳定，对于 Flaky 测试：
- 增加重试机制
- 放宽超时时间
- 使用更宽松的匹配条件

## 相关文档

- [测试规范](04-testing.md) - 通用测试策略
- [Discord 模块](modules/discord.md) - Discord 集成详解
- [开发指南](03-development.md) - 本地开发环境

## 文件索引

```
packages/discord/src/e2e/
├── index.ts          # 模块导出
├── webhook.ts        # Webhook 消息发送
├── webhook.test.ts   # Webhook 单元测试
├── fetcher.ts        # 频道消息获取
├── fetcher.test.ts   # Fetcher 单元测试
├── spawner.ts        # Bot 进程管理
└── runner.ts         # E2E 测试运行器
```
