# Eval 系统实现计划

## 目标

构建系统化的 Prompt 评估系统，验证 `prompts/` 目录中的配置是否有效。

## 核心约束

### 🔴 强制约束

1. **LLM 打分禁止使用脚本** - 评分由 OpenCode 手动执行，不得自动化
2. **脚本禁止使用 LLM** - Runner/Reporter 等脚本纯代码执行，不调用任何 LLM API
3. **单元测试覆盖率 90%+** - 所有脚本必须有高质量单元测试
4. **中间 JSON 交换数据** - LLM 和脚本之间通过 JSON 文件传递数据
5. **Skill 流程优先** - 本次优先建立 Skill 工作流，仅保留最小 case 验证流程
6. **绝对独立** - Eval 通过 Gateway HTTP API 调用，不直接依赖 Agent 包

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenCode (LLM)                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    读取 SKILL.md                         │   │
│  │                         ↓                                │   │
│  │  Step 1: 执行 bun eval/runner.ts                         │   │
│  │                         ↓                                │   │
│  │           eval/reports/pending-xxx.json                  │   │
│  │                         ↓                                │   │
│  │  Step 2: 读取 JSON，逐条评估打分（LLM 手动）               │   │
│  │                         ↓                                │   │
│  │           eval/reports/judged-xxx.json                   │   │
│  │                         ↓                                │   │
│  │  Step 3: 执行 bun eval/reporter.ts                       │   │
│  │                         ↓                                │   │
│  │           eval/reports/report-xxx.md                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway (被测对象)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Agent   │  │ Discord  │  │   HTTP   │  │ Terminal │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
[Cases] ──脚本──→ [pending.json] ──LLM评估──→ [judged.json] ──脚本──→ [report.md]
   │                    │                          │                    │
   │                    │                          │                    │
   └── 纯代码 ──────────┘                          └──── 纯代码 ────────┘
                        │                          │
                        └───── LLM 手动打分 ───────┘
```

---

## 目录结构

```
deca/
├── eval/                         # 独立 Eval 系统
│   ├── SKILL.md                  # 项目级 Skill（OpenCode 读取）
│   ├── package.json              # 独立包配置
│   ├── tsconfig.json             # TypeScript 配置
│   │
│   ├── types.ts                  # 类型定义
│   ├── types.test.ts             # 类型测试
│   │
│   ├── cases/                    # 测试用例（最小集）
│   │   ├── index.ts              # 导出
│   │   └── identity.ts           # 仅 1-2 个用例验证流程
│   │
│   ├── runner.ts                 # 执行器（调用 Gateway HTTP）
│   ├── runner.test.ts            # 90%+ 覆盖率
│   │
│   ├── reporter.ts               # 报告生成器
│   ├── reporter.test.ts          # 90%+ 覆盖率
│   │
│   └── reports/                  # JSON/MD 输出
│       └── .gitkeep
│
└── prompts/                      # 被测 Prompt
```

---

## 实现步骤

### Phase 1: 基础结构

#### Commit 1: 初始化 eval 目录结构

**文件：**
- `eval/package.json` - 包配置
- `eval/tsconfig.json` - TypeScript 配置
- `eval/reports/.gitkeep` - 输出目录

**package.json 内容：**
```json
{
  "name": "eval",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "biome check .",
    "format": "biome format . --write",
    "test": "bun test",
    "test:coverage": "bun test --coverage"
  },
  "devDependencies": {
    "@biomejs/biome": "1.8.3",
    "@types/bun": "latest"
  }
}
```

**验证：** `cd eval && bun install && bun run lint`

---

#### Commit 2: 定义核心类型

**文件：** `eval/types.ts`

**内容：**
```typescript
// 测试用例定义
export interface EvalCase {
  id: string;
  name: string;
  description: string;
  targetPrompt: string;
  category: string;
  input: string;
  criteria: string;
  reference?: string;
  rubric?: Record<1|2|3|4|5, string>;
  quickCheck?: QuickCheck;
  passThreshold?: number;  // 默认 70
}

// 快速检查
export interface QuickCheck {
  containsAny?: string[];
  containsAll?: string[];
  notContains?: string[];
  matchPattern?: string;
}

// 执行结果（Runner 输出）
export interface EvalResult {
  caseId: string;
  caseName: string;
  targetPrompt: string;
  category: string;
  input: string;
  output: string;
  durationMs: number;
  quickCheck: {
    ran: boolean;
    passed: boolean | null;
    details?: string;
  };
  // LLM 填充
  judgement?: Judgement;
  error?: string;
}

// LLM 评估结果
export interface Judgement {
  passed: boolean;
  score: number;       // 0-100
  reasoning: string;
}

// 最终报告
export interface EvalReport {
  timestamp: string;
  gitCommit: string;
  model: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  };
  byCategory: Record<string, CategoryStats>;
  results: EvalResult[];
}

export interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
}
```

**验证：** TypeScript 编译通过

---

#### Commit 3: 类型工具函数和测试

**文件：** `eval/types.ts`（添加工具函数）、`eval/types.test.ts`

**工具函数：**
```typescript
// 快速检查执行
export function runQuickCheck(output: string, check: QuickCheck): { passed: boolean; details: string }

// 默认值填充
export function withDefaults(case_: Partial<EvalCase>): EvalCase
```

**测试覆盖：**
- `runQuickCheck` containsAny 逻辑
- `runQuickCheck` containsAll 逻辑
- `runQuickCheck` notContains 逻辑
- `runQuickCheck` matchPattern 逻辑
- `runQuickCheck` 组合逻辑
- `withDefaults` 默认值填充

**验证：** `bun test eval/types.test.ts --coverage` 90%+

---

### Phase 2: 最小测试用例

#### Commit 4: 最小用例集

**文件：** `eval/cases/identity.ts`、`eval/cases/index.ts`

**用例（仅验证流程）：**
```typescript
// identity.ts - 只保留 1-2 个用例
export const identityCases: EvalCase[] = [
  {
    id: "identity-basic",
    name: "基础身份识别",
    description: "验证 Agent 能正确识别自己是 Tomato",
    targetPrompt: "IDENTITY.md",
    category: "identity",
    input: "你是谁？",
    criteria: "Agent 应该说自己是 Tomato 或 🍅",
    quickCheck: {
      containsAny: ["Tomato", "🍅", "番茄"],
      notContains: ["Claude", "Anthropic"],
    },
    passThreshold: 70,
  },
];
```

**index.ts：**
```typescript
export * from "./identity.js";
export function getAllCases(): EvalCase[];
export function getCaseById(id: string): EvalCase | undefined;
```

**验证：** 导入无错误

---

### Phase 3: Runner 执行器

#### Commit 5: Runner 核心逻辑

**文件：** `eval/runner.ts`

**功能：**
1. 加载测试用例
2. 启动或连接 Gateway HTTP Server
3. 发送消息到 `/api/chat` 端点
4. 收集响应
5. 运行快速检查
6. 输出 JSON 到 `eval/reports/pending-{timestamp}.json`

**关键：通过 HTTP API 调用，不直接依赖 Agent 包**

```typescript
// 通过 HTTP 调用 Gateway
async function callGateway(input: string): Promise<string> {
  const response = await fetch("http://localhost:8080/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input, sessionId: `eval-${Date.now()}` }),
  });
  const data = await response.json();
  return data.response;
}
```

**CLI：**
```bash
bun eval/runner.ts                           # 运行所有
bun eval/runner.ts --case identity-basic     # 运行单个
bun eval/runner.ts --gateway http://localhost:8080  # 指定 Gateway
bun eval/runner.ts --output reports/pending.json
```

**验证：** `bun eval/runner.ts --help`

---

#### Commit 6: Runner 单元测试

**文件：** `eval/runner.test.ts`

**测试覆盖（90%+）：**
- 用例加载逻辑
- CLI 参数解析
- HTTP 请求构造（mock）
- 结果 JSON 结构验证
- 快速检查集成
- 错误处理

**验证：** `bun test eval/runner.test.ts --coverage`

---

### Phase 4: Reporter 报告器

#### Commit 7: Reporter 核心逻辑

**文件：** `eval/reporter.ts`

**功能：**
1. 读取 `judged-xxx.json`（包含 LLM 评估结果）
2. 计算统计数据
3. 生成 Markdown 报告
4. 输出到文件或 stdout

**CLI：**
```bash
bun eval/reporter.ts reports/judged-xxx.json
bun eval/reporter.ts reports/judged-xxx.json --output reports/report.md
```

**Markdown 格式：**
```markdown
# Eval Report

**时间**: 2026-02-05 17:00:00
**Commit**: abc123
**通过率**: 80% (4/5)

## 总结

| 指标 | 值 |
|------|---|
| 总用例 | 5 |
| 通过 | 4 |
| 失败 | 1 |
| 平均分 | 82 |

## 失败用例

### ❌ identity-basic (50/100)

**输入**: 你是谁？
**输出**: 我是 Claude...
**原因**: 未正确识别身份
```

**验证：** `bun eval/reporter.ts --help`

---

#### Commit 8: Reporter 单元测试

**文件：** `eval/reporter.test.ts`

**测试覆盖（90%+）：**
- 统计计算逻辑
- passRate 计算
- avgScore 计算
- 分类统计
- Markdown 生成
- 边界情况（空结果、全通过、全失败）

**验证：** `bun test eval/reporter.test.ts --coverage`

---

### Phase 5: Skill 集成

#### Commit 9: 项目级 SKILL.md

**文件：** `eval/SKILL.md`

**内容要点：**
1. Skill 元数据
2. 完整工作流程
3. LLM Judge 评估指南
4. 评分标准
5. JSON 格式说明
6. 常见问题

**关键：详细说明 LLM 如何手动评估并写入 JSON**

---

### Phase 6: 根目录集成

#### Commit 10: 更新根目录配置

**文件：** `package.json`（根目录）

**新增 scripts：**
```json
{
  "scripts": {
    "eval:run": "bun eval/runner.ts",
    "eval:report": "bun eval/reporter.ts",
    "eval:lint": "bun run --cwd eval lint",
    "eval:test": "bun test eval/"
  }
}
```

**验证：** `bun run eval:run --help`

---

## 验收标准

### 功能验收

- [ ] `bun eval/runner.ts` 通过 HTTP 调用 Gateway
- [ ] 输出正确的 `pending-xxx.json`
- [ ] LLM 可以读取 JSON 并填充 `judgement`
- [ ] `bun eval/reporter.ts` 生成正确的 Markdown 报告

### 质量验收

- [ ] `bun run --cwd eval lint` 无错误
- [ ] `bun test eval/ --coverage` 覆盖率 90%+
- [ ] 脚本不调用任何 LLM API
- [ ] LLM 评估不通过脚本执行

### 流程验收

- [ ] SKILL.md 能指导完整工作流
- [ ] JSON 格式清晰，LLM 易于填充
- [ ] 报告格式美观，信息完整

---

## Commit 清单

| # | Commit | 内容 | 验证 |
|---|--------|------|------|
| 1 | `chore: init eval directory structure` | package.json, tsconfig.json, reports/ | lint 通过 |
| 2 | `feat: add eval core types` | types.ts | 编译通过 |
| 3 | `test: add types unit tests (90%+)` | types.test.ts | 覆盖率 90%+ |
| 4 | `feat: add minimal eval cases` | cases/identity.ts, cases/index.ts | 导入无错误 |
| 5 | `feat: add runner (HTTP gateway call)` | runner.ts | --help 工作 |
| 6 | `test: add runner unit tests (90%+)` | runner.test.ts | 覆盖率 90%+ |
| 7 | `feat: add reporter` | reporter.ts | --help 工作 |
| 8 | `test: add reporter unit tests (90%+)` | reporter.test.ts | 覆盖率 90%+ |
| 9 | `docs: add eval SKILL.md` | SKILL.md | 内容完整 |
| 10 | `chore: integrate eval scripts in root` | package.json (root) | 脚本工作 |

---

## 后续扩展（不在本次范围）

- [ ] 补充更多测试用例
- [ ] Discord 渠道测试
- [ ] 多次运行与统计聚合
- [ ] CI 集成
- [ ] 历史报告对比
