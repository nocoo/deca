## 接口设计原则

- 原子化、正交、可组合
- 先读后写：先提供可观察、可诊断接口
- 统一响应结构

## 接口清单（先读后写顺序）

1. `GET /capabilities`
   - 作用：返回系统能力矩阵（providers + limits）

2. `GET /providers`
   - 作用：返回 provider 列表、可用性与健康状态

3. `POST /exec`
   - 作用：执行命令（短任务）

4. `POST /run/script`
   - 作用：执行脚本（文本/文件）

5. `POST /exec/stream`
   - 作用：流式输出（长任务）

6. `POST /providers/test`
   - 作用：探测 provider 可用性与能力

7. `POST /auth/reset`
   - 作用：重置本地 key（仅本机使用）

## 统一响应结构（初稿）

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
    "reason": ""
  }
}
```
