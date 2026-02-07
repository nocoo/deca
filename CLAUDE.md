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
