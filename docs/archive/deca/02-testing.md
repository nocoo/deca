## 目标

- TDD：所有功能先写 UT 再实现
- 覆盖率：95% 以上
- Lint：每次提交与推送前必须通过

## 测试策略

- 执行层：单独测试（mock 进程执行）
- 路由层：策略与回退逻辑测试
- HTTP 层：请求/响应与鉴权测试
- Console：组件级与集成级测试

## 工具链

- Bun 运行测试
- 前端使用 Vitest + Testing Library + jsdom（建议）

## 钩子策略

- pre-commit：UT
- pre-push：UT + Lint
