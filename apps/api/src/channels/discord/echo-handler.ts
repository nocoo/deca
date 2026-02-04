/**
 * Echo Handler for Testing
 *
 * A simple MessageHandler that echoes back the received message.
 * Useful for testing the Discord gateway without a real agent.
 */

import type { MessageHandler, MessageRequest, MessageResponse } from "./types";

/**
 * Configuration for the echo handler
 */
export interface EchoHandlerConfig {
  /** Prefix to add before echoed content (default: "Echo: ") */
  prefix?: string;

  /** Include sender info in response */
  includeSender?: boolean;

  /** Include channel info in response */
  includeChannel?: boolean;

  /** Include session key in response */
  includeSession?: boolean;

  /** Artificial delay in milliseconds (for testing async behavior) */
  delay?: number;

  /** Always return an error response */
  simulateError?: boolean;

  /** Return error if content matches this pattern */
  errorOnPattern?: RegExp;

  /** Custom error message */
  errorMessage?: string;
}

/**
 * Create an echo handler for testing.
 *
 * @param config - Handler configuration
 * @returns MessageHandler that echoes messages
 */
export function createEchoHandler(
  config: EchoHandlerConfig = {},
): MessageHandler {
  const {
    prefix = "Echo: ",
    includeSender = false,
    includeChannel = false,
    includeSession = false,
    delay = 0,
    simulateError = false,
    errorOnPattern,
    errorMessage = "Simulated error",
  } = config;

  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      // Simulate delay if configured
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Check for simulated error
      if (simulateError) {
        return {
          text: "",
          success: false,
          error: errorMessage,
        };
      }

      // Check error pattern
      if (errorOnPattern?.test(request.content)) {
        return {
          text: "",
          success: false,
          error: `Pattern matched: ${errorOnPattern}`,
        };
      }

      // Build response text
      const parts: string[] = [];

      parts.push(`${prefix}${request.content}`);

      if (includeSender) {
        const senderInfo = request.sender.displayName
          ? `${request.sender.displayName} (@${request.sender.username})`
          : `@${request.sender.username}`;
        parts.push(`From: ${senderInfo}`);
      }

      if (includeChannel) {
        const channelInfo = request.channel.name
          ? `#${request.channel.name}`
          : `Channel ${request.channel.id}`;
        parts.push(`Channel: ${channelInfo} (${request.channel.type})`);
      }

      if (includeSession) {
        parts.push(`Session: ${request.sessionKey}`);
      }

      return {
        text: parts.join("\n"),
        success: true,
      };
    },
  };
}
