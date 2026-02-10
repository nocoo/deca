/**
 * Mini Agent 核心
 *
 * 5 大核心子系统:
 * 1. Session Manager - 会话管理 (JSONL 持久化)
 * 2. Memory Manager - 长期记忆 (关键词搜索)
 * 3. Context Loader - 按需上下文加载 (AGENTS/SOUL/TOOLS/IDENTITY/USER/HEARTBEAT/BOOTSTRAP/MEMORY)
 * 4. Skill Manager - 可扩展技能系统
 * 5. Heartbeat Manager - 主动唤醒机制
 *
 * 核心循环:
 *   while (tool_calls) {
 *     response = llm.generate(messages)
 *     for (tool of tool_calls) {
 *       result = tool.execute()
 *       messages.push(result)
 *     }
 *   }
 */

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  ContextLoader,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  type PruneResult,
  compactHistoryIfNeeded,
  pruneContextMessages,
} from "../context/index.js";
import {
  HeartbeatManager,
  type HeartbeatResult,
  type HeartbeatTask,
  type WakeRequest,
} from "../heartbeat/manager.js";
import { builtinTools } from "../tools/builtin.js";
import type { Tool, ToolContext } from "../tools/types.js";
import { emitAgentEvent } from "./agent-events.js";
import {
  enqueueInLane,
  resolveGlobalLane,
  resolveSessionLane,
} from "./command-queue.js";
import { MemoryManager, type MemorySearchResult } from "./memory.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  resolveAgentIdFromSessionKey,
  resolveSessionKey,
} from "./session-key.js";
import { type ContentBlock, type Message, SessionManager } from "./session.js";
import { SkillManager, type SkillMatch } from "./skills.js";
import {
  type ToolPolicy,
  filterToolsByPolicy,
  mergeToolPolicies,
} from "./tool-policy.js";

// ============== 类型定义 ==============

export interface AgentConfig {
  /** Anthropic API Key */
  apiKey: string;
  /** Base URL for Anthropic API (optional, for proxy/custom endpoints) */
  baseUrl?: string;
  /** 模型 ID */
  model?: string;
  /** Agent ID（默认 main） */
  agentId?: string;
  /** 系统提示 */
  systemPrompt?: string;
  /** 工具列表 */
  tools?: Tool[];
  /** 工具策略（allow/deny） */
  toolPolicy?: ToolPolicy;
  /** 沙箱设置（示意版，仅控制工具可用性） */
  sandbox?: {
    enabled?: boolean;
    allowExec?: boolean;
    allowWrite?: boolean;
  };
  /** 最大循环次数 */
  maxTurns?: number;
  /** 会话存储目录 */
  sessionDir?: string;
  /** 工作目录（Agent 可以读写文件的目录，同时存放 AGENTS.md, SOUL.md 等人格文件） */
  workspaceDir?: string;
  /** 记忆存储目录 */
  memoryDir?: string;
  /** 是否启用记忆 */
  enableMemory?: boolean;
  /** 是否启用上下文加载 */
  enableContext?: boolean;
  /** 是否启用技能 */
  enableSkills?: boolean;
  /** 是否启用主动唤醒 */
  enableHeartbeat?: boolean;
  /** Heartbeat 检查间隔 (毫秒) */
  heartbeatInterval?: number;
  /** 上下文窗口大小（token 估算） */
  contextTokens?: number;
}

export interface AgentCallbacks {
  /** 流式文本增量 */
  onTextDelta?: (delta: string) => void;
  /** 文本完成 */
  onTextComplete?: (text: string) => void;
  /** 工具调用开始 */
  onToolStart?: (name: string, input: unknown) => void;
  /** 工具调用结束 */
  onToolEnd?: (name: string, result: string) => void;
  /** 轮次开始 */
  onTurnStart?: (turn: number) => void;
  /** 轮次结束 */
  onTurnEnd?: (turn: number) => void;
  /** 技能匹配 */
  onSkillMatch?: (match: SkillMatch) => void;
  /** 记忆检索 */
  onMemorySearch?: (results: MemorySearchResult[]) => void;
  /** Heartbeat 任务触发 */
  onHeartbeat?: (tasks: HeartbeatTask[]) => void;
}

export interface RunResult {
  /** 本次运行 ID */
  runId?: string;
  /** 最终文本 */
  text: string;
  /** 总轮次 */
  turns: number;
  /** 工具调用次数 */
  toolCalls: number;
  /** 是否触发了技能 */
  skillTriggered?: string;
  /** 记忆检索结果数（memory_search 返回的条数） */
  memoriesUsed?: number;
  /** Token 使用统计 */
  usage?: {
    /** 输入 tokens */
    inputTokens: number;
    /** 输出 tokens */
    outputTokens: number;
    /** 创建缓存的 tokens */
    cacheCreationInputTokens: number;
    /** 从缓存读取的 tokens */
    cacheReadInputTokens: number;
  };
}

// ============== 默认系统提示 ==============

const DEFAULT_SYSTEM_PROMPT = `You are a personal assistant running inside Deca.

## Tooling
Tool names are case-sensitive. Call tools exactly as listed.
Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps: multi-step work, sensitive actions, or when the user explicitly asks.

## Principles
1. Read before modifying — always check the current state first.
2. Use edit for small changes, write for new files.
3. Be concise. Actions over explanations.
4. When unsure, search first — your training data has a cutoff date.
5. If a task takes time, send a brief acknowledgment before executing.`;

// ============== Agent 核心类 ==============

export class Agent {
  private client: Anthropic;
  private model: string;
  private agentId: string;
  private baseSystemPrompt: string;
  private tools: Tool[];
  private maxTurns: number;
  private workspaceDir: string;
  private toolPolicy?: ToolPolicy;
  private contextTokens: number;
  private sandbox?: {
    enabled: boolean;
    allowExec: boolean;
    allowWrite: boolean;
  };

  // 5 大子系统
  private sessions: SessionManager;
  private memory: MemoryManager;
  private context: ContextLoader;
  private skills: SkillManager;
  private heartbeat: HeartbeatManager;

  // 功能开关
  private enableMemory: boolean;
  private enableContext: boolean;
  private enableSkills: boolean;
  private enableHeartbeat: boolean;

  // Last run usage stats (for cache monitoring)
  private lastUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    timestamp: number;
  } | null = null;

  constructor(config: AgentConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
    });
    this.model =
      config.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
    this.agentId = normalizeAgentId(config.agentId ?? "main");
    this.baseSystemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.tools = config.tools ?? builtinTools;
    this.maxTurns = config.maxTurns ?? 20;
    this.workspaceDir = config.workspaceDir ?? process.cwd();
    this.toolPolicy = config.toolPolicy;
    this.contextTokens = Math.max(
      1,
      Math.floor(config.contextTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS),
    );
    this.sandbox = {
      enabled: config.sandbox?.enabled ?? false,
      allowExec: config.sandbox?.allowExec ?? false,
      allowWrite: config.sandbox?.allowWrite ?? true,
    };

    // 初始化子系统
    // All subsystems now use workspaceDir (unified workspace for personality files and file operations)
    this.sessions = new SessionManager(config.sessionDir);
    this.memory = new MemoryManager(config.memoryDir ?? "./.deca/memory");
    this.context = new ContextLoader(this.workspaceDir);
    this.skills = new SkillManager(this.workspaceDir);
    this.heartbeat = new HeartbeatManager(this.workspaceDir, {
      intervalMs: config.heartbeatInterval,
    });

    // 功能开关
    this.enableMemory = config.enableMemory ?? true;
    this.enableContext = config.enableContext ?? true;
    this.enableSkills = config.enableSkills ?? true;
    this.enableHeartbeat = config.enableHeartbeat ?? false; // 默认关闭自动唤醒
  }

  /**
   * 上下文压缩：裁剪 + 可选摘要
   */
  private async prepareMessagesForRun(params: {
    messages: Message[];
    sessionKey: string;
    runId: string;
  }): Promise<{
    pruned: PruneResult;
    summaryMessage?: Message;
  }> {
    const compacted = await compactHistoryIfNeeded({
      client: this.client,
      model: this.model,
      messages: params.messages,
      contextWindowTokens: this.contextTokens,
    });

    if (compacted.summary && compacted.summaryMessage) {
      emitAgentEvent({
        runId: params.runId,
        stream: "lifecycle",
        sessionKey: params.sessionKey,
        agentId: this.agentId,
        data: {
          phase: "compaction",
          summaryChars: compacted.summary.length,
          droppedMessages: compacted.pruneResult.droppedMessages.length,
        },
      });
    }

    return {
      pruned: compacted.pruneResult,
      summaryMessage: compacted.summaryMessage,
    };
  }

  /**
   * 根据策略/沙箱生成最终可用工具集
   */
  private resolveToolsForRun(): Tool[] {
    let tools = [...this.tools];

    if (!this.enableMemory) {
      tools = tools.filter(
        (tool) => tool.name !== "memory_search" && tool.name !== "memory_get",
      );
    }

    const sandboxPolicy = this.buildSandboxToolPolicy();
    const effectivePolicy = mergeToolPolicies(this.toolPolicy, sandboxPolicy);
    return filterToolsByPolicy(tools, effectivePolicy);
  }

  /**
   * 沙箱策略（示意版）
   * - enable=true 且 allowExec=false 时禁用 exec
   * - allowWrite=false 时禁用 write/edit
   */
  private buildSandboxToolPolicy(): ToolPolicy | undefined {
    if (!this.sandbox?.enabled) {
      return undefined;
    }
    const deny: string[] = [];
    if (!this.sandbox.allowExec) {
      deny.push("exec");
    }
    if (!this.sandbox.allowWrite) {
      deny.push("write", "edit");
    }
    return deny.length > 0 ? { deny } : undefined;
  }

  /**
   * 生成子代理 sessionKey
   */
  private buildSubagentSessionKey(agentId: string): string {
    const id = crypto.randomUUID();
    return `agent:${normalizeAgentId(agentId)}:subagent:${id}`;
  }

  /**
   * 启动子代理（最小版）
   *
   * - 只允许主会话触发
   * - 子代理完成后发出 subagent 事件，并写入父会话记录
   */
  private async spawnSubagent(params: {
    parentSessionKey: string;
    task: string;
    label?: string;
    cleanup?: "keep" | "delete";
  }): Promise<{ runId: string; sessionKey: string }> {
    if (isSubagentSessionKey(params.parentSessionKey)) {
      throw new Error("子代理会话不能再触发子代理");
    }
    const childSessionKey = this.buildSubagentSessionKey(this.agentId);
    const runPromise = this.run(childSessionKey, params.task);
    runPromise
      .then(async (result) => {
        const summary = result.text.slice(0, 600);
        emitAgentEvent({
          runId: result.runId ?? childSessionKey,
          stream: "subagent",
          sessionKey: params.parentSessionKey,
          agentId: this.agentId,
          data: {
            phase: "summary",
            childSessionKey,
            label: params.label,
            task: params.task,
            summary,
          },
        });
        const summaryMsg: Message = {
          role: "user",
          content: `[子代理摘要]\n${summary}`,
          timestamp: Date.now(),
        };
        await this.sessions.append(params.parentSessionKey, summaryMsg);
        if (params.cleanup === "delete") {
          await this.sessions.clear(childSessionKey);
        }
      })
      .catch((err) => {
        emitAgentEvent({
          runId: childSessionKey,
          stream: "subagent",
          sessionKey: params.parentSessionKey,
          agentId: this.agentId,
          data: {
            phase: "error",
            childSessionKey,
            label: params.label,
            task: params.task,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });
    return {
      runId: childSessionKey,
      sessionKey: childSessionKey,
    };
  }

  /**
   * 构建完整系统提示
   */
  private async buildSystemPrompt(params?: {
    sessionKey?: string;
  }): Promise<string> {
    let prompt = this.baseSystemPrompt;
    const availableTools = new Set(
      this.resolveToolsForRun().map((t) => t.name),
    );

    // 注入上下文
    if (this.enableContext) {
      const contextPrompt = await this.context.buildContextPrompt({
        sessionKey: params?.sessionKey,
      });
      if (contextPrompt) {
        prompt += contextPrompt;
      }
    }

    // 注入技能描述
    if (this.enableSkills) {
      const skillsPrompt = await this.skills.buildSkillsPrompt();
      if (skillsPrompt) {
        prompt += skillsPrompt;
      }
    }

    // 注入记忆使用指引（工具化）
    if (
      this.enableMemory &&
      (availableTools.has("memory_search") || availableTools.has("memory_get"))
    ) {
      prompt +=
        "\n\n## Memory\nBefore answering anything about prior work, decisions, preferences, or todos: search with memory_search first, then use memory_get to pull relevant details.";
    }

    // 注入沙箱约束说明
    if (this.sandbox?.enabled) {
      const writeHint = this.sandbox.allowWrite ? "writable" : "read-only";
      const execHint = this.sandbox.allowExec ? "allowed" : "disabled";
      prompt += `\n\n## Sandbox\nSandbox mode active: workspace is ${writeHint}, command execution is ${execHint}.`;
    }

    return prompt;
  }

  /**
   * 将 system prompt 转换为带缓存控制的 TextBlockParam 数组
   * Anthropic 支持 cache_control: { type: 'ephemeral' } 来缓存 system prompt
   * 缓存 TTL 为 5 分钟，读取成本是写入成本的 10%（节省 90%）
   */
  private buildCachedSystemBlocks(
    systemPrompt: string,
  ): Anthropic.TextBlockParam[] {
    return [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ];
  }

  /**
   * 运行 Agent
   */
  async run(
    sessionIdOrKey: string,
    userMessage: string,
    callbacks?: AgentCallbacks,
  ): Promise<RunResult> {
    const sessionKey = resolveSessionKey({
      agentId: this.agentId,
      sessionId: sessionIdOrKey,
      sessionKey: sessionIdOrKey,
    });
    const sessionLane = resolveSessionLane(sessionKey);
    const globalLane = resolveGlobalLane();

    return enqueueInLane(sessionLane, () =>
      enqueueInLane(globalLane, async () => {
        const runId = crypto.randomUUID();
        const startedAt = Date.now();
        emitAgentEvent({
          runId,
          stream: "lifecycle",
          sessionKey,
          agentId: this.agentId,
          data: {
            phase: "start",
            startedAt,
            model: this.model,
          },
        });
        try {
          // 加载历史
          const history = await this.sessions.load(sessionKey);

          let memoriesUsed = 0;
          const toolCtx: ToolContext = {
            workspaceDir: this.workspaceDir,
            sessionKey,
            sessionId: sessionIdOrKey,
            agentId: resolveAgentIdFromSessionKey(sessionKey),
            memory: this.enableMemory ? this.memory : undefined,
            onMemorySearch: (results) => {
              memoriesUsed += results.length;
              callbacks?.onMemorySearch?.(results);
            },
            spawnSubagent: async ({ task, label, cleanup }) =>
              this.spawnSubagent({
                parentSessionKey: sessionKey,
                task,
                label,
                cleanup,
              }),
          };

          let processedMessage = userMessage;
          let skillTriggered: string | undefined;

          // ===== 技能匹配 =====
          if (this.enableSkills) {
            const match = await this.skills.match(userMessage);
            if (match) {
              callbacks?.onSkillMatch?.(match);
              skillTriggered = match.skill.id;
              // 将技能 prompt 注入消息
              const trigger = match.matchedTrigger || "";
              const userPart =
                userMessage.slice(trigger.length).trim() || userMessage;
              processedMessage = `${match.skill.prompt}\n\n用户请求: ${userPart}`;
            }
          }

          // 记忆检索改为工具化调用，不在此自动注入

          // ===== Heartbeat 任务注入 =====
          if (this.enableHeartbeat) {
            const tasksPrompt = await this.heartbeat.buildTasksPrompt();
            if (tasksPrompt) {
              processedMessage += tasksPrompt;
            }
          }

          // 添加用户消息
          const userMsg: Message = {
            role: "user",
            content: processedMessage,
            timestamp: Date.now(),
          };
          await this.sessions.append(sessionKey, userMsg);

          let turns = 0;
          let totalToolCalls = 0;
          let finalText = "";
          // Token usage tracking (accumulated across all turns)
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCacheCreationTokens = 0;
          let totalCacheReadTokens = 0;
          const currentMessages = [...history, userMsg];
          const prep = await this.prepareMessagesForRun({
            messages: currentMessages,
            sessionKey,
            runId,
          });
          const compactionSummary = prep.summaryMessage;
          let cachedPrune = prep.pruned;
          let usedInitialPrune = false;

          // 构建系统提示
          const systemPrompt = await this.buildSystemPrompt({ sessionKey });
          const toolsForRun = this.resolveToolsForRun();

          // ===== Agent Loop =====
          while (turns < this.maxTurns) {
            turns++;
            callbacks?.onTurnStart?.(turns);

            const pruneResult = usedInitialPrune
              ? pruneContextMessages({
                  messages: currentMessages,
                  contextWindowTokens: this.contextTokens,
                })
              : cachedPrune;
            usedInitialPrune = true;
            cachedPrune = pruneResult;
            let messagesForModel = pruneResult.messages;
            if (compactionSummary) {
              messagesForModel = [compactionSummary, ...messagesForModel];
            }

            // 调用 LLM (流式) - 使用 cache_control 缓存 system prompt
            const stream = this.client.messages.stream({
              model: this.model,
              max_tokens: 4096,
              system: this.buildCachedSystemBlocks(systemPrompt),
              tools: toolsForRun.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema,
              })),
              messages: messagesForModel.map((m) => ({
                role: m.role,
                content: m.content,
              })) as Anthropic.MessageParam[],
            });

            // 处理流式响应
            for await (const event of stream) {
              if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  callbacks?.onTextDelta?.(event.delta.text);
                  emitAgentEvent({
                    runId,
                    stream: "assistant",
                    sessionKey,
                    agentId: this.agentId,
                    data: {
                      delta: event.delta.text,
                    },
                  });
                }
              }
            }

            // 获取完整响应
            const response = await stream.finalMessage();

            // 累加 token 使用统计（包含 prompt caching）
            const usage = response.usage;
            totalInputTokens += usage.input_tokens;
            totalOutputTokens += usage.output_tokens;
            totalCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
            totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;

            // 解析响应
            const assistantContent: ContentBlock[] = [];
            const toolCalls: {
              id: string;
              name: string;
              input: Record<string, unknown>;
            }[] = [];

            for (const block of response.content) {
              if (block.type === "text") {
                finalText = block.text;
                callbacks?.onTextComplete?.(block.text);
                assistantContent.push({ type: "text", text: block.text });
                emitAgentEvent({
                  runId,
                  stream: "assistant",
                  sessionKey,
                  agentId: this.agentId,
                  data: {
                    text: block.text,
                    final: true,
                  },
                });
              } else if (block.type === "tool_use") {
                callbacks?.onToolStart?.(block.name, block.input);
                emitAgentEvent({
                  runId,
                  stream: "tool",
                  sessionKey,
                  agentId: this.agentId,
                  data: {
                    phase: "start",
                    name: block.name,
                    input: block.input,
                  },
                });
                assistantContent.push({
                  type: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: block.input as Record<string, unknown>,
                });
                toolCalls.push({
                  id: block.id,
                  name: block.name,
                  input: block.input as Record<string, unknown>,
                });
              }
            }

            // 保存 assistant 消息
            const assistantMsg: Message = {
              role: "assistant",
              content: assistantContent,
              timestamp: Date.now(),
            };
            await this.sessions.append(sessionKey, assistantMsg);
            currentMessages.push(assistantMsg);

            callbacks?.onTurnEnd?.(turns);

            // 没有工具调用，结束
            if (toolCalls.length === 0) {
              break;
            }

            // 执行工具
            totalToolCalls += toolCalls.length;
            const toolResults: ContentBlock[] = [];

            for (const call of toolCalls) {
              const tool = toolsForRun.find((t) => t.name === call.name);
              let result: string;

              if (tool) {
                try {
                  result = await tool.execute(call.input, toolCtx);
                } catch (err) {
                  result = `执行错误: ${(err as Error).message}`;
                }
              } else {
                result = `未知工具: ${call.name}`;
              }

              callbacks?.onToolEnd?.(call.name, result);
              emitAgentEvent({
                runId,
                stream: "tool",
                sessionKey,
                agentId: this.agentId,
                data: {
                  phase: "end",
                  name: call.name,
                  output:
                    result.length > 500 ? `${result.slice(0, 500)}...` : result,
                },
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: result,
              });
            }

            // 添加工具结果
            const resultMsg: Message = {
              role: "user",
              content: toolResults,
              timestamp: Date.now(),
            };
            await this.sessions.append(sessionKey, resultMsg);
            currentMessages.push(resultMsg);
          }

          // ===== 保存到记忆 =====
          if (this.enableMemory && finalText) {
            await this.memory.add(
              `Q: ${userMessage}\nA: ${finalText.slice(0, 500)}`,
              "agent",
              [sessionKey],
            );
          }

          const endedAt = Date.now();
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            sessionKey,
            agentId: this.agentId,
            data: {
              phase: "end",
              startedAt,
              endedAt,
              turns,
              toolCalls: totalToolCalls,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                cacheCreationInputTokens: totalCacheCreationTokens,
                cacheReadInputTokens: totalCacheReadTokens,
              },
            },
          });

          // Save last usage for monitoring (getStatus)
          this.lastUsage = {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheCreationInputTokens: totalCacheCreationTokens,
            cacheReadInputTokens: totalCacheReadTokens,
            timestamp: Date.now(),
          };

          return {
            runId,
            text: finalText,
            turns,
            toolCalls: totalToolCalls,
            skillTriggered,
            memoriesUsed,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              cacheCreationInputTokens: totalCacheCreationTokens,
              cacheReadInputTokens: totalCacheReadTokens,
            },
          };
        } catch (err) {
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            sessionKey,
            agentId: this.agentId,
            data: {
              phase: "error",
              startedAt,
              endedAt: Date.now(),
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      }),
    );
  }

  /**
   * 启动 Heartbeat 监控
   */
  startHeartbeat(
    callback?: (tasks: HeartbeatTask[], request: WakeRequest) => void,
  ): void {
    if (callback) {
      this.heartbeat.onTasks(
        async (tasks, request): Promise<HeartbeatResult> => {
          callback(tasks, request);
          return { status: "ok", tasks };
        },
      );
    }
    this.heartbeat.start();
  }

  /**
   * 停止 Heartbeat 监控
   */
  stopHeartbeat(): void {
    this.heartbeat.stop();
  }

  /**
   * 手动触发 Heartbeat 检查
   */
  async triggerHeartbeat(): Promise<HeartbeatTask[]> {
    return this.heartbeat.trigger();
  }

  /**
   * 重置会话
   */
  async reset(sessionIdOrKey: string): Promise<void> {
    const sessionKey = resolveSessionKey({
      agentId: this.agentId,
      sessionId: sessionIdOrKey,
      sessionKey: sessionIdOrKey,
    });
    await this.sessions.clear(sessionKey);
  }

  /**
   * 获取会话历史
   */
  getHistory(sessionIdOrKey: string): Message[] {
    const sessionKey = resolveSessionKey({
      agentId: this.agentId,
      sessionId: sessionIdOrKey,
      sessionKey: sessionIdOrKey,
    });
    return this.sessions.get(sessionKey);
  }

  /**
   * 列出会话
   */
  async listSessions(): Promise<string[]> {
    return this.sessions.list();
  }

  // ===== 子系统访问器 =====

  getMemory(): MemoryManager {
    return this.memory;
  }

  getContext(): ContextLoader {
    return this.context;
  }

  getSkills(): SkillManager {
    return this.skills;
  }

  getHeartbeat(): HeartbeatManager {
    return this.heartbeat;
  }

  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  async getStatus(sessionKey?: string): Promise<{
    model: string;
    agentId: string;
    contextTokens: number;
    session?: {
      key: string;
      messageCount: number;
      userMessages: number;
      assistantMessages: number;
      totalChars: number;
    };
    lastUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
      timestamp: number;
    };
  }> {
    const base = {
      model: this.model,
      agentId: this.agentId,
      contextTokens: this.contextTokens,
      lastUsage: this.lastUsage ?? undefined,
    };

    if (!sessionKey) {
      return base;
    }

    const sessionStats = await this.sessions.getStats(sessionKey);
    return {
      ...base,
      session: {
        key: sessionKey,
        ...sessionStats,
      },
    };
  }
}
