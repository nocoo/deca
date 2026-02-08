# Deca Project Instructions

> AI Agent 须知

详见 [AGENTS.md](AGENTS.md) 获取完整文档索引。

## 快速参考

- **四层测试**: [docs/04-testing.md](docs/04-testing.md)
- **模块边界**: [docs/02-modules.md](docs/02-modules.md)
- **开发流程**: [docs/03-development.md](docs/03-development.md)

## 核心规则

1. TDD 优先 - 先写测试
2. 90% 覆盖率
3. 原子化提交
4. Gateway 是唯一组装点

## 四层测试 (L1-L4)

### L1: Unit Test (单元测试)
- **特点**: Mock 依赖，快速，隔离
- **运行时机**: pre-commit

```bash
# 全部单元测试
bun run test:unit

# 特定模块
bun --filter @deca/agent test:unit
bun --filter @deca/discord test:unit

# 单个文件
bun test packages/agent/src/core/session.test.ts
```

### L2: Lint (代码检查)
- **特点**: Biome 静态分析
- **运行时机**: pre-commit

```bash
# 全部 lint
bun run lint

# 特定模块
bun --filter @deca/agent lint
```

### L3: E2E Test (端到端测试)
- **特点**: Echo 模式，验证通道集成，无真实 LLM
- **运行时机**: pre-push

```bash
# 全部 E2E
bun --filter '@deca/*' test:e2e

# 特定模块
bun --filter @deca/agent test:e2e      # Memory + Cron
bun --filter @deca/discord test:e2e    # Discord 通道
bun --filter @deca/gateway test:e2e    # Gateway 集成
bun --filter @deca/http test:e2e       # HTTP API
bun --filter @deca/terminal test:e2e   # Terminal REPL
bun --filter @deca/storage test:e2e    # Storage 层
```

### L4: Behavioral Test (行为测试)
- **特点**: 真实 LLM + 真实 Discord，验证 Agent 行为
- **运行时机**: 手动/CI
- **依赖**: `~/.deca/credentials/` 下的凭证文件

```bash
# 全部行为测试
bun --filter @deca/gateway test:behavioral

# 特定行为测试
bun --filter @deca/gateway test:behavioral:memory

# Debug 模式 (显示 Bot 输出)
cd packages/gateway && bun run behavioral-tests/tools.test.ts --debug
cd packages/gateway && bun run behavioral-tests/session.test.ts --debug
```

**行为测试文件** (`packages/gateway/behavioral-tests/`):
| 文件 | 验证内容 |
|------|----------|
| `tools.test.ts` | Agent 工具使用 (write, read, edit, exec, list, grep) |
| `session.test.ts` | Session 隔离和持久化 |
| `memory.test.ts` | 记忆系统 |
| `cron.test.ts` | 定时任务 |
| `skills.test.ts` | Skill 加载 |

## Retrospective

### 2026-02-07: claude_code 工具行为测试

**问题**: 行为测试中，Agent 调用 `claude_code` 后文件创建成功，但测试验证失败。

**根因**: 测试在收到 Agent 响应后立即验证文件存在性，但 `claude_code` 工具的文件写入可能还未完成（异步时序问题）。

**解决**: 在验证前添加 3 秒等待时间，确保文件操作完成。

**经验**: 
1. 涉及外部进程（如 Claude CLI）的测试需要考虑异步完成时间
2. Agent 会智能选择工具 —— 对于简单任务优先使用轻量内置工具，只有复杂任务才会调用"重型"工具
3. 测试失败时先检查实际结果（文件是否真的存在），再判断是逻辑错误还是时序问题

### 2026-02-07: references 目录搜索范围

**问题**: 搜索代码时意外匹配到 `references/` 目录下的参考项目代码，导致混淆。

**规则**: `references/` 目录存放参考项目代码，仅用于调研学习，不属于本项目代码。搜索时应排除此目录，除非明确要求调研参考项目。

### 2026-02-08: 多实例 Gateway 导致 Discord 重复回复

**问题**: Discord E2E 测试频道出现重复回复（同一消息被两个 bot 实例响应）。

**根因**: 
1. `cli.ts` 缺少 lock 机制，而 `serve.ts` 有 lock
2. `spawner.ts` 继承了父进程的测试环境变量 (`VITEST`, `NODE_ENV=test`)，导致子进程的 lock 被跳过
3. 旧的 Gateway 进程残留（在添加 lock 之前启动），与新进程同时连接 Discord

**解决**:
1. 在 `cli.ts` 中添加 `acquireGatewayLock()` 调用
2. 在 `spawner.ts` 中清除测试环境变量，让子进程能正确获取 lock
3. 杀掉残留的旧进程

**经验**:
1. 所有 Gateway 入口点（`cli.ts`, `serve.ts`）都必须使用 lock 机制
2. Spawner 启动子进程时需要清理测试相关环境变量，否则子进程会继承"测试模式"行为
3. 调试重复响应问题时，先用 `ps aux | grep` 检查是否有多个进程在运行
4. Lock 文件位置: `~/.deca/run/gateway.lock`
