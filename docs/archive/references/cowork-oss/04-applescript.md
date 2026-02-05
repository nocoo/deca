## 概要

CoWork-OSS 的 AppleScript 能力通过 `SystemTools.runAppleScript` 暴露为工具 `run_applescript`，实际执行方式是调用 `osascript -e`。从项目实现与工具描述看，AppleScript 主要用于“应用级/系统级自动化”，而非底层事件注入。

## 能力范围（项目定义的用途）

依据工具描述与实现，AppleScript 可覆盖以下类别：

1. 应用控制
   - 启动/控制应用（如 Safari、Finder、Mail）。
   - 读取应用状态（如前台窗口、当前文档）。

2. 窗口与 UI
   - 管理窗口（前台、切换、获取标题）。
   - 通过 AppleScript + System Events 进行 UI 操作（如点击 UI 元素）。

3. 系统偏好与设置
   - 读取/设置系统偏好。

4. 文件与系统交互
   - 获取文件/目录信息。
   - 结合 Finder 脚本完成基础文件操作。

5. 输入与交互
   - 发送按键、输入文本（依赖 System Events）。

## 运行方式与限制

- 运行方式：`osascript -e <script>`。
- 仅 macOS 可用，非 macOS 平台会直接报错。
- 有默认超时（30 秒）与 stdout/stderr 结果返回。
- 依赖 macOS TCC 权限弹窗授权（如辅助功能、自动化等）。

## 当前项目中的落地点

- AppleScript 被作为一个通用系统工具暴露给 LLM 工具层，供任务执行时调用。
- 代码路径：`src/electron/agent/tools/system-tools.ts`

## 主要参考

- 代码路径：`src/electron/agent/tools/system-tools.ts`
