# 贡献指南

> 本文档描述 Git 规范、代码风格和提交要求

## Git 规范

### 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能 | `feat/<description>` | `feat/add-slack-channel` |
| 修复 | `fix/<description>` | `fix/session-persistence` |
| 重构 | `refactor/<description>` | `refactor/agent-core` |
| 文档 | `docs/<description>` | `docs/update-readme` |

### Commit Message 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

**格式**：`<type>: <description>`

**类型**：

| 类型 | 说明 | 优先级 |
|------|------|--------|
| `fix` | Bug 修复、边缘情况处理 | 最高 |
| `feat` | 新功能或显著改进 | 高 |
| `refactor` | 代码重构，不改变行为 | 中 |
| `test` | 测试相关 | 中 |
| `docs` | 文档更新 | 中 |
| `chore` | 维护任务、依赖更新 | 低 |

**书写规则**：

- 使用祈使句：`fix: ignore windows crashes` 而非 `fixed...`
- 全小写：描述部分首字母小写
- 精炼：描述控制在 50 个字符以内

**示例**：

```
fix: handle empty session gracefully
feat: add terminal repl channel
refactor: extract message handler interface
test: add agent core unit tests
docs: update architecture diagram
chore: upgrade bun to 1.1.34
```

## 原子化提交

每个 commit 必须代表一个单一且逻辑完整的变更。

### 原则

1. **粒度控制** - 如果一个任务涉及"重构函数"和"增加新功能"，必须拆分为两个独立的 commit
2. **持续流动** - 偏好高频、微小的 `fix` 提交，而非追求一次性完美的巨型 commit
3. **回滚安全** - 确保每个 commit 后的代码库都是稳定且可构建的（测试必须通过）

### 自检

提交前问自己：

> "如果此提交被回滚，系统其他部分是否还能正常运转？"

如果答案是"否"，说明提交包含了不相关的变更，需要拆分。

## 代码风格

### 工具配置

项目使用 [Biome](https://biomejs.dev/) 进行代码格式化和检查。

```bash
# 运行检查
bun run lint

# 格式化代码
bun run format
```

### TypeScript 规范

#### 类型定义

```typescript
// ✅ 好 - 显式导出类型
export interface AgentConfig {
  apiKey: string;
  model?: string;
}

// ❌ 不好 - 内联类型
export function createAgent(config: { apiKey: string; model?: string }) {}
```

#### 函数式优先

```typescript
// ✅ 好 - 函数式
export function createAgent(config: AgentConfig): Agent {
  return {
    run: async (sessionId, message) => { /* ... */ },
  };
}

// ❌ 不好 - 不必要的类（除非确实需要状态）
export class Agent {
  constructor(config: AgentConfig) {}
  async run(sessionId: string, message: string) {}
}
```

#### 错误处理

```typescript
// ✅ 好 - 明确的错误类型
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

// ✅ 好 - Result 类型
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### 文件组织

```
src/
├── core/               # 核心逻辑
│   ├── agent.ts
│   └── agent.test.ts   # 测试与源文件同目录
├── utils/              # 工具函数
├── types.ts            # 类型定义
└── index.ts            # 公共 API 导出
```

## 文档要求

### 代码即文档

修改代码时，必须同步更新相关文档：

| 变更类型 | 需更新的文档 |
|----------|-------------|
| 新增模块 | `docs/02-modules.md` |
| 修改 API | 模块对应文档 |
| 修改架构 | `docs/01-architecture.md` |
| 修改开发流程 | `docs/03-development.md` |
| 修改测试策略 | `docs/04-testing.md` |

### 文档规范

- 使用中文编写
- 文件名格式：`XX-name.md`（两位数字编号）
- 严格命名风格，使用小写和连字符

## Pull Request 流程

### 1. 创建分支

```bash
git checkout -b feat/your-feature
```

### 2. 开发和提交

```bash
# 编写代码和测试
# ...

# 确保测试通过
bun run test:unit
bun run lint

# 提交
git add .
git commit -m "feat: add your feature"
```

### 3. 推送和创建 PR

```bash
git push -u origin feat/your-feature
```

### 4. PR 描述模板

```markdown
## 概述

简要描述这个 PR 做了什么。

## 变更内容

- 添加了 XXX 功能
- 修复了 XXX 问题
- 更新了 XXX 文档

## 测试

- [ ] 单元测试通过
- [ ] Lint 检查通过
- [ ] 文档已更新

## 相关 Issue

Closes #123
```

## Review 清单

### 代码审查要点

- [ ] 代码符合项目风格
- [ ] 测试覆盖率达标（90%+）
- [ ] 文档已同步更新
- [ ] Commit message 符合规范
- [ ] 无敏感信息泄露
- [ ] 无破坏性变更（或已标注）

## 相关文档

- [系统架构](01-architecture.md) - 整体架构设计
- [模块详解](02-modules.md) - 各模块功能和接口
- [开发指南](03-development.md) - 本地开发环境配置
- [测试规范](04-testing.md) - 测试策略和覆盖率要求
