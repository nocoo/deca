## 路由层职责

- 只负责选择与编排，不做执行
- 根据能力约束与优先级选择 Provider
- 记录回退原因与尝试顺序
- 统一输出标准结构

## Provider 与 Executor

- Provider：能力声明 + 可用性检测 + 配置容器
- Executor：执行实现（只做执行）

Router 只依赖 Provider 接口，不直接调用系统命令。

## 选择规则（默认）

优先级：Codex → Claude → OpenCode → Native

规则：
- 需要联网：跳过 Codex
- 需要隔离：跳过 OpenCode/Native
- 需要 workspace：优先支持 workspace 的 provider

## 输出结构

```
{
  "success": true,
  "provider": "codex",
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "elapsedMs": 1234,
  "fallback": {
    "used": false,
    "reason": "",
    "attempted": ["codex", "claude"]
  }
}
```
