/**
 * Agent Adapter
 *
 * Bridges channel MessageHandler interface to @deca/agent.
 * This is the core integration point between channels and the agent.
 */

import {
  Agent,
  type AgentConfig,
  CronService,
  type RunResult,
  createBuiltinToolsWithCron,
} from "@deca/agent";
import type {
  AgentAdapterConfig,
  MessageHandler,
  MessageRequest,
  MessageResponse,
  ReplyMeta,
} from "./types";

export interface AgentAdapter extends MessageHandler {
  readonly agent: Agent;
  readonly cronService?: CronService;
  shutdown(): Promise<void>;
}

/**
 * Create an agent adapter that implements the MessageHandler interface
 */
export async function createAgentAdapter(
  config: AgentAdapterConfig,
): Promise<AgentAdapter> {
  let cronService: CronService | undefined;

  if (config.enableCron) {
    cronService = new CronService({
      storagePath: config.cronStoragePath,
    });
    await cronService.initialize();
  }

  const agentConfig: AgentConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    agentId: config.agentId ?? "deca",
    systemPrompt: config.systemPrompt,
    sessionDir: config.sessionDir,
    workspaceDir: config.workspaceDir,
    enableMemory: config.enableMemory ?? false,
    memoryDir: config.memoryDir,
    enableContext: true,
    enableSkills: true,
    enableHeartbeat: config.enableHeartbeat ?? false,
    heartbeatInterval: config.heartbeatIntervalMs,
    tools: cronService ? createBuiltinToolsWithCron(cronService) : undefined,
  };

  const agent = new Agent(agentConfig);

  return {
    agent,
    cronService,
    async handle(request: MessageRequest): Promise<MessageResponse> {
      try {
        const onReply = request.callbacks?.onReply;

        const result: RunResult = await agent.run(
          request.sessionKey,
          request.content,
          {
            onTextDelta: request.callbacks?.onTextDelta,
            onToolStart: onReply
              ? (name: string) => {
                  onReply(`🔧 正在执行 ${name}...`, {
                    kind: "progress",
                    toolName: name,
                  });
                }
              : undefined,
            onToolEnd: onReply
              ? (name: string) => {
                  onReply(`✅ ${name} 完成`, {
                    kind: "progress",
                    toolName: name,
                  });
                }
              : undefined,
          },
        );

        return {
          text: result.text,
          success: true,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        return {
          text: `Error: ${err.message}`,
          success: false,
          error: err.message,
        };
      }
    },
    async shutdown(): Promise<void> {
      if (cronService) {
        await cronService.shutdown();
      }
    },
  };
}

/**
 * Create an echo adapter for testing (no agent dependency)
 */
export function createEchoAdapter(prefix = "Echo: "): MessageHandler {
  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      const responseText = `${prefix}${request.content}`;

      // Simulate streaming if callback provided
      if (request.callbacks?.onTextDelta) {
        for (const char of responseText) {
          request.callbacks.onTextDelta(char);
        }
      }

      return {
        text: responseText,
        success: true,
      };
    },
  };
}
