/**
 * 内置工具集
 *
 * 对应 OpenClaw 源码: src/tools/ 目录 (50+ 工具)
 *
 * 这里实现了 11 个最基础的工具，覆盖了 Agent 的核心能力:
 * - read: 读取文件 (感知代码)
 * - write: 写入文件 (创建代码)
 * - edit: 编辑文件 (修改代码)
 * - exec: 执行命令 (运行测试、安装依赖等)
 * - list: 列出目录 (探索项目结构)
 * - grep: 搜索文件 (定位代码)
 * - search: 网络搜索 (实时信息获取)
 * - research: 深度研究 (带引用的研究报告)
 * - memory_search: 记忆检索 (历史召回)
 * - memory_get: 记忆读取 (按需拉取)
 * - sessions_spawn: 子代理触发
 *
 * 设计原则:
 * 1. 安全第一: 所有路径都基于 workspaceDir，防止越界访问
 * 2. 有限制: 输出大小、超时时间都有上限，防止 Agent 卡住或消耗过多资源
 * 3. 返回字符串: 所有工具都返回字符串，方便 LLM 理解
 */

import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { MemorySearchResult } from "../core/memory.js";
import type { Tool } from "./types.js";

const execAsync = promisify(execCallback);

// ============== 文件读取 ==============

/**
 * 读取文件工具
 *
 * 为什么限制 500 行？
 * - LLM 的上下文窗口有限（Claude 约 200K tokens）
 * - 一次返回太多内容会占用宝贵的上下文空间
 * - 大多数情况下，500 行足够理解一个文件的结构
 * - 如果需要更多，LLM 可以多次调用并指定 offset
 *
 * 为什么加行号？
 * - 方便 LLM 引用具体位置（"请修改第 42 行"）
 * - 方便 edit 工具精确定位
 */
export const readTool: Tool<{ file_path: string; limit?: number }> = {
  name: "read",
  description: "读取文件内容，返回带行号的文本",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件路径" },
      limit: { type: "number", description: "最大读取行数，默认 500" },
    },
    required: ["file_path"],
  },
  async execute(input, ctx) {
    // 安全: 使用 path.resolve 确保路径在 workspaceDir 内
    const filePath = path.resolve(ctx.workspaceDir, input.file_path);
    const limit = input.limit ?? 500;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n").slice(0, limit);
      // 格式: "行号\t内容"，方便 LLM 解析
      return lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  },
};

// ============== 文件写入 ==============

/**
 * 写入文件工具
 *
 * 为什么是覆盖而不是追加？
 * - 代码文件通常需要完整替换
 * - 追加操作可以用 edit 工具实现
 * - 覆盖更符合"写入新文件"的语义
 *
 * 安全考虑:
 * - 会自动创建父目录（recursive: true）
 * - 路径基于 workspaceDir，不能写入工作区外的文件
 */
export const writeTool: Tool<{ file_path: string; content: string }> = {
  name: "write",
  description: "写入文件，会覆盖已存在的文件",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件路径" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["file_path", "content"],
  },
  async execute(input, ctx) {
    const filePath = path.resolve(ctx.workspaceDir, input.file_path);

    try {
      // 自动创建父目录
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.content, "utf-8");
      return `成功写入 ${input.file_path}`;
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  },
};

// ============== 文件编辑 ==============

/**
 * 编辑文件工具
 *
 * 为什么用字符串替换而不是正则表达式？
 * - 字符串替换更可预测，不会有正则转义问题
 * - LLM 生成的正则表达式可能有语法错误
 * - 对于代码编辑，精确匹配比模糊匹配更安全
 *
 * 为什么用 replace() 而不是 replaceAll()？
 * - 只替换第一个匹配，更可控
 * - 如果需要全部替换，LLM 可以多次调用
 *
 * 典型使用场景:
 * - LLM 先 read 文件，看到第 42 行有问题
 * - 然后 edit 替换那一行的内容
 */
export const editTool: Tool<{
  file_path: string;
  old_string: string;
  new_string: string;
}> = {
  name: "edit",
  description: "编辑文件，替换指定文本（只替换第一个匹配）",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件路径" },
      old_string: { type: "string", description: "要替换的原文本（精确匹配）" },
      new_string: { type: "string", description: "新文本" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  async execute(input, ctx) {
    const filePath = path.resolve(ctx.workspaceDir, input.file_path);

    try {
      const content = await fs.readFile(filePath, "utf-8");

      // 检查是否存在要替换的文本
      if (!content.includes(input.old_string)) {
        return "错误: 未找到要替换的文本（请确保 old_string 与文件内容完全一致，包括空格和换行）";
      }

      // 只替换第一个匹配
      const newContent = content.replace(input.old_string, input.new_string);
      await fs.writeFile(filePath, newContent, "utf-8");
      return `成功编辑 ${input.file_path}`;
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  },
};

// ============== 命令执行 ==============

/**
 * 执行命令工具
 *
 * 为什么默认超时 30 秒？
 * - 大多数命令（npm install, tsc, pytest）在 30 秒内完成
 * - 超时可以防止 Agent 因为一个卡住的命令而无限等待
 * - 如果需要更长时间，LLM 可以指定 timeout 参数
 *
 * 为什么限制输出 30KB (30000 字符)？
 * - 命令输出可能非常大（如 npm install 的日志）
 * - 太大的输出会占用 LLM 上下文，影响后续推理
 * - 30KB 足够包含错误信息和关键日志
 *
 * 为什么 maxBuffer 是 1MB？
 * - Node.js exec 默认 maxBuffer 是 1MB
 * - 我们截取前 30KB 返回给 LLM，但允许命令产生更多输出
 * - 这样可以避免因为输出过大而执行失败
 *
 * 安全考虑:
 * - cwd 设置为 workspaceDir，命令在工作区内执行
 * - 但这不能完全防止恶意命令，生产环境应该用 Docker 沙箱
 */
export const execTool: Tool<{ command: string; timeout?: number }> = {
  name: "exec",
  description: "执行 shell 命令",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的命令" },
      timeout: { type: "number", description: "超时时间(ms)，默认 30000" },
    },
    required: ["command"],
  },
  async execute(input, ctx) {
    const timeout = input.timeout ?? 30000; // 30 秒超时

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: ctx.workspaceDir,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB，允许命令产生较多输出
      });

      let result = stdout;
      if (stderr) result += `\n[STDERR]\n${stderr}`;

      // 截取前 30KB，防止输出过大占用上下文
      return result.slice(0, 30000);
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  },
};

// ============== 目录列表 ==============

/**
 * 列出目录工具
 *
 * 为什么限制 100 条？
 * - 目录可能包含数千个文件（如 node_modules）
 * - 100 条足够了解目录结构
 * - 如果需要更多，LLM 可以进入子目录查看
 *
 * 为什么用 📁 📄 图标？
 * - 帮助 LLM 快速区分文件和目录
 * - 视觉上更清晰
 */
export const listTool: Tool<{ path?: string; pattern?: string }> = {
  name: "list",
  description: "列出目录内容",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "目录路径，默认当前目录" },
      pattern: { type: "string", description: "过滤模式，如 *.ts" },
    },
  },
  async execute(input, ctx) {
    const dirPath = path.resolve(ctx.workspaceDir, input.path ?? ".");

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // 简单的通配符转正则
      const pattern = input.pattern
        ? new RegExp(input.pattern.replace(/\*/g, ".*"))
        : null;

      const result = entries
        .filter((e) => !pattern || pattern.test(e.name))
        .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
        .slice(0, 100); // 最多 100 条

      return result.join("\n") || "目录为空";
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  },
};

// ============== 文件搜索 ==============

/**
 * 搜索文件内容工具
 *
 * 为什么用 grep 而不是自己实现？
 * - grep 是经过几十年优化的工具，性能极好
 * - 支持正则表达式
 * - 自动输出文件名和行号
 *
 * 为什么限制文件类型？
 * - 只搜索 .ts .js .json .md 等文本文件
 * - 避免搜索二进制文件、图片等
 * - 避免搜索 node_modules 中的大量文件（grep -r 会递归）
 *
 * 为什么 head -50？
 * - 搜索结果可能有数千条
 * - 50 条足够 LLM 定位问题
 * - 如果需要更多，可以缩小搜索范围
 *
 * 为什么超时 10 秒？
 * - 搜索大项目可能很慢
 * - 10 秒足够搜索大多数项目
 * - 超时比卡住好
 */
export const grepTool: Tool<{ pattern: string; path?: string }> = {
  name: "grep",
  description: "在文件中搜索文本（支持正则表达式）",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "搜索的正则表达式" },
      path: { type: "string", description: "搜索路径，默认当前目录" },
    },
    required: ["pattern"],
  },
  async execute(input, ctx) {
    const searchPath = path.resolve(ctx.workspaceDir, input.path ?? ".");

    try {
      // Escape single quotes in pattern for safe shell interpolation
      const safePattern = input.pattern.replace(/'/g, "'\\''");
      // grep 参数说明:
      // -r: 递归搜索
      // -n: 显示行号
      // --include: 只搜索指定扩展名的文件
      // --exclude-dir: 排除 node_modules, .git 等目录
      // head -50: 只返回前 50 条结果
      const { stdout } = await execAsync(
        `grep -rn --include='*.ts' --include='*.js' --include='*.json' --include='*.md' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.deca '${safePattern}' '${searchPath}' | head -50`,
        { cwd: ctx.workspaceDir, timeout: 10000 },
      );
      return stdout || "未找到匹配";
    } catch {
      // grep 没找到匹配时会返回非零退出码，这不是错误
      return "未找到匹配";
    }
  },
};

// ============== 网络搜索 ==============

/**
 * 网络搜索工具
 *
 * 为什么做成独立工具而不是 skill？
 * - 与 read/write/exec 等工具平级，Agent 可以自然地选择使用
 * - 不需要通过 skill 触发 → exec curl 的间接路径
 * - 一次调用直接返回结果，减少 Agent loop 轮次
 *
 * 使用 Tavily Search API:
 * - 环境变量 TAVILY_API_KEY 由 gateway/spawner 层注入
 * - 返回格式化的搜索结果（标题、URL、摘要）
 */
export const searchTool: Tool<{
  query: string;
  max_results?: number;
  search_depth?: string;
  topic?: string;
}> = {
  name: "search",
  description:
    "Search the web for real-time information. Use when your training data might be outdated, when the user asks you to search, or when you're not sure about something.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      max_results: {
        type: "number",
        description: "返回结果数量 (1-20)，默认 5",
      },
      search_depth: {
        type: "string",
        description: '"basic" (快速) 或 "advanced" (深度)，默认 basic',
      },
      topic: {
        type: "string",
        description: '"general"、"news" 或 "finance"，默认 general',
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return "错误: 网络搜索不可用 (未配置 TAVILY_API_KEY)";
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: input.query,
          max_results: input.max_results ?? 5,
          search_depth: input.search_depth ?? "basic",
          topic: input.topic ?? "general",
        }),
      });

      if (!response.ok) {
        return `搜索失败: HTTP ${response.status} ${response.statusText}`;
      }

      const data = (await response.json()) as {
        results?: {
          title: string;
          url: string;
          content: string;
          score: number;
        }[];
        answer?: string;
      };

      if (!data.results || data.results.length === 0) {
        return "未找到相关结果";
      }

      const lines: string[] = [];
      if (data.answer) {
        lines.push(`**摘要**: ${data.answer}\n`);
      }
      for (const r of data.results) {
        lines.push(`- **${r.title}**`);
        lines.push(`  ${r.url}`);
        lines.push(`  ${r.content.slice(0, 300)}`);
        lines.push("");
      }

      return lines.join("\n").slice(0, 15000);
    } catch (err) {
      return `搜索错误: ${(err as Error).message}`;
    }
  },
};

// ============== 深度研究 ==============

/**
 * 深度研究工具
 *
 * 使用 Tavily Research API 生成带引用的研究报告。
 * 适用于需要多角度、综合分析的场景。
 *
 * 注意: 研究可能需要 30-120 秒，timeout 设置较长。
 */
export const researchTool: Tool<{
  topic: string;
  model?: string;
}> = {
  name: "research",
  description:
    "深度研究一个主题，生成带引用来源的综合报告。适合需要全面了解某个话题的场景",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "研究主题" },
      model: {
        type: "string",
        description: '"mini" (快速, ~30s) 或 "pro" (深度, ~60-120s)，默认 mini',
      },
    },
    required: ["topic"],
  },
  async execute(input) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return "错误: 深度研究不可用 (未配置 TAVILY_API_KEY)";
    }

    try {
      const response = await fetch("https://api.tavily.com/research", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: input.topic,
          model: input.model ?? "mini",
          stream: false,
          citation_format: "numbered",
        }),
      });

      if (!response.ok) {
        return `研究失败: HTTP ${response.status} ${response.statusText}`;
      }

      const data = (await response.json()) as {
        content?: string;
        sources?: { title: string; url: string }[];
      };

      if (!data.content) {
        return "研究未返回结果";
      }

      const lines: string[] = [data.content];

      if (data.sources && data.sources.length > 0) {
        lines.push("\n---\n**引用来源**:");
        for (let i = 0; i < data.sources.length; i++) {
          const s = data.sources[i];
          lines.push(`[${i + 1}] ${s.title} — ${s.url}`);
        }
      }

      return lines.join("\n").slice(0, 30000);
    } catch (err) {
      return `研究错误: ${(err as Error).message}`;
    }
  },
};

// ============== 记忆工具 ==============

/**
 * 记忆检索工具
 *
 * 设计目标:
 * - 让 LLM 主动调用记忆检索，而不是自动注入
 * - 控制上下文体积：先搜索，再按需拉取
 */
export const memorySearchTool: Tool<{ query: string; limit?: number }> = {
  name: "memory_search",
  description: "检索长期记忆索引，返回相关记忆摘要列表",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或问题" },
      limit: { type: "number", description: "返回数量，默认 5" },
    },
    required: ["query"],
  },
  async execute(input, ctx) {
    const memory = ctx.memory;
    if (!memory) {
      return "记忆系统未启用";
    }
    const results = await memory.search(input.query, input.limit ?? 5);
    ctx.onMemorySearch?.(results);
    if (results.length === 0) {
      return "未找到相关记忆";
    }
    const lines = results.map(
      (r: MemorySearchResult, i: number) =>
        `${i + 1}. [${r.entry.id}] score=${r.score.toFixed(2)} tags=${r.entry.tags.join(",") || "-"}\n   ${r.snippet}`,
    );
    return lines.join("\n");
  },
};

/**
 * 记忆读取工具
 *
 * 用于在 memory_search 后精确拉取某条记忆全文。
 */
export const memoryGetTool: Tool<{ id: string }> = {
  name: "memory_get",
  description: "按 ID 读取一条记忆的完整内容",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "记忆 ID（来自 memory_search）" },
    },
    required: ["id"],
  },
  async execute(input, ctx) {
    const memory = ctx.memory;
    if (!memory) {
      return "记忆系统未启用";
    }
    const entry = await memory.getById(input.id);
    if (!entry) {
      return `未找到记忆: ${input.id}`;
    }
    return `[${entry.id}] ${entry.content}`;
  },
};

// ============== 子代理工具 ==============

/**
 * 子代理触发工具（最小版）
 *
 * 设计目标:
 * - 允许主代理将任务拆到后台子代理
 * - 子代理完成后由系统回传摘要（事件流）
 */
export const sessionsSpawnTool: Tool<{
  task: string;
  label?: string;
  cleanup?: "keep" | "delete";
}> = {
  name: "sessions_spawn",
  description: "启动子代理执行后台任务，并回传摘要",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "子代理任务描述" },
      label: { type: "string", description: "可选标签" },
      cleanup: {
        type: "string",
        description: "完成后是否清理会话: keep|delete",
      },
    },
    required: ["task"],
  },
  async execute(input, ctx) {
    if (!ctx.spawnSubagent) {
      return "子代理系统未启用";
    }
    const result = await ctx.spawnSubagent({
      task: input.task,
      label: input.label,
      cleanup: input.cleanup,
    });
    return `子代理已启动: runId=${result.runId} sessionKey=${result.sessionKey}`;
  },
};

// ============== 导出 ==============

import type { CronService } from "../cron/service.js";
import { createCronTool } from "../cron/tool.js";
import { claudeCodeTool } from "./coding-agent/index.js";

const coreTools: Tool[] = [
  readTool,
  writeTool,
  editTool,
  execTool,
  listTool,
  grepTool,
  searchTool,
  researchTool,
  memorySearchTool,
  memoryGetTool,
  sessionsSpawnTool,
  claudeCodeTool,
];

export const builtinTools: Tool[] = coreTools;

export function createBuiltinToolsWithCron(cronService: CronService): Tool[] {
  return [...coreTools, createCronTool(cronService)];
}

export { claudeCodeTool };
