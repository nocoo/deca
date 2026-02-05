# 开发指南

> 本文档介绍如何配置本地开发环境和常用开发命令

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Bun | >= 1.1.34 | JavaScript 运行时 |
| Node.js | >= 18 | 部分工具依赖 |
| macOS | >= 12 | 运行平台 |

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/yourname/deca.git
cd deca
```

### 2. 安装依赖

```bash
bun install
```

### 3. 启动开发服务器

```bash
# Echo 模式（无需 API Key，用于测试）
bun run dev

# Agent 模式（需要 Anthropic API Key）
ANTHROPIC_API_KEY=xxx bun run dev
```

## 常用命令

### 开发命令

| 命令 | 说明 |
|------|------|
| `bun install` | 安装所有依赖 |
| `bun run dev` | 启动开发服务器 |
| `bun run test:unit` | 运行所有单元测试 |
| `bun run lint` | 运行代码检查 |
| `bun run format` | 格式化代码 |

### 模块特定命令

```bash
# 运行特定模块测试
bun --filter @deca/agent test:unit
bun --filter @deca/discord test:unit
bun --filter @deca/gateway test:unit

# 独立运行通道（Echo 模式）
cd packages/discord && DISCORD_TOKEN=xxx bun run standalone
cd packages/terminal && bun run standalone
cd packages/http && bun run standalone

# 运行 Gateway
cd packages/gateway && bun run start
```

## 项目结构

```
deca/
├── packages/           # 模块包
│   ├── agent/          # AI Agent 核心
│   ├── storage/        # 持久化层
│   ├── discord/        # Discord 通道
│   ├── terminal/       # Terminal 通道
│   ├── http/           # HTTP 通道
│   └── gateway/        # 组装层
├── docs/               # 项目文档
├── package.json        # 根配置
├── biome.json          # 代码风格配置
└── README.md           # 项目入口
```

## 开发工作流

### 1. 创建新功能分支

```bash
git checkout -b feat/your-feature
```

### 2. 编写测试

遵循 TDD 原则，先写测试：

```typescript
// packages/agent/src/core/agent.test.ts
describe('Agent', () => {
  it('should run with message', async () => {
    const agent = createAgent(config);
    const result = await agent.run('sessionId', 'Hello');
    expect(result.text).toBeDefined();
  });
});
```

### 3. 实现功能

```typescript
// packages/agent/src/core/agent.ts
export function createAgent(config: AgentConfig): Agent {
  // 实现...
}
```

### 4. 确保测试通过

```bash
bun run test:unit
bun run lint
```

### 5. 更新文档

如果修改了 API 或功能，必须更新相关文档。

### 6. 提交代码

```bash
git add .
git commit -m "feat: add agent core"
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `DECA_PROVIDER` | 指定使用的 LLM Provider (anthropic/minimax) | 可选 |
| `DISCORD_TOKEN` | Discord Bot Token | Discord 通道必需 |
| `DECA_API_KEY` | HTTP API 认证 Key | HTTP 通道可选 |

## LLM Provider 配置

Deca 支持多 Provider 切换，通过 `~/.deca/credentials/` 目录下的 JSON 文件配置。

### Provider 优先级

1. `DECA_PROVIDER` 环境变量
2. `~/.deca/config.json` 中的 `activeProvider`
3. 第一个可用的 credential 文件

### 支持的 Providers

| Provider | 文件名 | 说明 |
|----------|--------|------|
| `anthropic` | `anthropic.json` | Anthropic Claude API |
| `minimax` | `minimax.json` | MiniMax API |

### Credential 文件示例

```json
// ~/.deca/credentials/anthropic.json
{
  "apiKey": "sk-ant-...",
  "models": {
    "default": "claude-sonnet-4-20250514"
  }
}
```

```json
// ~/.deca/credentials/minimax.json
{
  "apiKey": "your-minimax-key",
  "baseUrl": "https://api.minimax.chat/v1",
  "models": {
    "default": "MiniMax-Text-01"
  }
}
```

### 切换 Provider

```bash
# 方法 1: 环境变量
DECA_PROVIDER=minimax bun run packages/gateway/serve.ts

# 方法 2: 配置文件
echo '{"activeProvider": "minimax"}' > ~/.deca/config.json
```

## 调试技巧

### 使用 Bun 调试器

```bash
bun --inspect run packages/gateway/cli.ts
```

### 查看详细日志

```bash
DEBUG=* bun run dev
```

### 运行单个测试

```bash
bun test packages/agent/src/core/agent.test.ts
```

## IDE 配置

### VS Code 推荐扩展

- Biome - 代码格式化和检查
- Bun - Bun 支持
- TypeScript - TypeScript 支持

### settings.json

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome"
}
```

## 相关文档

- [系统架构](01-architecture.md) - 整体架构设计
- [模块详解](02-modules.md) - 各模块功能和接口
- [测试规范](04-testing.md) - 测试策略和覆盖率要求
- [贡献指南](05-contributing.md) - Git 规范和提交要求
