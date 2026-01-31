## 概要

WorkAny 在 macOS 上的“控制”能力主要体现在沙盒脚本执行与本机执行的切换能力：
- Codex Sandbox（macOS Seatbelt 进程隔离）为优先路径；
- Claude Sandbox（Anthropic sandbox runtime）可作为可选 provider；
- Native 为无隔离兜底，提供完整系统访问与网络能力。
未见直接基于 Accessibility/CGEvent/Quartz 的 UI 事件注入。

## 能力清单（按控制层面）

1. 进程级隔离执行（Codex Sandbox）
   - macOS 使用 `codex sandbox macos --full-auto` 执行命令与脚本。
   - 默认禁用网络（`supportsNetworking: false`）。
   - 适用于安全执行、受控文件读写。
   - 代码路径：`src-api/src/extensions/sandbox/codex.ts`

2. 进程级隔离执行（Claude Sandbox）
   - 使用 `srt run -- <command>` 执行命令与脚本。
   - 支持网络（`supportsNetworking: true`）。
   - 适用于需要联网的脚本执行。
   - 代码路径：`src-api/src/extensions/sandbox/claude.ts`

3. 本机执行（无隔离兜底）
   - 直接在主机执行命令，`shell: true`。
   - 支持网络与系统完整能力，安全性最低。
   - 代码路径：`src-api/src/extensions/sandbox/native.ts`

4. Provider 选择与回退
   - 默认使用 Codex，失败回退 Native。
   - API 层可指定 provider，并在返回中包含隔离级别与回退信息。
   - 代码路径：`src-api/src/core/sandbox/index.ts`, `src-api/src/app/api/sandbox.ts`

## 运行时与依赖限制

- Codex/Claude provider 在沙盒外安装依赖（npm/pip），沙盒内执行脚本。
- Codex 禁止网络访问，涉及联网/代理任务需要切换 Claude 或 Native。
- 代码路径：`src-api/src/extensions/sandbox/codex.ts`, `src-api/src/extensions/sandbox/claude.ts`

## macOS 特有路径探测与打包策略

- Codex CLI 在 macOS app bundle 中有多路径探测（Resources/_up_/cli-bundle 等）。
- Claude Sandbox 通过 `srt` 可执行文件探测（which/where 与常见路径）。
- 代码路径：`src-api/src/extensions/sandbox/codex.ts`, `src-api/src/extensions/sandbox/claude.ts`

## 主要参考

- 代码路径：`src-api/src/extensions/sandbox/codex.ts`
- 代码路径：`src-api/src/extensions/sandbox/claude.ts`
- 代码路径：`src-api/src/extensions/sandbox/native.ts`
- 代码路径：`src-api/src/core/sandbox/index.ts`
- 代码路径：`src-api/src/app/api/sandbox.ts`
