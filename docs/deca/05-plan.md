## 里程碑计划

所有里程碑遵循：
- TDD：先写测试再实现
- 覆盖率 >= 95%
- 每个里程碑完成后运行 UT + Lint
- 通过后邀请用 Console 验证
- 验证无误更新文档与进度
- 最后 push

### Milestone 1：项目骨架 + Console 最小可用

目标：
- Bun + Elysia 服务可运行
- Console 页面可访问
- 基础鉴权与本地 key 存取

交付：
- HTTP 层骨架
- Console 基础 UI（shadcn/ui）
- key 生成与读取

验证：
- UT + Lint 通过
- Console 能执行 /capabilities（返回 mock）

进度：完成并通过 Console 验证

### Milestone 2：路由层与 Provider/Executor 抽象

目标：
- Provider/Executor 接口落地
- 路由层规则与回退策略

交付：
- 统一能力描述
- Provider 注册机制
- Router 规则实现

验证：
- UT + Lint 通过
- Console 能查看 provider 列表

进度：完成并通过 Console 验证

### Milestone 3：AppleScript Executor

目标：
- AppleScript 执行通道可用

交付：
- `osascript -e` 执行
- 对应 UT

验证：
- UT + Lint 通过
- Console 触发示例脚本执行

进度：进行中

### Milestone 4：Codex Executor

目标：
- Codex sandbox 执行可用

交付：
- Codex 执行器与可用性检查
- 对应 UT

验证：
- UT + Lint 通过
- Console 执行命令

### Milestone 5：Claude Executor

目标：
- Claude runtime 执行可用

交付：
- `srt run` 执行器与可用性检查
- 对应 UT

验证：
- UT + Lint 通过
- Console 执行命令

### Milestone 6：OpenCode Executor

目标：
- OpenCode CLI 执行可用

交付：
- `opencode run` 执行器与可用性检查
- workspace 注入
- 对应 UT

验证：
- UT + Lint 通过
- Console 执行命令

### Milestone 7：Native Executor

目标：
- 本机执行兜底可用

交付：
- `spawn/exec` 实现
- 对应 UT

验证：
- UT + Lint 通过
- Console 执行命令

### Milestone 8：接口完备 + Debug 扩展

目标：
- 全接口落地
- Console 功能扩展

交付：
- /exec/stream
- /providers/test
- /auth/reset

验证：
- UT + Lint 通过
- Console 验证通过
