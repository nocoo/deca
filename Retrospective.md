# Retrospective

Accident narratives belong here. Keep only recurring project rules in `CLAUDE.md`; cross-project lessons belong in global rules and deterministic checks in hooks/tests.

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
