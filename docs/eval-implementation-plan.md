# Eval 系统实现计划

## 目标

构建系统化的 Prompt 评估系统，验证 `prompts/` 目录中的配置是否有效。

## 核心特性

- TypeScript 定义测试用例
- 使用真实 `prompts/` 目录进行测试
- LLM Judge 评估（由 OpenCode 执行）
- 生成格式化 Markdown 报告
- 支持 lint 和单元测试

---

## 实现步骤

### Phase 1: 基础结构

#### Commit 1: 初始化 eval 目录结构
```
eval/
├── package.json
├── tsconfig.json
└── reports/
    └── .gitkeep
```

**文件清单：**
- `eval/package.json` - 包配置（scripts: lint, test:unit）
- `eval/tsconfig.json` - TypeScript 配置
- `eval/reports/.gitkeep` - 报告输出目录占位

**验证：** `bun run --cwd eval lint` 无报错

---

#### Commit 2: 定义核心类型
```
eval/
└── types.ts
```

**内容：**
- `EvalCase` - 测试用例定义
- `EvalResult` - 执行结果
- `EvalReport` - 评估报告
- `JudgeExample` - Few-shot 示例
- `CategoryStats` - 分类统计

**验证：** TypeScript 编译通过

---

#### Commit 3: 类型单元测试
```
eval/
└── types.test.ts
```

**内容：**
- 验证类型结构正确
- 验证默认值逻辑
- 验证工具函数（如有）

**验证：** `bun test eval/types.test.ts` 通过

---

### Phase 2: 测试用例

#### Commit 4: IDENTITY.md 测试用例
```
eval/
└── cases/
    └── identity.ts
```

**用例清单：**
- `identity-self-intro` - 自我介绍
- `identity-name-query` - 名字询问
- `identity-not-claude` - 不是 Claude

**验证：** 导入无错误

---

#### Commit 5: SOUL.md 测试用例
```
eval/
└── cases/
    └── soul.ts
```

**用例清单：**
- `soul-responsiveness` - 事事有回应
- `soul-personality` - 人格一致性
- `soul-boundary` - 边界意识

**验证：** 导入无错误

---

#### Commit 6: AGENTS.md 测试用例
```
eval/
└── cases/
    └── agents.ts
```

**用例清单：**
- `agents-memory-aware` - 记忆意识
- `agents-safety` - 安全边界
- `agents-group-chat` - 群聊行为

**验证：** 导入无错误

---

#### Commit 7: 用例索引导出
```
eval/
└── cases/
    └── index.ts
```

**内容：**
- 导出所有用例
- 提供 `getAllCases()` 函数
- 提供 `getCasesByPrompt()` 函数
- 提供 `getCaseById()` 函数

**验证：** `bun eval/cases/index.ts` 无错误

---

### Phase 3: Runner 执行器

#### Commit 8: Runner 核心逻辑
```
eval/
└── runner.ts
```

**功能：**
- 加载 credentials
- 加载测试用例
- 创建 Agent 实例（使用真实 prompts/）
- 执行用例并收集结果
- 运行快速检查
- 输出 JSON 到 stdout 或文件

**CLI 接口：**
```bash
bun eval/runner.ts                    # 运行所有
bun eval/runner.ts --case identity-self-intro  # 运行单个
bun eval/runner.ts --prompt IDENTITY.md        # 按 prompt 筛选
bun eval/runner.ts --output reports/pending.json
```

**验证：** `bun eval/runner.ts --help` 显示帮助

---

#### Commit 9: Runner 单元测试
```
eval/
└── runner.test.ts
```

**测试内容：**
- 用例加载逻辑
- 快速检查逻辑（containsAny, containsAll, notContains）
- 结果结构验证
- CLI 参数解析

**验证：** `bun test eval/runner.test.ts` 通过

---

### Phase 4: Reporter 报告器

#### Commit 10: Reporter 核心逻辑
```
eval/
└── reporter.ts
```

**功能：**
- 读取评估结果 JSON
- 计算统计数据
- 生成 Markdown 报告
- 支持输出到文件或 stdout

**CLI 接口：**
```bash
bun eval/reporter.ts reports/judged.json
bun eval/reporter.ts reports/judged.json --output reports/report.md
```

**验证：** `bun eval/reporter.ts --help` 显示帮助

---

#### Commit 11: Reporter 单元测试
```
eval/
└── reporter.test.ts
```

**测试内容：**
- 统计计算逻辑
- Markdown 格式生成
- 边界情况处理

**验证：** `bun test eval/reporter.test.ts` 通过

---

### Phase 5: Skill 集成

#### Commit 12: 项目级 SKILL.md
```
eval/
└── SKILL.md
```

**内容：**
- Skill 元数据（name, description, triggers）
- 使用流程说明
- LLM Judge 评估指南
- 评分标准和原则
- 输出格式规范

**验证：** 内容完整，格式正确

---

### Phase 6: 根目录集成

#### Commit 13: 更新根目录 package.json
```
package.json (root)
```

**新增 scripts：**
```json
{
  "scripts": {
    "eval": "bun eval/runner.ts",
    "eval:report": "bun eval/reporter.ts"
  }
}
```

**验证：** `bun run eval --help` 工作正常

---

## 验收标准

### 功能验收

- [ ] `bun run eval` 能执行所有测试用例
- [ ] `bun run eval --case xxx` 能执行单个用例
- [ ] 输出 JSON 结构正确，包含所有必要字段
- [ ] 快速检查（containsAny/containsAll/notContains）工作正常
- [ ] Reporter 能生成格式正确的 Markdown 报告

### 质量验收

- [ ] `bun run --cwd eval lint` 无错误
- [ ] `bun test eval/` 所有单元测试通过
- [ ] 代码符合项目 biome 配置
- [ ] 类型定义完整，无 any

### 文档验收

- [ ] SKILL.md 内容完整
- [ ] LLM Judge 指南清晰
- [ ] CLI 帮助信息完整

---

## 依赖关系

```
types.ts
    ↓
cases/*.ts → cases/index.ts
    ↓
runner.ts → runner.test.ts
    ↓
reporter.ts → reporter.test.ts
    ↓
SKILL.md
    ↓
package.json (root)
```

---

## 时间估算

| Phase | Commits | 预计时间 |
|-------|---------|----------|
| Phase 1: 基础结构 | 3 | 15 min |
| Phase 2: 测试用例 | 4 | 20 min |
| Phase 3: Runner | 2 | 25 min |
| Phase 4: Reporter | 2 | 15 min |
| Phase 5: Skill | 1 | 10 min |
| Phase 6: 集成 | 1 | 5 min |
| **总计** | **13** | **~90 min** |

---

## 后续扩展（不在本次范围）

- [ ] 多次运行与统计聚合（runs > 1）
- [ ] 更多 Prompt 文件的测试用例（TOOLS.md, USER.md, MEMORY.md）
- [ ] CI 集成
- [ ] 历史报告对比
- [ ] Web UI 展示
