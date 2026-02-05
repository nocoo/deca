/**
 * Agent Adapter
 *
 * Bridges channel MessageHandler interface to @deca/agent.
 * This is the core integration point between channels and the agent.
 */

import { Agent, type AgentConfig, type RunResult } from "@deca/agent";
import type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
  AgentAdapterConfig,
} from "./types";

/**
 * Create an agent adapter that implements the MessageHandler interface
 */
export function createAgentAdapter(config: AgentAdapterConfig): MessageHandler {
  const agentConfig: AgentConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    agentId: config.agentId ?? "deca",
    systemPrompt: config.systemPrompt,
    sessionDir: config.sessionDir,
    workspaceDir: config.workspaceDir,
    promptDir: config.promptDir,
    enableMemory: config.enableMemory ?? false,
    enableContext: true,
    enableSkills: true,
    enableHeartbeat: false, // Gateway manages heartbeat separately
  };

  const agent = new Agent(agentConfig);

  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      try {
        const result: RunResult = await agent.run(
          request.sessionKey,
          request.content,
          {
            onTextDelta: request.callbacks?.onTextDelta,
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
