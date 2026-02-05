/**
 * Echo Handler for Terminal
 *
 * A simple handler that echoes back the input message.
 * Useful for testing the terminal without a real agent.
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

  /** Simulate streaming by sending character by character (default: false) */
  simulateStreaming?: boolean;

  /** Delay between streaming characters in ms (default: 10) */
  streamingDelayMs?: number;
}

/**
 * Create an echo handler for testing
 */
export function createEchoHandler(
  config: EchoHandlerConfig = {},
): MessageHandler {
  const {
    prefix = "Echo: ",
    delayMs = 0,
    simulateStreaming = false,
    streamingDelayMs = 10,
  } = config;

  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      const responseText = `${prefix}${request.content}`;

      // Optional delay
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      // Simulate streaming if enabled and callback provided
      if (simulateStreaming && request.callbacks?.onTextDelta) {
        for (const char of responseText) {
          request.callbacks.onTextDelta(char);
          if (streamingDelayMs > 0) {
            await sleep(streamingDelayMs);
          }
        }
      }

      return {
        text: responseText,
        success: true,
      };
    },
  };
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
