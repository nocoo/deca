/**
 * Gateway Core
 *
 * Assembles @deca/agent with channel modules (discord, terminal, http).
 * This is the central composition point of the system.
 */

import {
  createDiscordGateway,
  type DiscordGateway,
} from "@deca/discord";
import {
  createTerminal,
  type Terminal,
} from "@deca/terminal";
import {
  createHttpServer,
  type HttpServer,
} from "@deca/http";

import type {
  Gateway,
  GatewayConfig,
  MessageHandler,
} from "./types";
import { createAgentAdapter, createEchoAdapter } from "./adapter";

/**
 * Create a gateway instance
 */
export function createGateway(config: GatewayConfig): Gateway {
  const { discord, terminal, http, events = {} } = config;

  // Track active channels
  const activeChannels: string[] = [];

  // Channel instances
  let discordGateway: DiscordGateway | null = null;
  let terminalInstance: Terminal | null = null;
  let httpServer: HttpServer | null = null;

  let isRunning = false;

  // Create the message handler (agent adapter)
  const handler: MessageHandler = createAgentAdapter(config.agent);

  /**
   * Wrap handler with event callbacks
   */
  function wrapHandler(channel: string): MessageHandler {
    return {
      async handle(request) {
        events.onMessage?.(channel, request.sessionKey);

        try {
          const response = await handler.handle(request);
          events.onResponse?.(channel, request.sessionKey, response.success);
          return response;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          events.onError?.(err, channel);
          events.onResponse?.(channel, request.sessionKey, false);
          throw error;
        }
      },
    };
  }

  /**
   * Start the gateway
   */
  async function start(): Promise<void> {
    if (isRunning) {
      return;
    }

    isRunning = true;
    events.onStart?.();

    // Start Discord if configured
    if (discord) {
      discordGateway = createDiscordGateway({
        token: discord.token,
        handler: wrapHandler("discord"),
        requireMention: discord.requireMention,
        allowlist: discord.allowlist,
        ignoreBots: discord.ignoreBots,
        events: {
          onError: (error) => events.onError?.(error, "discord"),
        },
      });

      await discordGateway.connect();
      activeChannels.push("discord");
    }

    // Start HTTP if configured
    if (http) {
      httpServer = createHttpServer({
        handler: wrapHandler("http"),
        port: http.port,
        hostname: http.hostname,
        apiKey: http.apiKey,
        corsOrigins: http.corsOrigins,
        events: {
          onError: (error) => events.onError?.(error, "http"),
        },
      });

      await httpServer.start();
      activeChannels.push("http");
    }

    // Start Terminal if configured (must be last as it blocks)
    if (terminal?.enabled !== false && terminal) {
      terminalInstance = createTerminal({
        handler: wrapHandler("terminal"),
        userId: terminal.userId,
        prompt: terminal.prompt,
        streaming: true,
        events: {
          onError: (error) => events.onError?.(error, "terminal"),
        },
      });

      activeChannels.push("terminal");

      // Terminal start is blocking, run in background
      terminalInstance.start().catch((error) => {
        events.onError?.(error instanceof Error ? error : new Error(String(error)), "terminal");
      });
    }
  }

  /**
   * Stop the gateway
   */
  async function stop(): Promise<void> {
    if (!isRunning) {
      return;
    }

    // Stop channels in reverse order
    if (terminalInstance) {
      terminalInstance.stop();
      terminalInstance = null;
    }

    if (httpServer) {
      httpServer.stop();
      httpServer = null;
    }

    if (discordGateway) {
      await discordGateway.shutdown();
      discordGateway = null;
    }

    activeChannels.length = 0;
    isRunning = false;
    events.onStop?.();
  }

  return {
    start,
    stop,
    get isRunning() {
      return isRunning;
    },
    get handler() {
      return handler;
    },
    get channels() {
      return [...activeChannels];
    },
  };
}

/**
 * Create a gateway with echo handler (for testing)
 */
export function createEchoGateway(
  config: Omit<GatewayConfig, "agent"> & { echoPrefix?: string },
): Gateway {
  const echoHandler = createEchoAdapter(config.echoPrefix);

  // Simplified gateway for testing
  const { discord, terminal, http, events = {} } = config;

  const activeChannels: string[] = [];
  let discordGateway: DiscordGateway | null = null;
  let terminalInstance: Terminal | null = null;
  let httpServer: HttpServer | null = null;
  let isRunning = false;

  function wrapHandler(channel: string): MessageHandler {
    return {
      async handle(request) {
        events.onMessage?.(channel, request.sessionKey);
        const response = await echoHandler.handle(request);
        events.onResponse?.(channel, request.sessionKey, response.success);
        return response;
      },
    };
  }

  async function start(): Promise<void> {
    if (isRunning) return;
    isRunning = true;
    events.onStart?.();

    if (discord) {
      discordGateway = createDiscordGateway({
        token: discord.token,
        handler: wrapHandler("discord"),
        requireMention: discord.requireMention,
        allowlist: discord.allowlist,
        ignoreBots: discord.ignoreBots,
      });
      await discordGateway.connect();
      activeChannels.push("discord");
    }

    if (http) {
      httpServer = createHttpServer({
        handler: wrapHandler("http"),
        port: http.port,
        hostname: http.hostname,
        apiKey: http.apiKey,
        corsOrigins: http.corsOrigins,
      });
      await httpServer.start();
      activeChannels.push("http");
    }

    if (terminal?.enabled !== false && terminal) {
      terminalInstance = createTerminal({
        handler: wrapHandler("terminal"),
        userId: terminal.userId,
        prompt: terminal.prompt,
        streaming: true,
      });
      activeChannels.push("terminal");
      terminalInstance.start().catch(() => {});
    }
  }

  async function stop(): Promise<void> {
    if (!isRunning) return;

    terminalInstance?.stop();
    terminalInstance = null;

    httpServer?.stop();
    httpServer = null;

    if (discordGateway) {
      await discordGateway.shutdown();
      discordGateway = null;
    }

    activeChannels.length = 0;
    isRunning = false;
    events.onStop?.();
  }

  return {
    start,
    stop,
    get isRunning() { return isRunning; },
    get handler() { return echoHandler; },
    get channels() { return [...activeChannels]; },
  };
}
