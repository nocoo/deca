## 概要

WorkAny 的“沙箱三层 API”可以理解为：
1) HTTP 路由层（对外 API）；
2) 核心沙箱抽象层（统一 Provider 接口与选择）；
3) Provider 实现层（Codex/Claude/Native 具体执行）。

下面列出每一层的完整 API 与对应的底层实现。

## 第一层：HTTP 路由（对外 API）

代码路径：`src-api/src/app/api/sandbox.ts`

1. `GET /sandbox/debug/codex-paths`
   - 作用：诊断 Codex/CLI 路径探测结果。
   - 底层：路径探测逻辑与文件存在性检查（与 provider 无关）。

2. `GET /sandbox/available`
   - 作用：返回可用 provider、隔离级别、是否回退等信息。
   - 底层：`getSandboxInfo()` → `getBestProviderWithInfo()`。

3. `GET /sandbox/images`
   - 作用：返回可用镜像列表与默认镜像。
   - 底层：`SANDBOX_IMAGES`（配置常量）。

4. `POST /sandbox/exec`
   - 作用：执行命令（短任务）。
   - 输入：`command`, `args`, `cwd`, `env`, `image`, `provider`, `timeout`。
   - 底层：`getProviderWithFallback()` → `provider.exec()`。

5. `POST /sandbox/run/file`
   - 作用：执行脚本文件（自动检测运行时）。
   - 输入：`filePath`, `workDir`, `args`, `env`, `packages`, `provider`, `timeout`。
   - 底层：`getProviderWithFallback()` → `provider.runScript()`。
   - 特性：若检测到网络依赖包，会自动切换 Native。

6. `POST /sandbox/run/node`
   - 作用：执行 Node 脚本文本（写入临时文件后执行）。
   - 输入：`script`, `packages`, `cwd`, `env`, `provider`, `timeout`。
   - 底层：`getProviderWithFallback()` → `provider.exec()` 写文件 → `provider.runScript()`。

7. `POST /sandbox/exec/stream`
   - 作用：长任务流式执行（SSE 输出）。
   - 输入：`command`, `args`, `cwd`, `env`, `image`, `provider`。
   - 底层：`getProviderWithFallback()` → `provider.exec()` → stdout/stderr 流式输出。

8. `POST /sandbox/stop-all`
   - 作用：停止所有沙箱 provider（释放资源）。
   - 底层：`stopAllSandboxProviders()`。

## 第二层：核心沙箱抽象（统一接口）

代码路径：`src-api/src/core/sandbox/index.ts`

1. Provider 选择与回退
   - `getBestProviderWithInfo()`：优先 Codex，失败回退 Native。
   - `getBestProvider()`：只返回 provider。

2. 统一执行入口
   - `execInSandbox(options)`：封装 provider.exec 并注入 provider 信息。
   - `runScriptInSandbox(filePath, workDir, options)`：封装 provider.runScript 并注入 provider 信息。

3. 可用性信息
   - `getSandboxInfo()`：返回 provider 类型、隔离级别、回退原因。

4. 初始化与注册
   - `initSandbox()`：注册内置 provider。
   - `registerBuiltinProviders()` / `registerSandboxPlugin()`：provider 插件注册。

## 第三层：Provider 实现（具体执行）

代码路径：
- `src-api/src/extensions/sandbox/codex.ts`
- `src-api/src/extensions/sandbox/claude.ts`
- `src-api/src/extensions/sandbox/native.ts`

1. Codex Provider（macOS 进程隔离）
   - 底层命令：`codex sandbox macos --full-auto -- <command>`。
   - 特性：默认禁网；依赖安装在沙盒外进行。

2. Claude Provider（Anthropic sandbox runtime）
   - 底层命令：`srt run -- <command>`。
   - 特性：支持网络；依赖安装在沙盒外进行。

3. Native Provider（无隔离兜底）
   - 底层命令：直接 `spawn(command, args, { shell: true })`。
   - 特性：完全本机权限与网络能力，隔离级别为 `none`。

## 统一抽象接口（Provider API）

代码路径：`src-api/src/core/sandbox/types.ts`

- `isAvailable()`：检测 provider 是否可用。
- `init(config?)`：初始化 provider。
- `exec(options)`：执行命令。
- `runScript(filePath, workDir, options?)`：执行脚本。
- `getCapabilities()`：返回隔离级别/网络能力等。
- `setVolumes(volumes)`：设置挂载目录（部分 provider 支持）。
- `stop()` / `shutdown()`：停止 provider。

## 主要参考

- 代码路径：`src-api/src/app/api/sandbox.ts`
- 代码路径：`src-api/src/core/sandbox/index.ts`
- 代码路径：`src-api/src/core/sandbox/types.ts`
- 代码路径：`src-api/src/extensions/sandbox/codex.ts`
- 代码路径：`src-api/src/extensions/sandbox/claude.ts`
- 代码路径：`src-api/src/extensions/sandbox/native.ts`
