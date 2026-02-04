/**
 * Discord Agent Adapter
 *
 * Bridges the Discord MessageHandler interface to @deca/agent.
 * This is the only module in the Discord integration that depends on @deca/agent.
 */

import type { Agent, RunResult } from "@deca/agent";
import type {
  MessageHandler,
  MessageRequest,
  MessageResponse,
} from "../channels/discord/types";

/**
 * Configuration for the Discord Agent adapter
 */
export interface DiscordAgentAdapterConfig {
  /** The Agent instance to use */
  agent: Agent;

  /** Custom system prompt for Discord context */
  systemPrompt?: string;

  /** Include channel/user context in messages */
  includeContext?: boolean;

  /** Working directory for file operations */
  workDir?: string;
}

/**
 * Create a MessageHandler that bridges to @deca/agent.
 *
 * @param config - Adapter configuration
 * @returns MessageHandler implementation
 */
export function createDiscordAgentAdapter(
  config: DiscordAgentAdapterConfig,
): MessageHandler {
  const { agent, systemPrompt, includeContext = false, workDir } = config;

  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      try {
        // Build the message to send to agent
        const message = includeContext
          ? buildContextualMessage(request)
          : request.content;

        // Run the agent
        const result: RunResult = await agent.run(message, {
          sessionKey: request.sessionKey,
          systemPrompt,
          workDir,
        });

        // Convert result to MessageResponse
        if (result.success) {
          return {
            text: result.response || "",
            success: true,
          };
        }

        return {
          text: "",
          success: false,
          error: result.error || "Agent returned unsuccessful result",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        return {
          text: "",
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}

/**
 * Build a message with context information.
 */
function buildContextualMessage(request: MessageRequest): string {
  const parts: string[] = [];

  // Add context header
  const contextLines: string[] = [];

  if (request.sender.displayName) {
    contextLines.push(
      `User: ${request.sender.displayName} (@${request.sender.username})`,
    );
  } else {
    contextLines.push(`User: @${request.sender.username}`);
  }

  if (request.channel.name) {
    contextLines.push(`Channel: #${request.channel.name}`);
  }

  if (request.channel.guildName) {
    contextLines.push(`Server: ${request.channel.guildName}`);
  }

  if (contextLines.length > 0) {
    parts.push(`[Context: ${contextLines.join(" | ")}]`);
  }

  // Add the actual message
  parts.push(request.content);

  return parts.join("\n");
}
