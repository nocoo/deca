# OpenClaw Mini vs OpenClaw 架构对比报告

本文档详细对比 OpenClaw Mini（教学简化版）与 OpenClaw（生产级完整版）的架构差异，帮助理解 AI Agent 系统的核心设计模式。

## 项目概览

| 维度 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **定位** | 教学用极简复现 | 生产级 Agent 系统 |
| **代码规模** | ~4,700 行 TypeScript | ~50,000+ 行 TypeScript |
| **核心代码** | ~800 行（5 大子系统） | 完整实现 |
| **依赖** | `@anthropic-ai/sdk` (1 个) | 50+ 依赖 |
| **Node 版本** | >= 20 | >= 22.12.0 |
| **LLM Provider** | Anthropic Claude | Anthropic, OpenAI, Gemini, Bedrock, Local |
| **平台** | CLI only | CLI, macOS App, iOS, Android, Web UI |
| **消息渠道** | 无 | WhatsApp, Telegram, Discord, Slack, Signal, iMessage 等 |

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Mini                                  │
│                            (~800 行核心代码)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │   Context   │  │   Skills    │  │           Heartbeat                 │  │
│  │   Loader    │  │   Manager   │  │           Manager                   │  │
│  │             │  │             │  │  ┌─────────────────────────────┐    │  │
│  │ AGENTS.md   │  │ SKILL.md    │  │  │ HeartbeatWake (请求合并层)  │    │  │
│  │ SOUL.md     │  │ 触发词匹配  │  │  └─────────────┬───────────────┘    │  │
│  │ TOOLS.md... │  │ 内置+自定义 │  │                │                    │  │
│  └──────┬──────┘  └──────┬──────┘  │  ┌─────────────▼───────────────┐    │  │
│         │                │         │  │ HeartbeatRunner (调度层)    │    │  │
│         │                │         │  └─────────────┬───────────────┘    │  │
│         │                │         └────────────────┼────────────────────┘  │
│         │                │                          │                       │
│         ▼                ▼                          ▼                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           Agent Loop                                  │  │
│  │   while (tool_calls) { response = llm.generate(); tool.execute(); }   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│         │                                                    │              │
│         ▼                                                    ▼              │
│  ┌─────────────┐                                    ┌─────────────┐        │
│  │   Session   │                                    │   Memory    │        │
│  │   Manager   │                                    │   Manager   │        │
│  │  (JSONL)    │                                    │ (关键词检索) │        │
│  └─────────────┘                                    └─────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心子系统对比

### 1. Session Manager - 会话持久化

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **存储格式** | JSONL 文件 | JSONL 文件 |
| **并发控制** | 无 | 分布式锁 (`proper-lockfile`) |
| **历史压缩** | 简单 compaction | 自动 compaction + 摘要生成 |
| **多 Agent** | 单一 Agent | 多 Agent + 子 Agent |
| **代码规模** | ~206 行 | ~500 行 |

**Mini 版实现** (`session.ts`):
```typescript
async append(sessionId: string, message: Message): Promise<void> {
  const filePath = this.getFilePath(sessionId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(message) + "\n");
}
```

**OpenClaw 增强点**:
- 分布式锁防止多进程并发写入
- 会话元数据管理（创建时间、最后活跃等）
- 跨设备同步支持

---

### 2. Memory Manager - 长期记忆

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **存储后端** | JSON 文件 | SQLite + sqlite-vec |
| **向量搜索** | ❌ 不支持 | ✅ `vec_distance_cosine` |
| **Embedding** | ❌ 不支持 | OpenAI / Gemini / Local (llama.cpp) |
| **关键词搜索** | `includes()` 匹配 | FTS5 BM25 全文搜索 |
| **Hybrid Search** | ❌ | ✅ vector × 0.7 + text × 0.3 |
| **Chunking** | 整文件存储 | Token 级分块 + 重叠 |
| **增量同步** | 简单覆盖 | 文件 hash 对比 + 增量更新 |
| **代码规模** | ~178 行 | ~3,500+ 行 |

**Mini 版搜索** (`memory.ts`):
```typescript
async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
  const queryTerms = query.toLowerCase().split(/\s+/);
  for (const entry of this.entries) {
    let score = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) score += 1;
      if (entry.tags.some(t => t.includes(term))) score += 0.5;
    }
    // 时间衰减
    const recencyBoost = Math.max(0, 1 - ageHours / (24 * 30));
    score += recencyBoost * 0.3;
  }
}
```

**OpenClaw Hybrid Search** (`hybrid.ts`):
```typescript
export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;  // 默认 0.7
  textWeight: number;    // 默认 0.3
}): Array<MergedResult> {
  // 加权求和
  const score = vectorWeight * entry.vectorScore + textWeight * entry.textScore;
}
```

---

### 3. Context Loader - 按需上下文

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **Bootstrap 文件** | 8 种 | 8 种 + 动态扩展 |
| **文件类型** | AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md | 同左 + 插件注入 |
| **截断策略** | head + tail 截断 | head + tail + 标记 |
| **子代理限制** | 仅 AGENTS.md + TOOLS.md | 同左 |
| **代码规模** | ~99 行 | ~300+ 行 |

**Bootstrap 文件说明**:

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | Agent 行为规范和指令 |
| `SOUL.md` | Agent 个性和对话风格 |
| `TOOLS.md` | 可用工具列表和使用说明 |
| `IDENTITY.md` | Agent 身份信息 |
| `USER.md` | 用户偏好设置 |
| `HEARTBEAT.md` | 主动唤醒任务列表 |
| `BOOTSTRAP.md` | 启动时执行的指令 |
| `MEMORY.md` | 长期记忆补充 |

---

### 4. Context Pruning & Compaction - 上下文压缩

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **Pruning** | 软裁剪 tool_result | 多策略裁剪 |
| **Compaction** | 阈值触发摘要 | 智能摘要 + 多级压缩 |
| **Token 计算** | 估算 (chars/4) | 精确 tokenizer |
| **保留策略** | 最近 N 条 | 重要性评分 + 最近 |
| **代码规模** | ~667 行 | ~830+ 行 |

**Mini 版 Pruning** (`pruning.ts`):
```typescript
// 软裁剪：保留结构，截断长内容
if (block.type === "tool_result" && typeof block.content === "string") {
  if (block.content.length > MAX_TOOL_RESULT_CHARS) {
    return { ...block, content: truncate(block.content, MAX_TOOL_RESULT_CHARS) };
  }
}
```

**Mini 版 Compaction** (`compaction.ts`):
```typescript
// 当历史过长时，生成摘要替代旧消息
if (estimatedTokens > threshold) {
  const summary = await generateSummary(client, model, oldMessages);
  return { summaryMessage: { role: "user", content: `[历史摘要]\n${summary}` } };
}
```

---

### 5. Skills Manager - 技能系统

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **技能定义** | SKILL.md frontmatter | SKILL.md + 完整 metadata |
| **触发机制** | 关键词/触发词匹配 | LLM 语义理解 |
| **技能来源** | 工作区 skills/ | bundled + managed + workspace + plugins |
| **资格过滤** | 无 | 平台/二进制/环境变量/配置 |
| **安装支持** | ❌ | brew/node/go/uv/download |
| **热更新** | ❌ | ✅ chokidar 监视 |
| **代码规模** | ~284 行 | ~2,000+ 行 |

**Mini 版触发匹配** (`skills.ts`):
```typescript
async match(input: string): Promise<SkillMatch | null> {
  for (const skill of this.skills.values()) {
    for (const trigger of skill.triggers) {
      if (input.startsWith(trigger)) {
        return { skill, matchedTrigger: trigger };
      }
    }
  }
}
```

**OpenClaw 语义触发**:
- 技能 description 注入系统提示词
- LLM 自主判断是否使用技能
- 支持 `/skill <name>` 显式调用

**OpenClaw 技能过滤** (`config.ts`):
```typescript
function shouldIncludeSkill({ entry, config, eligibility }) {
  // 1. 配置禁用检查
  if (skillConfig?.enabled === false) return false;
  // 2. 平台过滤 (darwin/linux/win32)
  if (!osList.includes(process.platform)) return false;
  // 3. 必需二进制检查
  for (const bin of requiredBins) {
    if (!hasBinary(bin)) return false;
  }
  // 4. 环境变量检查
  for (const envName of requiredEnv) {
    if (!process.env[envName]) return false;
  }
  return true;
}
```

---

### 6. Heartbeat Manager - 主动唤醒

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **架构** | 单层调度 | 双层 (Wake + Runner) |
| **请求合并** | 简单防抖 | 250ms 窗口合并 + 优先级 |
| **触发源** | interval | interval/cron/exec/hook/requested |
| **活跃时间** | 简单时间范围 | 时区感知 + 跨午夜 |
| **重复抑制** | 24h 内相同消息 | 同左 + 可配置 |
| **可见性控制** | ❌ | 按渠道/账户配置 |
| **代码规模** | ~625 行 | ~1,500+ 行 |

**Mini 版调度** (`heartbeat.ts`):
```typescript
private schedule(delayMs: number): void {
  // 双重缓冲：运行中收到新请求不丢失
  if (this.state.running) {
    this.state.scheduled = true;
    return;
  }
  if (this.state.timer) return;
  this.state.timer = setTimeout(() => this.execute(), delayMs);
}
```

**OpenClaw HeartbeatWake** (`heartbeat-wake.ts`):
```typescript
// 请求合并层
const DEFAULT_COALESCE_MS = 250;  // 合并窗口
const DEFAULT_RETRY_MS = 1_000;    // 繁忙重试间隔

function schedule() {
  if (running) { scheduled = true; return; }  // 并发锁
  if (result === "requests-in-flight") {
    setTimeout(schedule, DEFAULT_RETRY_MS);   // 繁忙重试
  }
}
```

**OpenClaw 活跃时间检查** (`heartbeat-runner.ts`):
```typescript
function isWithinActiveHours(config, timezoneResolver) {
  const { start, end, timezone } = config.activeHours;
  const currentMin = resolveMinutesInTimeZone(timezone);
  
  if (endMin > startMin) {
    // 正常: 09:00-18:00
    return currentMin >= startMin && currentMin < endMin;
  }
  // 跨午夜: 22:00-06:00
  return currentMin >= startMin || currentMin < endMin;
}
```

---

### 7. Tools System - 工具系统

| 特性 | OpenClaw Mini | OpenClaw |
|------|---------------|----------|
| **内置工具数** | ~10 个 | 50+ 个 |
| **工具类型** | 文件/执行/记忆 | 文件/执行/网络/媒体/浏览器等 |
| **沙箱模式** | 简单开关 | 完整沙箱容器 |
| **工具策略** | deny/allow 列表 | 细粒度权限控制 |
| **代码规模** | ~616 行 | 大量分散文件 |

**Mini 版内置工具** (`tools/builtin.ts`):
- `read_file` - 读取文件
- `write_file` - 写入文件
- `list` - 列出目录
- `exec` - 执行命令
- `search` - 搜索文件内容
- `edit` - 编辑文件
- `memory_search` - 搜索记忆
- `memory_get` - 获取记忆详情
- `memory_add` - 添加记忆
- `sessions_spawn` - 启动子代理

---

## 文件映射表

| Mini 文件 | 行数 | OpenClaw 对应 | 规模 |
|-----------|------|---------------|------|
| `agent.ts` | 793 | `src/agents/pi-embedded-runner/run.ts` | ~700 |
| `session.ts` | 206 | `src/agents/session-manager.ts` | ~500 |
| `memory.ts` | 178 | `src/memory/manager.ts` | ~2,400 |
| `context/loader.ts` | 99 | `src/agents/bootstrap-files.ts` | ~300 |
| `context/pruning.ts` | 237 | `src/agents/pi-extensions/context-pruning/pruner.ts` | ~450 |
| `context/compaction.ts` | 430 | `src/agents/compaction.ts` | ~380 |
| `skills.ts` | 284 | `src/agents/skills/` | ~2,000 |
| `heartbeat.ts` | 625 | `src/infra/heartbeat-runner.ts` + `heartbeat-wake.ts` | ~1,500 |
| `tools/*.ts` | 616 | `src/tools/` | 50+ 工具 |

---

## 设计哲学差异

### OpenClaw Mini - 教学优先

1. **可读性 > 完整性** - 每个文件都能独立理解
2. **核心概念 > 边缘情况** - 只实现主要路径
3. **简单依赖 > 最优性能** - 使用 JSON 而非 SQLite
4. **单一职责 > 高度集成** - 模块边界清晰

### OpenClaw - 生产优先

1. **健壮性** - 完整的错误处理和重试逻辑
2. **可扩展性** - 插件系统、多渠道支持
3. **性能** - 向量数据库、批量 Embedding、增量同步
4. **可配置性** - 多层配置覆盖、热更新
5. **多平台** - CLI + 桌面应用 + 移动应用 + Web

---

## 学习路径建议

### 初学者
1. 从 `agent.ts` 开始 - 理解 Agent Loop 基本模式
2. 阅读 `session.ts` - 理解会话持久化
3. 学习 `context/loader.ts` - 理解上下文注入

### 进阶
1. 研究 `heartbeat.ts` - 理解事件驱动调度
2. 对比 `memory.ts` vs OpenClaw 的 Hybrid Search
3. 分析 `context/compaction.ts` - 理解 Token 优化

### 深入
1. 阅读 OpenClaw 的 `src/memory/` 目录 - 学习向量搜索
2. 研究 `src/agents/skills/` - 理解语义触发设计
3. 分析多渠道路由 `src/routing/` - 学习消息分发

---

## 参考资源

- [OpenClaw Mini 源码](../../../references/openclaw-mini/)
- [OpenClaw 源码](../../../references/openclaw/)
- [OpenClaw 官方文档](https://docs.openclaw.ai/)
