/**
 * Gateway Core
 *
 * Assembles @deca/agent with channel modules (discord, terminal, http).
 * This is the central composition point of the system.
 */

import type { HeartbeatTask, WakeRequest } from "@deca/agent";
import {
  type DiscordGatewayInstance,
  type SlashCommandsConfig,
  createDiscordGateway,
  registerCommands,
  sendToChannel,
  setupSlashCommands,
} from "@deca/discord";
import { type HttpServer, createHttpServer } from "@deca/http";
import { type Terminal, createTerminal } from "@deca/terminal";
import type { TextBasedChannel } from "discord.js";

import {
  type AgentAdapter,
  createAgentAdapter,
  createEchoAdapter,
} from "./adapter";
import type { Gateway, GatewayConfig, MessageHandler } from "./types";

/**
 * Create a gateway instance
 */
export function createGateway(config: GatewayConfig): Gateway {
  const { discord, terminal, http, events = {} } = config;

  // Track active channels
  const activeChannels: string[] = [];

  // Channel instances
  let discordGateway: DiscordGatewayInstance | null = null;
  let terminalInstance: Terminal | null = null;
  let httpServer: HttpServer | null = null;
  let slashCommandsCleanup: (() => void) | null = null;
  let startTime = 0;

  let isRunning = false;

  let adapter: AgentAdapter | null = null;

  /**
   * Wrap handler with event callbacks
   */
  function wrapHandler(channel: string): MessageHandler {
    return {
      async handle(request) {
        if (!adapter) throw new Error("Adapter not initialized");
        events.onMessage?.(channel, request.sessionKey);

        try {
          const response = await adapter.handle(request);
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

  function formatHeartbeatMessage(tasks: HeartbeatTask[]): string {
    const taskList = tasks
      .map((t, i) => `${i + 1}. ${t.description}`)
      .join("\n");
    return `📋 **Heartbeat** (${tasks.length} pending tasks)\n${taskList}`;
  }

  function setupHeartbeatCallback(): void {
    if (!discord?.heartbeatChannelId || !discordGateway || !adapter) {
      return;
    }

    const channelId = discord.heartbeatChannelId;

    adapter.agent.startHeartbeat(
      async (tasks: HeartbeatTask[], _request: WakeRequest) => {
        if (tasks.length === 0) {
          return;
        }

        try {
          const channel = discordGateway?.client.channels.cache.get(channelId);
          if (channel?.isTextBased()) {
            const message = formatHeartbeatMessage(tasks);
            await sendToChannel(channel as TextBasedChannel, message);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          events.onError?.(err, "heartbeat");
        }
      },
    );
  }

  /**
   * Start the gateway
   */
  async function start(): Promise<void> {
    if (isRunning) {
      return;
    }

    isRunning = true;
    startTime = Date.now();
    events.onStart?.();

    adapter = await createAgentAdapter(config.agent);

    // Start Discord if configured
    if (discord) {
      discordGateway = createDiscordGateway({
        token: discord.token,
        handler: wrapHandler("discord"),
        requireMention: discord.requireMention,
        allowlist: discord.allowlist,
        ignoreBots: discord.ignoreBots,
        debugMode: discord.debugMode,
        events: {
          onError: (error) => events.onError?.(error, "discord"),
        },
      });

      await discordGateway.connect();
      activeChannels.push("discord");

      const shouldEnableSlashCommands =
        discord.enableSlashCommands !== false && discord.clientId;
      if (shouldEnableSlashCommands && discord.clientId) {
        await registerCommands(
          { clientId: discord.clientId, token: discord.token },
          discord.guildId,
        );

        const slashConfig: SlashCommandsConfig = {
          clientId: discord.clientId,
          token: discord.token,
          messageHandler: wrapHandler("discord"),
          agentId: config.agent.agentId,
          onClearSession: async (sessionKey: string) => {
            await adapter?.agent.reset(sessionKey);
          },
          onGetStatus: async () => ({
            uptime: Date.now() - startTime,
            guilds: discordGateway?.client.guilds.cache.size ?? 0,
            pendingMessages: 0,
          }),
        };
        slashCommandsCleanup = setupSlashCommands(
          discordGateway.client,
          slashConfig,
        );
      }

      // Setup heartbeat after Discord is connected
      if (config.agent.enableHeartbeat && discord.heartbeatChannelId) {
        setupHeartbeatCallback();
      }
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
        events.onError?.(
          error instanceof Error ? error : new Error(String(error)),
          "terminal",
        );
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

    // Stop heartbeat first
    adapter?.agent.stopHeartbeat?.();

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
      slashCommandsCleanup?.();
      slashCommandsCleanup = null;
      await discordGateway.shutdown();
      discordGateway = null;
    }

    await adapter?.shutdown();
    adapter = null;

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
      return adapter;
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
  let discordGateway: DiscordGatewayInstance | null = null;
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
        debugMode: discord.debugMode,
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
    get isRunning() {
      return isRunning;
    },
    get handler() {
      return echoHandler;
    },
    get channels() {
      return [...activeChannels];
    },
  };
}
