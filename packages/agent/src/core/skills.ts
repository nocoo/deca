/**
 * 可扩展 Skills 系统
 *
 * OpenClaw 的 Skills 系统:
 * - SKILL.md 定义技能 (frontmatter + prompt)
 * - 支持参数、触发条件、安装脚本
 * - 动态加载和卸载
 *
 * 这里简化为: 基于文件的技能定义 + 运行时注入
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface Skill {
  /** 技能 ID */
  id: string;
  /** 技能名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 触发关键词 */
  triggers?: string[];
  /** 技能 Prompt */
  prompt: string;
  /** 来源 */
  source: "builtin" | "workspace" | "user";
}

export interface SkillMatch {
  skill: Skill;
  matchedTrigger?: string;
}

const SKILL_DIR_NAMES = [".deca/skills", "skills"];

export class SkillManager {
  private workspaceDir: string;
  private userDir: string;
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  constructor(workspaceDir: string, userDir = "~/.deca") {
    this.workspaceDir = workspaceDir;
    this.userDir = userDir.replace("~", process.env.HOME || "");
  }

  /**
   * 加载所有技能
   */
  async loadAll(): Promise<void> {
    if (this.loaded) return;

    // 1. 加载内置技能
    this.registerBuiltinSkills();

    // 2. 加载用户全局技能 (~/.deca/skills/)
    for (const dirName of SKILL_DIR_NAMES) {
      await this.loadFromDir(path.join(this.userDir, dirName), "user");
    }

    // 3. 加载工作空间技能 (./skills/ 或 ./.deca/skills/)
    for (const dirName of SKILL_DIR_NAMES) {
      await this.loadFromDir(
        path.join(this.workspaceDir, dirName),
        "workspace",
      );
    }

    this.loaded = true;
  }

  /**
   * 注册内置技能
   */
  private registerBuiltinSkills(): void {
    const builtins: Skill[] = [
      {
        id: "code-review",
        name: "代码审查",
        description: "审查代码质量、安全性和最佳实践",
        triggers: ["/review", "review code", "代码审查"],
        prompt: `你正在进行代码审查。请检查:
1. 代码质量和可读性
2. 潜在的 bug 和边界情况
3. 安全漏洞
4. 性能问题
5. 最佳实践遵循

提供具体的改进建议，不要泛泛而谈。`,
        source: "builtin",
      },
      {
        id: "explain",
        name: "代码解释",
        description: "解释代码逻辑和实现原理",
        triggers: ["/explain", "explain this", "解释"],
        prompt: `你正在解释代码。请:
1. 概述整体功能
2. 解释关键逻辑流程
3. 说明重要的数据结构
4. 指出值得注意的设计模式

用简洁清晰的语言，假设读者有基础编程知识。`,
        source: "builtin",
      },
      {
        id: "refactor",
        name: "代码重构",
        description: "重构代码以提高可维护性",
        triggers: ["/refactor", "refactor", "重构"],
        prompt: `你正在重构代码。原则:
1. 保持功能不变
2. 提高可读性
3. 减少重复
4. 改善命名
5. 简化复杂逻辑

每次修改要说明理由，确保测试通过。`,
        source: "builtin",
      },
      {
        id: "test",
        name: "编写测试",
        description: "为代码编写单元测试",
        triggers: ["/test", "write test", "测试"],
        prompt: `你正在编写测试。请:
1. 覆盖正常路径
2. 覆盖边界情况
3. 覆盖错误处理
4. 使用清晰的测试命名

使用项目已有的测试框架风格。`,
        source: "builtin",
      },
      {
        id: "search",
        name: "网络搜索",
        description: "使用 Tavily API 搜索网络获取实时信息",
        triggers: ["/search", "search web", "搜索"],
        prompt: `你正在进行网络搜索。使用 Tavily Search API 获取实时网络信息。

**执行方法**: 使用 exec 工具执行以下 curl 命令:

\`\`\`bash
curl --request POST \\
  --url https://api.tavily.com/search \\
  --header "Authorization: Bearer $TAVILY_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --data '{
    "query": "<用户搜索内容>",
    "max_results": 5,
    "search_depth": "basic"
  }'
\`\`\`

**参数说明**:
- max_results: 结果数量 (1-20)
- search_depth: "basic" (快速) 或 "advanced" (深度)
- topic: "general", "news", "finance"
- time_range: "day", "week", "month", "year"

**响应处理**:
1. 解析 JSON 响应中的 results 数组
2. 提取每个结果的 title, url, content, score
3. 按相关性排序呈现给用户
4. 提供来源链接

**注意**: 需要设置 TAVILY_API_KEY 环境变量。`,
        source: "builtin",
      },
      {
        id: "research",
        name: "深度研究",
        description: "使用 Tavily API 进行深度研究并生成带引用的报告",
        triggers: ["/research", "research", "研究"],
        prompt: `你正在进行深度研究。使用 Tavily Research API 获取综合研究报告。

**执行方法**: 使用 exec 工具执行以下 curl 命令:

\`\`\`bash
curl --request POST \\
  --url https://api.tavily.com/research \\
  --header "Authorization: Bearer $TAVILY_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --data '{
    "input": "<研究主题>",
    "model": "mini",
    "stream": false,
    "citation_format": "numbered"
  }'
\`\`\`

**模型选择**:
- mini: 单一主题快速研究 (~30秒)
- pro: 多角度深度分析 (~60-120秒)

**响应处理**:
1. 解析 JSON 响应中的 content 和 sources
2. content 包含研究报告正文
3. sources 包含引用来源列表
4. 保留引用编号，让用户可追溯

**输出格式**:
- 提供结构化的研究摘要
- 列出关键发现
- 附上引用来源

**注意**: 需要设置 TAVILY_API_KEY 环境变量。研究可能需要 30-120 秒。`,
        source: "builtin",
      },
    ];

    for (const skill of builtins) {
      this.skills.set(skill.id, skill);
    }
  }

  /**
   * 从目录加载技能
   */
  private async loadFromDir(
    dir: string,
    source: Skill["source"],
  ): Promise<void> {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const filePath = path.join(dir, file);
        const skill = await this.parseSkillFile(filePath, source);
        if (skill) {
          this.skills.set(skill.id, skill);
        }
      }
    } catch {
      // 目录不存在，忽略
    }
  }

  /**
   * 解析技能文件 (SKILL.md 格式)
   *
   * 格式:
   * ---
   * id: my-skill
   * name: 我的技能
   * triggers: ["/myskill", "触发词"]
   * ---
   *
   * Prompt 内容...
   */
  private async parseSkillFile(
    filePath: string,
    source: Skill["source"],
  ): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const frontmatterMatch = content.match(
        /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
      );

      if (!frontmatterMatch) {
        // 无 frontmatter，使用文件名作为 ID
        const id = path.basename(filePath, ".md").toLowerCase();
        return {
          id,
          name: id,
          description: "",
          prompt: content.trim(),
          source,
        };
      }

      const [, frontmatter, prompt] = frontmatterMatch;
      const meta: Record<string, unknown> = {};

      // 简单解析 YAML frontmatter
      for (const line of frontmatter.split("\n")) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          // 尝试解析数组
          if (value.startsWith("[") && value.endsWith("]")) {
            try {
              meta[key] = JSON.parse(value.replace(/'/g, '"'));
            } catch {
              meta[key] = value;
            }
          } else {
            meta[key] = value.replace(/^["']|["']$/g, "");
          }
        }
      }

      const id =
        (meta.id as string) || path.basename(filePath, ".md").toLowerCase();
      return {
        id,
        name: (meta.name as string) || id,
        description: (meta.description as string) || "",
        triggers: meta.triggers as string[] | undefined,
        prompt: prompt.trim(),
        source,
      };
    } catch {
      return null;
    }
  }

  /**
   * 根据输入匹配技能
   */
  async match(input: string): Promise<SkillMatch | null> {
    await this.loadAll();

    const lower = input.toLowerCase().trim();

    for (const skill of this.skills.values()) {
      if (!skill.triggers) continue;

      for (const trigger of skill.triggers) {
        if (lower.startsWith(trigger.toLowerCase())) {
          return { skill, matchedTrigger: trigger };
        }
      }
    }

    return null;
  }

  /**
   * 获取技能
   */
  async get(id: string): Promise<Skill | null> {
    await this.loadAll();
    return this.skills.get(id) || null;
  }

  /**
   * 列出所有技能
   */
  async list(): Promise<Skill[]> {
    await this.loadAll();
    return Array.from(this.skills.values());
  }

  /**
   * 注册自定义技能
   */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * 构建技能描述 (注入系统提示)
   */
  async buildSkillsPrompt(): Promise<string> {
    const skills = await this.list();
    if (skills.length === 0) return "";

    const lines = skills.map((s) => {
      const triggers = s.triggers ? ` (${s.triggers.join(", ")})` : "";
      return `- **${s.name}**${triggers}: ${s.description}`;
    });

    return `\n\n## 可用技能\n\n${lines.join("\n")}`;
  }
}
