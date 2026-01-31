## 概要

CoWork-OSS 在 macOS 上的“控制”主要通过两条路径实现：
1) macOS `sandbox-exec` 生成的沙盒配置文件，用于限制 shell 命令的系统调用、网络与文件访问；
2) 系统工具能力（截图、剪贴板、打开应用/路径、AppleScript）用于桌面级操作与自动化。

## 主要方法（按执行路径）

1. macOS sandbox-exec 沙盒执行（命令级隔离）
   - 通过为每个工作区生成 sandbox profile，并在执行命令时调用 `sandbox-exec -f <profile>`。
   - profile 包含文件读写、网络、mach 服务等规则；默认拒绝网络，仅允许 localhost。
   - 代码路径：`src/electron/agent/sandbox/runner.ts`

2. 系统工具（系统级控制能力）
   - 截图：使用 Electron `desktopCapturer`。
   - 打开应用/URL/路径：macOS 走 `open -a` 与 `shell.openExternal/openPath`。
   - AppleScript：通过 `osascript -e` 执行脚本，实现应用与系统自动化。
   - 代码路径：`src/electron/agent/tools/system-tools.ts`

3. 安全策略与权限控制（执行前置门禁）
   - 工具访问按“全局护栏→工作区权限→上下文限制→工具级规则”单调拒绝策略评估。
   - shell 命令默认需要审批，并支持危险命令拦截。
   - 代码路径：`src/electron/security/policy-manager.ts`

## macOS 特殊能力/集成点

- iMessage 通道使用 `imsg` CLI 读取 `chat.db`，要求 Full Disk Access。
- 代码路径：`src/electron/gateway/channels/imessage.ts`

## 经验与注意点（从实现细节抽象）

- 命令执行层面以 macOS sandbox-exec 做最小权限隔离，避免直接裸奔执行。
- AppleScript 作为“系统控制”主工具，需依赖 macOS 权限与系统弹窗授权。
- 安全策略采用“deny-wins”单调规则，确保高优先级拒绝不可被后续规则放开。

## 本次调研范围内未发现

- 直接基于 Accessibility/CGEvent/Quartz 的底层 UI 事件注入。
- 自定义 TCC 权限申请流程（仅看到 AppleScript 与 imsg 对系统权限的依赖描述）。

## 主要参考

- 代码路径：`src/electron/agent/sandbox/runner.ts`
- 代码路径：`src/electron/agent/tools/system-tools.ts`
- 代码路径：`src/electron/security/policy-manager.ts`
- 代码路径：`src/electron/gateway/channels/imessage.ts`
