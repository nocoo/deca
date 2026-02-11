# HEARTBEAT.md - 定期任务清单

## Obsidian 仓库变化监控

每 30 分钟检查一次 ~/workspace/personal/obsidian 的变化：

1. **同步仓库**: `cd ~/workspace/personal/obsidian && git pull origin main`
2. **检查变化**: `git log --since="30 minutes ago" --pretty=format:"%h - %an, %ar : %s" --stat`
3. **主动报告**: 通过此 DM 主动告诉用户有什么变化（即使没有更新也要说明）

## 状态追踪

- 最后检查时间记录在 `memory/heartbeat-state.json`
- 如果有新提交，简要列出变化内容
- 如果无新提交，说明"暂无变化"

## 日记与记忆维护

每次心跳时：

1. **写日记**: 如果当天有有价值的对话或事件，追加到 `memory/YYYY-MM-DD.md`
2. **整理记忆**: 每隔几天，回顾近期 `memory/` 日记文件，将值得长期保留的经验、决策、教训蒸馏到 `MEMORY.md`
3. **清理过期**: 移除 `MEMORY.md` 中已过时或不再相关的内容

原则：日记是原始记录，MEMORY.md 是提炼后的智慧。不要把流水账搬进 MEMORY.md。

---

## 注意事项

- 即使是深夜时段也要执行（用户明确要求"不管有没有更新"都要主动告诉）
- 保持报告简洁，突出重点
- 不要等用户问，主动推送
