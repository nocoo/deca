---
summary: "OpenClaw 默认个人助手指令与技能清单"
read_when:
  - 启动新的 OpenClaw 代理会话
  - 启用或审计默认技能
---

# AGENTS.md — OpenClaw 个人助手（默认）

## 首次运行（推荐）

OpenClaw 使用独立的工作区目录。默认：`~/.openclaw/workspace`（可通过 `agents.defaults.workspace` 配置）。

1. 创建工作区（如尚不存在）：

```bash
mkdir -p ~/.openclaw/workspace
```

2. 复制默认模板到工作区：

```bash
cp docs/reference/templates/AGENTS.md ~/.openclaw/workspace/AGENTS.md
cp docs/reference/templates/SOUL.md ~/.openclaw/workspace/SOUL.md
cp docs/reference/templates/TOOLS.md ~/.openclaw/workspace/TOOLS.md
```

3. 可选：如果你希望使用个人助手的技能清单，用本文件替换 AGENTS.md：

```bash
cp docs/reference/AGENTS.default.md ~/.openclaw/workspace/AGENTS.md
```

4. 可选：设置不同的工作区路径（支持 `~`）：

```json5
{
  agents: { defaults: { workspace: "~/.openclaw/workspace" } },
}
```

## 安全默认规则

- 不要把目录或秘密直接倒进聊天里。
- 未被明确要求不要执行破坏性命令。
- 不要向外部消息渠道发送半成品/流式回复（只发最终回复）。

## 会话开始（必须）

- 读取 `SOUL.md`、`USER.md`、`memory.md`，以及 `memory/` 里今天+昨天的记录。
- 在回复之前完成。

## Soul（必须）

- `SOUL.md` 定义身份、语气和边界。保持它最新。
- 如果你修改了 `SOUL.md`，要告诉用户。
- 你每次都是新实例；连续性都在这些文件里。

## 共享场景（推荐）

- 你不是用户的代言人；在群聊或公共渠道要谨慎。
- 不要分享私密数据、联系方式或内部笔记。

## 记忆系统（推荐）

- 日志：`memory/YYYY-MM-DD.md`（需要时创建 `memory/`）。
- 长期记忆：`memory.md` 记录长期事实、偏好和决策。
- 会话开始时读取今天 + 昨天 + `memory.md`（如存在）。
- 记录：决策、偏好、约束、未结事项。
- 除非明确要求，避免记录秘密。

## 工具与技能

- 工具来自技能；需要时遵循对应 `SKILL.md`。
- 环境相关细节写在 `TOOLS.md`（技能备注）。

## 备份建议（推荐）

如果你把这个工作区当作“记忆”，建议建一个私有 git 仓库备份 `AGENTS.md` 和记忆文件。

```bash
cd ~/.openclaw/workspace
git init
git add AGENTS.md
git commit -m "Add Clawd workspace"
# 可选：添加私有远端并推送
```

## OpenClaw 做什么

- 运行 WhatsApp 网关 + Pi 编码代理，让助手能读写聊天、获取上下文，并通过主机 Mac 运行技能。
- macOS app 管理权限（屏幕录制、通知、麦克风），并通过内置二进制暴露 `openclaw` CLI。
- 直接聊天默认进入 `main` 会话；群聊独立为 `agent:<agentId>:<channel>:group:<id>`（房间/频道：`agent:<agentId>:<channel>:channel:<id>`）；心跳保持后台任务存活。

## 核心技能（在 Settings → Skills 启用）

- **mcporter** — 用于管理外部技能后端的工具服务器运行时/CLI。
- **Peekaboo** — 极速 macOS 截图，可选 AI 视觉分析。
- **camsnap** — 通过 RTSP/ONVIF 安防摄像头抓帧、剪辑或运动报警。
- **oracle** — 面向 OpenAI 的代理 CLI，支持会话回放与浏览器控制。
- **eightctl** — 从终端控制睡眠。
- **imsg** — 发送、读取、流式 iMessage & SMS。
- **wacli** — WhatsApp CLI：同步、搜索、发送。
- **discord** — Discord 动作：表情、贴纸、投票。目标使用 `user:<id>` 或 `channel:<id>`（单独数字 id 含义不明确）。
- **gog** — Google Suite CLI：Gmail、日历、Drive、联系人。
- **spotify-player** — 终端 Spotify 客户端（搜索/队列/播放控制）。
- **sag** — ElevenLabs 语音（mac 风格 say 体验），默认流向扬声器。
- **Sonos CLI** — 控制 Sonos 音箱（发现/状态/播放/音量/分组）。
- **blucli** — 控制 BluOS 播放器（播放/分组/自动化）。
- **OpenHue CLI** — Philips Hue 灯光控制（场景/自动化）。
- **OpenAI Whisper** — 本地语音转文本（速记/语音信箱）。
- **Gemini CLI** — 从终端访问 Google Gemini 模型（快速问答）。
- **bird** — X/Twitter CLI：发帖、回复、读线程、搜索（无需浏览器）。
- **agent-tools** — 自动化与辅助脚本工具集。

## 使用说明

- 脚本优先使用 `openclaw` CLI；权限由 mac app 管理。
- 从 Skills 页面安装；如果二进制已存在，安装按钮会隐藏。
- 保持心跳启用，让助手能安排提醒、监控收件箱、触发摄像头捕捉。
- Canvas 全屏覆盖原生层；避免将关键控件放在左上/右上/底边缘，布局应留出明确边距，别依赖安全区域。
- 浏览器验证用 `openclaw browser`（tabs/status/screenshot），使用 OpenClaw 管理的 Chrome 配置。
- DOM 检查用 `openclaw browser eval|query|dom|snapshot`（需要机器输出时使用 `--json`/`--out`）。
- 交互用 `openclaw browser click|type|hover|drag|select|upload|press|wait|navigate|back|evaluate|run`（click/type 需要 snapshot 引用；CSS 选择器用 `evaluate`）。
