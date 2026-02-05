/**
 * Terminal REPL Implementation
 *
 * A simple REPL (Read-Eval-Print Loop) for terminal-based interaction.
 */

import * as readline from "node:readline";
import type {
  Terminal,
  TerminalConfig,
  MessageRequest,
  MessageResponse,
} from "./types";
import {
  DEFAULT_PROMPT,
  DEFAULT_USER_ID,
  DEFAULT_USERNAME,
  EXIT_COMMANDS,
  HELP_COMMANDS,
} from "./types";
import { generateSessionKey } from "./session";

/**
 * Default welcome message
 */
const DEFAULT_WELCOME = `
Terminal REPL started. Type a message and press Enter.
Commands:
  help, ?     - Show this help
  exit, quit  - Exit the REPL
`;

/**
 * Create a terminal REPL instance
 */
export function createTerminal(config: TerminalConfig): Terminal {
  const {
    handler,
    sessionKey = generateSessionKey({ userId: config.userId }),
    userId = DEFAULT_USER_ID,
    username = DEFAULT_USERNAME,
    prompt = DEFAULT_PROMPT,
    welcomeMessage = DEFAULT_WELCOME,
    streaming = true,
    input = process.stdin,
    output = process.stdout,
    events = {},
  } = config;

  let isRunning = false;
  let rl: readline.Interface | null = null;

  /**
   * Write to output
   */
  function write(text: string): void {
    output.write(text);
  }

  /**
   * Write line to output
   */
  function writeLine(text: string): void {
    write(`${text}\n`);
  }

  /**
   * Show help message
   */
  function showHelp(): void {
    writeLine(welcomeMessage.trim());
  }

  /**
   * Process a single message
   */
  async function processMessage(content: string): Promise<MessageResponse> {
    const trimmed = content.trim();

    // Handle empty input
    if (!trimmed) {
      return { text: "", success: true };
    }

    // Handle exit commands
    if (EXIT_COMMANDS.includes(trimmed.toLowerCase() as typeof EXIT_COMMANDS[number])) {
      return { text: "__EXIT__", success: true };
    }

    // Handle help commands
    if (HELP_COMMANDS.includes(trimmed.toLowerCase() as typeof HELP_COMMANDS[number])) {
      showHelp();
      return { text: "", success: true };
    }

    // Notify message received
    events.onMessage?.(trimmed);

    // Create request
    const request: MessageRequest = {
      sessionKey,
      content: trimmed,
      sender: {
        id: userId,
        username,
      },
      callbacks: streaming
        ? {
            onTextDelta: (delta: string) => {
              write(delta);
            },
          }
        : undefined,
    };

    try {
      const response = await handler.handle(request);

      // If not streaming, print the full response
      if (!streaming && response.text) {
        writeLine(response.text);
      } else if (streaming && response.text) {
        // Ensure newline after streaming
        writeLine("");
      }

      // Notify response
      events.onResponse?.(response);

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      events.onError?.(err);

      const response: MessageResponse = {
        text: `Error: ${err.message}`,
        success: false,
        error: err.message,
      };

      writeLine(response.text);
      return response;
    }
  }

  /**
   * Start the REPL loop
   */
  async function start(): Promise<void> {
    if (isRunning) {
      return;
    }

    isRunning = true;
    events.onStart?.();

    // Show welcome message
    writeLine(welcomeMessage.trim());
    writeLine("");

    // Create readline interface
    rl = readline.createInterface({
      input: input as NodeJS.ReadableStream,
      output: output as NodeJS.WritableStream,
      prompt,
      terminal: (output as typeof process.stdout).isTTY ?? false,
    });

    // Handle lines
    rl.on("line", async (line) => {
      rl?.pause();

      const response = await processMessage(line);

      if (response.text === "__EXIT__") {
        stop();
        return;
      }

      if (isRunning) {
        rl?.resume();
        rl?.prompt();
      }
    });

    // Handle close
    rl.on("close", () => {
      if (isRunning) {
        stop();
      }
    });

    // Show initial prompt
    rl.prompt();

    // Wait until stopped
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Stop the REPL
   */
  function stop(): void {
    if (!isRunning) {
      return;
    }

    isRunning = false;
    rl?.close();
    rl = null;
    events.onExit?.();
    writeLine("Goodbye!");
  }

  /**
   * Send a message programmatically (for testing)
   */
  async function send(content: string): Promise<MessageResponse> {
    return processMessage(content);
  }

  return {
    start,
    stop,
    send,
    get isRunning() {
      return isRunning;
    },
    get sessionKey() {
      return sessionKey;
    },
  };
}
