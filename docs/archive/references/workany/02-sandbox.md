## 概要

WorkAny 的沙箱能力以“Codex Sandbox 优先，Native 兜底”为策略。Codex 在 macOS 上使用 `codex sandbox macos --full-auto` 进行进程级隔离；当 Codex 不可用或需要网络访问时，退回到本机执行（无隔离）。

## 架构与选择策略

1. 统一沙箱模块初始化
   - 沙箱模块注册内置 Provider，并由统一入口选择最优 Provider。
   - 代码路径：`src-api/src/core/sandbox/index.ts`

2. Provider 选择与回退
   - 优先 Codex（进程隔离），不可用则回退 Native（无隔离）。
   - 回退原因会写入日志，并在 API 返回中标注 `usedFallback`。
   - 代码路径：`src-api/src/core/sandbox/index.ts`, `src-api/src/app/api/sandbox.ts`

## Codex Sandbox（macOS）

1. 执行入口
   - macOS 使用 `codex sandbox macos --full-auto -- <command>` 运行。
   - 需要 shell 解析时使用 `sh -c` 包装。
   - 代码路径：`src-api/src/extensions/sandbox/codex.ts`

2. 能力与限制
   - 进程级隔离（macOS Seatbelt / Linux Landlock）。
   - 默认禁用网络（`supportsNetworking: false`）。
   - 需要写文件时依赖 `--full-auto` 提供工作目录读写权限。
   - 代码路径：`src-api/src/extensions/sandbox/codex.ts`

3. 运行时与依赖处理
   - JS 脚本优先使用打包的 Node.js（cli-bundle）。
   - Python 脚本需要系统 Python；缺失时返回提示。
   - 包安装在沙盒外进行（因为 codex sandbox 阻断网络/外部 shell）。
   - 代码路径：`src-api/src/extensions/sandbox/codex.ts`

## Native（无隔离兜底）

1. 使用条件
   - Codex 不可用或脚本依赖网络/代理能力时使用。
   - 代码路径：`src-api/src/core/sandbox/index.ts`, `src-api/src/app/api/sandbox.ts`

2. 特性
   - 直接在主机执行命令（`shell: true`）。
   - 支持网络访问，隔离级别为 `none`。
   - 代码路径：`src-api/src/extensions/sandbox/native.ts`

## API 层行为与提示

- `/sandbox/available` 提供当前沙箱信息与隔离级别。
- `/sandbox/exec` 与 `/sandbox/run/*` 返回 provider 信息，便于前端提示隔离级别。
- 代码路径：`src-api/src/app/api/sandbox.ts`

## 注意点与经验

- Codex sandbox 禁止网络访问，网络相关脚本需切换 Native。
- Codex 沙盒与打包 CLI 路径强相关，路径探测逻辑应保持稳定。

## 主要参考

- 代码路径：`src-api/src/extensions/sandbox/codex.ts`
- 代码路径：`src-api/src/extensions/sandbox/native.ts`
- 代码路径：`src-api/src/core/sandbox/index.ts`
- 代码路径：`src-api/src/app/api/sandbox.ts`
