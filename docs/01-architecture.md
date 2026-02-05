# 系统架构

> 本文档描述 Deca 的整体架构设计和模块依赖关系

## 概述

Deca 是一个本地运行的 macOS AI Agent 控制网关。采用模块化设计，通过 Gateway 层统一组装 Agent 和多个通道（Channels）。

## 整体架构

```
                    ┌─────────────────────────────────────────────┐
                    │              packages/gateway               │
                    │            (唯一组装点)                      │
                    ├─────────────────────────────────────────────┤
                    │                                             │
  Discord ─────────►│  Discord Channel                            │
  (用户消息)         │      │                                      │
                    │      │                                      │
  Terminal ────────►│  Terminal Channel                           │
  (终端输入)         │      │                                      │
                    │      │                                      │
  HTTP ────────────►│  HTTP Channel                               │
  (API 请求)         │      │                                      │
                    │      ▼                                      │
                    │  ┌─────────────────┐                        │
                    │  │     Agent       │◄──── Heartbeat Timer   │
                    │  │   (AI 决策)      │                        │
                    │  └─────────────────┘                        │
                    │      │                                      │
                    │      ▼                                      │
                    │  Tools (工具层)                              │
                    │    - AppleScript                            │
                    │    - Shell 命令                              │
                    │    - 文件操作                                │
                    │    - GitHub CLI                             │
                    └─────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  macOS / 本地    │
                    └─────────────────┘
```

## 模块依赖关系

```
                    ┌─────────────┐
                    │   gateway   │  ← 唯一组装点
                    └──────┬──────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │          │           │           │          │
    ▼          ▼           ▼           ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
│discord │ │terminal│ │  http  │ │ agent  │ │ storage │
└────────┘ └────────┘ └────────┘ └───┬────┘ └─────────┘
                                     │            ▲
                                     └────────────┘
```

### 依赖规则

| 规则 | 说明 |
|------|------|
| Gateway 是唯一组装点 | 只有 gateway 可以同时导入 agent 和 channels |
| Channels 相互独立 | discord、terminal、http 不能相互依赖 |
| Channels 不依赖 Agent | 每个 channel 定义自己的 MessageHandler 接口 |
| Agent 依赖 Storage | agent 使用 storage 进行会话持久化 |

## 设计决策

### 决策 1：同进程模型

**选择**：所有模块运行在同一进程

**理由**：
- 实现简单（无需 RPC 层）
- 延迟低（直接函数调用）
- 模块边界通过包结构和依赖规则强制执行

**权衡**：未来若需进程分离，需添加 RPC 层

### 决策 2：Channels 作为独立包

**选择**：每个通道（Discord、Terminal、HTTP）是独立的 npm 包

**理由**：
- 每个通道可独立测试（90%+ 覆盖率）
- 每个通道可独立运行（Echo 模式）
- 防止跨通道依赖
- 职责清晰

### 决策 3：Gateway 作为组装层

**选择**：Gateway 是唯一导入所有模块的地方

**理由**：
- 单一组合点
- 通道定义自己的接口，Gateway 适配它们
- Agent 对通道一无所知
- 依赖图清晰

## 数据流

### 流程 1：用户消息触发

```
1. 用户通过 Discord/Terminal/HTTP 发送消息
       ↓
2. Channel 接收消息，解析内容
       ↓
3. Gateway 将消息转发给 Agent
       ↓
4. Agent Loop:
   a. 构建 system prompt + 历史消息
   b. 调用 LLM (Anthropic API)
   c. 解析响应：
      - text → 返回给用户
      - tool_use → 执行工具 → 继续循环
   d. stop_reason = "end_turn" → 结束
       ↓
5. 响应返回给用户
       ↓
6. 会话保存到 storage
```

### 流程 2：心跳主动唤醒

```
1. Heartbeat Timer 触发 (setTimeout)
       ↓
2. 读取 HEARTBEAT.md，解析任务
       ↓
3. 如果有未完成任务：
   a. 构建任务 prompt
   b. 调用 agent.run()
       ↓
4. Agent 执行任务（可能调用工具）
       ↓
5. 结果发送到指定通道
       ↓
6. 更新 HEARTBEAT.md（标记完成）
```

## 安全考虑

### 本地安全约束

- 仅监听 `127.0.0.1`
- API Key 认证
- 凭证存储在本地配置文件

### 工具权限

| 工具 | 风险等级 | 控制措施 |
|------|---------|---------|
| Read | 低 | 限制可读目录 |
| Write | 中 | 限制可写目录 |
| Shell | 高 | 命令审计 |
| AppleScript | 高 | TCC 权限控制 |

## 扩展性

### 添加新通道

1. 创建 `packages/<channel-name>/`
2. 定义自己的 MessageHandler 接口
3. 实现独立的 Echo 模式
4. 在 `packages/gateway/` 添加适配器

### 添加新工具

1. 在 `packages/agent/src/tools/` 添加工具定义
2. 实现 Tool 接口
3. 注册到工具注册表
4. 添加测试

## 相关文档

- [模块详解](02-modules.md) - 各模块功能和接口
- [开发指南](03-development.md) - 本地开发环境配置
- [测试规范](04-testing.md) - 测试策略和覆盖率要求
