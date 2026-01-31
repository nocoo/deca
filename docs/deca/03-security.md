## 监听与鉴权

- 仅监听 `127.0.0.1`
- Header 鉴权使用 `sk-` 前缀 key
- key 保存在忽略的本地配置文件

## 本地域名

- 使用 Caddy 将域名映射到本机端口
- Console 验证地址：`https://deca-console.dev.hexly.ai`

## Console 行为

- Console 读取并使用本地 key
- Console 支持重置 key（生成新 key 并覆盖本地配置）

## 风险控制

- 不暴露公网访问
- 仅本机使用
