## 概要

Amon-Agent 在 macOS 的“控制”能力主要体现为：
1) 通过 Claude Agent SDK 驱动 Claude Code CLI 执行命令与工具调用；
2) 主进程集中式权限审批（permission manager）；
3) 对 macOS 工作空间权限不足的显式检测与提示。
未见 OS 级沙箱或 AppleScript/Accessibility 级 UI 自动化实现。

## 能力清单（按控制层面）

1. CLI 驱动执行
   - `query` 通过 `pathToClaudeCodeExecutable` 运行 Claude Code CLI。
   - `cwd` 设为工作空间，命令执行围绕 workspace 展开。
   - 代码路径：`src/main/agent/agentService.ts`

2. 权限审批与交互
   - 所有工具调用进入 PermissionManager 进行审批、超时处理与用户反馈。
   - 支持 AskUserQuestion 与 PlanApproval 流程。
   - 代码路径：`src/main/agent/permissionManager.ts`

3. 运行时环境与打包路径
   - CLI 路径解析支持 app.asar/unpacked。
   - 打包 bun/uv 的路径注入与增强 PATH。
   - 代码路径：`src/main/agent/config.ts`

## macOS 特有控制点

- CLI 预检查失败时捕获 `Operation not permitted`，提示开启“完全磁盘访问权限”。
- 未见 macOS 事件注入、AppleScript 或系统级沙箱调用。
- 代码路径：`src/main/agent/agentService.ts`

## 注意点与经验

- 能力边界取决于 Claude Code CLI 可调用的工具集合与权限策略。
- 对工作空间的访问能力依赖 macOS TCC 配置，需显式提示用户配置权限。

## 主要参考

- 代码路径：`src/main/agent/agentService.ts`
- 代码路径：`src/main/agent/permissionManager.ts`
- 代码路径：`src/main/agent/config.ts`
