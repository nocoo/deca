## 概要

CoWork-OSS 的沙箱机制主要依赖 macOS `sandbox-exec` 生成的动态 profile，实现命令执行的系统调用过滤、网络与文件访问限制。未启用 sandbox-exec 的平台会退回到常规 shell 执行，但仍保留资源与输出限制。

## 核心机制

1. SandboxRunner 生命周期
   - 按 workspace 初始化并生成 sandbox profile。
   - 在 macOS 上使用 `sandbox-exec -f <profile>` 包裹执行。
   - 代码路径：`src/electron/agent/sandbox/runner.ts`

2. 受限环境
   - 仅透传有限环境变量（PATH/HOME/USER/TERM 等）。
   - PATH 仅包含系统标准路径，并在 macOS 增加 Homebrew 路径。
   - 代码路径：`src/electron/agent/sandbox/runner.ts`

3. 资源控制
   - 超时强制终止（SIGKILL）。
   - stdout/stderr 输出上限（默认 100KB），超出截断。
   - 代码路径：`src/electron/agent/sandbox/runner.ts`

## macOS sandbox-exec Profile 规则

- 默认 `deny`，仅放通必要的系统访问与工作区访问。
- 读权限：系统路径（/usr/bin, /System 等）与 workspace 读取。
- 写权限：workspace 写入 + 临时目录写入。
- 网络：默认拒绝，仅允许 localhost；若 workspace.network 开启则允许全量网络。
- 允许必要的 mach-lookup 服务。
- 代码路径：`src/electron/agent/sandbox/runner.ts`

## 路径与权限约束

- 执行前验证 cwd 是否在允许路径范围内；不在则拒绝。
- workspace 权限允许扩展 read/write 路径。
- 代码路径：`src/electron/agent/sandbox/runner.ts`

## 与安全策略的关系

- 工具访问先经过安全策略“deny-wins”机制判定，决定是否允许执行。
- shell 命令在权限层总是需要审批。
- 代码路径：`src/electron/security/policy-manager.ts`

## 注意点与经验

- macOS 上沙箱 profile 动态生成并写入临时文件，执行后延迟清理。
- 对网络的默认拒绝与本地允许可以减少脚本外连风险。

## 主要参考

- 代码路径：`src/electron/agent/sandbox/runner.ts`
- 代码路径：`src/electron/security/policy-manager.ts`
