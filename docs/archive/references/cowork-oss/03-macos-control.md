## 概要

CoWork-OSS 在 macOS 的“控制”能力集中在三类：
1) 受控命令执行（sandbox-exec profile）；
2) 系统级工具（截图、剪贴板、打开应用/路径、AppleScript）；
3) macOS 专有通道（iMessage 通过 imsg CLI）。

## 能力清单（按控制层面）

1. 命令执行沙箱（sandbox-exec）
   - macOS 使用 `sandbox-exec -f <profile>` 进行系统调用过滤。
   - 默认拒绝网络，仅允许 localhost；可依据 workspace 权限开放。
   - 代码路径：`src/electron/agent/sandbox/runner.ts`

2. 系统级工具（SystemTools）
   - 截图：`desktopCapturer` 捕获屏幕并保存到 workspace。
   - 剪贴板：读写系统剪贴板。
   - 打开应用：macOS 使用 `open -a`。
   - 打开 URL/路径/定位文件：`shell.openExternal/openPath/showItemInFolder`。
   - AppleScript：`osascript -e` 运行脚本，支持应用与系统自动化。
   - 代码路径：`src/electron/agent/tools/system-tools.ts`

3. iMessage 通道
   - 使用 `imsg` CLI 访问 Messages 数据库，实现消息收发与监听。
   - 需要 macOS Full Disk Access 访问 `~/Library/Messages/chat.db`。
   - 代码路径：`src/electron/gateway/channels/imessage.ts`

## 权限与策略约束

- 安全策略采用“deny-wins”分层评估，限制高风险工具与命令。
- shell 命令需要审批，危险模式命令默认阻断。
- 代码路径：`src/electron/security/policy-manager.ts`

## macOS 特有注意点

- AppleScript 依赖 TCC 权限与系统弹窗授权。
- iMessage 通道依赖 Full Disk Access，否则无法读取消息数据库。

## 主要参考

- 代码路径：`src/electron/agent/sandbox/runner.ts`
- 代码路径：`src/electron/agent/tools/system-tools.ts`
- 代码路径：`src/electron/gateway/channels/imessage.ts`
- 代码路径：`src/electron/security/policy-manager.ts`
