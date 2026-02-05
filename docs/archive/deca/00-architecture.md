## 概要

Deca 是一个纯本地运行的 macOS 控制代理服务，目标是让其他 AI agent 通过 Web 接口安全地操作本机。核心采用三层结构：

1. HTTP 层（Elysia）
2. 路由层（Router）
3. 执行层（Executors）

## 三层结构

1. HTTP 层（Elysia）
   - 负责 API 暴露、鉴权、输入校验、响应格式统一。

2. 路由层（Router）
   - 只负责“选择与编排”，不做任何实际执行。
   - 根据规则选择 Provider，处理能力协商、回退与错误归因。

3. 执行层（Executors）
   - 只负责实际执行命令/脚本（AppleScript/Codex/Claude/OpenCode/Native）。
   - 不参与路由决策、回退与鉴权。

## Provider 与 Executor 的关系

- Executor：执行实现（如何执行）。
- Provider：包装与能力声明（能否执行 + 能力/限制 + 配置）。

关系：Router 选择 Provider，Provider 返回 Executor，Executor 执行命令。

## 执行器清单

1. AppleScript
   - 入口：`osascript -e <script>`
   - 能力：应用自动化与 UI scripting（依赖 TCC 权限）

2. Codex
   - 入口：`codex sandbox macos --full-auto -- <command>`
   - 能力：隔离执行，默认禁网

3. Claude
   - 入口：`srt run -- <command>`
   - 能力：可联网，隔离级别取决于 runtime

4. OpenCode
   - 入口：`opencode run '<prompt>' --agent build --model zai-coding-plan/glm-4.7`
   - 能力：需要 workspace，可联网，无隔离

5. Native
   - 入口：本机 `spawn/exec`
   - 能力：完整系统能力，无隔离

## 路由规则（默认）

优先级：Codex → Claude → OpenCode → Native

能力协商规则：
- 需要联网：跳过 Codex
- 需要隔离：跳过 OpenCode/Native
- 需要 workspace：优先支持 workspace 的 provider

## 本地安全约束

- 仅监听 `127.0.0.1`
- Header 鉴权使用 `sk-` 前缀 key
- key 存储在忽略的本地配置文件
