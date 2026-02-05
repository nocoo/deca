/**
 * Echo Handler for HTTP
 *
 * A simple handler that echoes back the input message.
 * Useful for testing the HTTP server without a real agent.
 */

import type { MessageHandler, MessageRequest, MessageResponse } from "./types";

/**
 * Echo handler configuration
 */
export interface EchoHandlerConfig {
  /** Prefix to add to echoed messages (default: "Echo: ") */
  prefix?: string;

  /** Delay before responding in milliseconds (default: 0) */
  delayMs?: number;
}

/**
 * Create an echo handler for testing
 */
export function createEchoHandler(
  config: EchoHandlerConfig = {},
): MessageHandler {
  const { prefix = "Echo: ", delayMs = 0 } = config;

  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      const responseText = `${prefix}${request.content}`;

      // Optional delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      return {
        text: responseText,
        success: true,
      };
    },
  };
}
