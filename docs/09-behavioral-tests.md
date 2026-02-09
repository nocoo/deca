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

**总计**: 13 个套件，68 个测试用例

---

## 最近运行结果

**运行日期**: 2026-02-09

### 汇总

| 状态 | 套件数 | 百分比 |
|------|--------|--------|
| ✅ 全部通过 | 7 | 54% |
| ❌ 部分失败 | 4 | 31% |
| ⚠️ 超时/无结论 | 2 | 15% |

### 详细结果

| 套件 | 状态 | 通过/总数 | 备注 |
|------|------|-----------|------|
| heartbeat | ✅ PASS | 4/4 | |
| cross-channel-session | ✅ PASS | 10/10 | |
| dispatcher | ✅ PASS | 4/4 | |
| skills | ✅ PASS | 6/6 | |
| autonomy | ✅ PASS | 4/4 | |
| claude-code | ✅ PASS | 2/2 | |
| proactive-search | ✅ PASS | 1/1 | |
| session | ❌ PARTIAL | 7/9 | 持久化测试失败 |
| tools | ❌ PARTIAL | 3/8 | 文件操作工具不稳定 |
| main-session | ❌ PARTIAL | 2/3 | 上下文持久化失败 |
| memory | ❌ PARTIAL | 3/8 | 工具调用不稳定 |
| cron | ⏱️ TIMEOUT | 6/7+ | 持久化测试阶段超时 |
| prompt-cache | ⚠️ INCONCLUSIVE | - | 无缓存统计日志 |

---

## 失败分析

### 1. tools (3/8)

**失败用例**:
- `write: create file` - 文件未创建
- `read: read file content` - 响应中未包含预期内容
- `edit: replace text` - 文本未替换
- `grep: search file content` - 未返回行号
- `exec: git log in external directory` - 未返回 commit 信息

**根因分析**:
- Agent 可能未正确理解指令或未执行工具
- 测试断言过于严格，依赖精确的响应格式

### 2. memory (3/8)

**失败用例**:
- `empty search returns 'no results'` - Agent 未执行搜索
- `memory_get with fake ID returns 'not found'` - Agent 未执行工具
- `auto-saved conversation is searchable` - 记忆未找到
- `memory_get retrieves full content by ID` - 无法提取 ID
- `can distinguish multiple memories` - 无法区分多条记忆

**根因分析**:
- Agent 响应格式不符合测试预期
- 可能需要更明确的 prompt 引导 Agent 使用工具

### 3. session (7/9)

**失败用例**:
- `persistence: user A context survives restart` - 重启后会话丢失
- `persistence: discord channel context survives restart` - 重启后频道会话丢失

**根因分析**:
- 会话持久化逻辑可能存在问题
- 测试环境与生产环境配置差异

### 4. main-session (2/3)

**失败用例**:
- `persistence: main session maintains context` - 上下文未保持

**根因分析**:
- 与 session 持久化问题相关

### 5. cron (6/7+ 超时)

**状态**: 在持久化测试阶段超时

**根因分析**:
- 重启后等待响应时间过长
- 可能需要增加超时时间或优化启动速度

### 6. prompt-cache (无结论)

**状态**: 未检测到缓存统计日志

**根因分析**:
- 需要 `VERBOSE=true` 环境变量
- Gateway 可能未输出缓存统计

---

## 修复优先级

### P0 - 核心功能问题

1. **会话持久化** (session, main-session)
   - 影响用户体验
   - 重启后丢失对话上下文

### P1 - 工具稳定性

2. **文件操作工具** (tools)
   - write/read/edit/grep 不稳定
   - 可能是 prompt 或工具定义问题

3. **记忆系统** (memory)
   - Agent 不主动调用记忆工具
   - 需要优化 prompt 或测试断言

### P2 - 测试基础设施

4. **超时处理** (cron)
   - 增加超时时间
   - 优化重启速度

5. **日志输出** (prompt-cache)
   - 添加 VERBOSE 模式支持
   - 确保缓存统计可观测

---

## 运行指南

### 运行全部测试

```bash
# 依次运行所有行为测试
for test in tools heartbeat main-session cross-channel-session memory \
            dispatcher skills agent-autonomy claude-code cron session \
            prompt-cache proactive-search; do
  echo "Running $test..."
  bun run behavioral-tests/$test.test.ts
done
```

### 运行单个测试

```bash
# 在 packages/gateway 目录下
bun run behavioral-tests/<test-name>.test.ts
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
| 2026-02-09 | ~80% (52/65+) | 初次全量运行记录 |
