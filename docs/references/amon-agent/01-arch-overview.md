## 概要

Amon-Agent 在 macOS 上的“控制”主要体现在：
1) 通过 Claude Agent SDK + Claude Code CLI 执行命令与工具调用；
2) 权限与审批机制在 Electron 主进程内统一调度；
3) 运行时在 macOS 需要处理工作空间访问权限（Full Disk Access）导致的执行失败。
代码库中未见直接基于 macOS Accessibility/CGEvent/Quartz 的 UI 自动化实现。

## 主要方法（按执行路径）

1. Agent 执行与 CLI 运行时（核心执行路径）
   - 使用 Claude Agent SDK `query`，并通过 `pathToClaudeCodeExecutable` 指向 CLI。
   - 预检查运行环境，捕获 macOS 权限错误并提示 Full Disk Access。
   - 代码路径：`src/main/agent/agentService.ts`

2. 权限/审批与交互
   - 所有工具调用由 PermissionManager 统一请求用户批准。
   - 支持 AskUserQuestion 与计划审批。
   - 代码路径：`src/main/agent/permissionManager.ts`

3. 打包与 CLI/运行时资源解析
   - 解析 Claude Code CLI 路径（处理 app.asar / unpacked）。
   - 打包 bun/uv 的路径与 PATH 增强策略。
   - 代码路径：`src/main/agent/config.ts`

## macOS 打包/权限相关要点

- macOS 未签名应用需 `xattr -cr /Applications/Amon.app` 移除隔离属性。
- macOS 工作空间权限不足时提示用户授予“完全磁盘访问权限”。
- 代码路径：`README.md`, `src/main/agent/agentService.ts`

## 经验与注意点（从实现细节抽象）

- 执行路径依赖 Claude Code CLI，因此需要稳定的 CLI 路径解析与运行时环境构建。
- 权限失败（macOS TCC）会导致 CLI 预检查失败，需明确提示用户配置 Full Disk Access。
- 权限/审批集中管理，避免各工具分散处理。

## 本次调研范围内未发现

- 直接基于 AppleScript/Accessibility 的系统自动化代码。
- macOS 原生 sandbox-exec 或 Seatbelt 级别隔离实现。

## 主要参考

- 代码路径：`src/main/agent/agentService.ts`
- 代码路径：`src/main/agent/permissionManager.ts`
- 代码路径：`src/main/agent/config.ts`
- 代码路径：`README.md`
