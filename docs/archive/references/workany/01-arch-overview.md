## 概要

WorkAny 在 macOS 上的“控制”主要体现为本地执行与沙盒执行两条路径：通过 Tauri 桌面端拉起 API sidecar，再由 API 选择沙盒提供方执行命令或脚本。代码库未见直接基于 macOS Accessibility/CGEvent/Quartz 的 UI 自动化实现。

## 主要方法（按执行路径）

1. 桌面端驱动 API sidecar
   - Tauri 应用在生产环境启动 bundled API sidecar，并负责生命周期管理与端口清理。
   - 代码路径：`src-tauri/src/lib.rs`

2. 沙盒执行（优先 Codex Sandbox，macOS seatbelt 进程隔离）
   - Codex CLI 在 macOS 上通过 `codex sandbox macos --full-auto` 执行，作为首选沙盒。
   - 沙盒默认禁止网络、强调隔离；脚本应输出 stdout，结果由上层保存。
   - 代码路径：`src-api/src/extensions/sandbox/codex.ts`

3. 本机执行（Native 兜底）
   - 当 Codex 不可用或需要网络访问时，退回到 Native provider，直接在主机执行命令/脚本。
   - 代码路径：`src-api/src/extensions/sandbox/native.ts`

4. API 侧沙盒路由与自动选择
   - API 路由根据可用性在 Codex 与 Native 间切换，并回传隔离级别与提供方信息。
   - 代码路径：`src-api/src/app/api/sandbox.ts`
   - 代码路径：`src-api/src/core/sandbox/index.ts`

## macOS 打包/权限相关要点

- Tauri 绑定了 entitlements，允许 JIT 与虚拟化能力（Hypervisor/Virtualization.framework），为沙盒/虚拟化能力预留权限。
- 代码路径：`src-tauri/entitlements.plist`
- 代码路径：`src-tauri/tauri.conf.json`

## 经验与注意点（从实现细节抽象）

- 以“沙盒优先、本机兜底”为策略，优先使用隔离执行，遇到网络或不可用场景切换到本机执行。
- Codex sandbox 在 macOS 下默认禁止网络访问，脚本需要通过 stdout 传递结果。
- macOS 应用侧通过 bundled 资源与 target triple 处理 CLI 侧车路径，兼容 .app 结构。

## 本次调研范围内未发现

- 直接基于 macOS Accessibility/CGEvent/Quartz 的 UI 控制代码。
- 系统权限申请（例如屏幕录制/辅助功能）的显式实现。

## 后续可深入方向（等你指定）

- 是否有私有分支/未提交代码实现了 UI 自动化。
- Codex/Claude CLI 实际在 macOS 上的权限模型与可执行能力边界。
- 沙盒策略在产品层面的配置入口与用户引导流程。
