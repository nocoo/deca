import { describe, expect, mock, test } from "bun:test";
import type { ChatInputCommandInteraction, Client } from "discord.js";
import { buildCommands, setupSlashCommands } from "./slash-commands";
import type { MessageHandler, MessageResponse } from "./types";

// Mock interaction factory
function createMockInteraction(
  commandName: string,
  options: Record<string, string> = {},
): ChatInputCommandInteraction {
  const interaction = {
    isChatInputCommand: () => true,
    commandName,
    user: {
      id: "user123",
      username: "testuser",
      displayName: "Test User",
    },
    channelId: "channel456",
    guildId: "guild789",
    options: {
      getString: (name: string) => options[name] ?? null,
    },
    reply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    followUp: mock(() => Promise.resolve()),
    deferReply: mock(() => {
      interaction.deferred = true;
      return Promise.resolve();
    }),
    replied: false,
    deferred: false,
  };
  return interaction as unknown as ChatInputCommandInteraction;
}

function createMockClient(): Client {
  return {
    on: mock(() => {}),
    off: mock(() => {}),
  } as unknown as Client;
}

function createMockHandler(
  response: MessageResponse = { text: "OK", success: true },
): MessageHandler {
  return {
    handle: mock(() => Promise.resolve(response)),
  };
}

describe("slash-commands", () => {
  describe("buildCommands", () => {
    test("returns array of command definitions", () => {
      const commands = buildCommands();

      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBe(3);
    });

    test("includes /ask command", () => {
      const commands = buildCommands() as { name: string }[];
      const askCmd = commands.find((c) => c.name === "ask");

      expect(askCmd).toBeDefined();
    });

    test("includes /clear command", () => {
      const commands = buildCommands() as { name: string }[];
      const clearCmd = commands.find((c) => c.name === "clear");

      expect(clearCmd).toBeDefined();
    });

    test("includes /status command", () => {
      const commands = buildCommands() as { name: string }[];
      const statusCmd = commands.find((c) => c.name === "status");

      expect(statusCmd).toBeDefined();
    });
  });

  describe("setupSlashCommands", () => {
    test("returns cleanup function", () => {
      const client = createMockClient();
      const handler = createMockHandler();

      const cleanup = setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      expect(typeof cleanup).toBe("function");
    });

    test("registers interaction listener", () => {
      const client = createMockClient();
      const handler = createMockHandler();

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      expect(client.on).toHaveBeenCalled();
    });
  });

  describe("/ask command", () => {
    test("calls message handler with question", async () => {
      const client = createMockClient();
      const handler = createMockHandler({ text: "Answer", success: true });

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      // Get the registered handler
      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("ask", {
        question: "What is 2+2?",
      });
      await interactionHandler(interaction);

      expect(handler.handle).toHaveBeenCalled();
      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith("Answer");
    });
  });

  describe("/clear command", () => {
    test("calls onClearSession callback", async () => {
      const client = createMockClient();
      const handler = createMockHandler();
      const onClearSession = mock(() => Promise.resolve());

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
        onClearSession,
      });

      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("clear");
      await interactionHandler(interaction);

      expect(onClearSession).toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalled();
    });

    test("shows warning when onClearSession not configured", async () => {
      const client = createMockClient();
      const handler = createMockHandler();

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("clear");
      await interactionHandler(interaction);

      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as ReturnType<typeof mock>).mock
        .calls[0];
      expect(replyCall[0].content).toContain("not configured");
    });
  });

  describe("/status command", () => {
    test("calls onGetStatus callback", async () => {
      const client = createMockClient();
      const handler = createMockHandler();
      const onGetStatus = mock(() =>
        Promise.resolve({
          uptime: 3600000,
          guilds: 5,
          pendingMessages: 2,
        }),
      );

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
        onGetStatus,
      });

      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("status");
      await interactionHandler(interaction);

      expect(onGetStatus).toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalled();
    });

    test("shows simple message when onGetStatus not configured", async () => {
      const client = createMockClient();
      const handler = createMockHandler();

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("status");
      await interactionHandler(interaction);

      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as ReturnType<typeof mock>).mock
        .calls[0];
      expect(replyCall[0].content).toContain("running");
    });
  });

  describe("error handling", () => {
    test("replies with error on handler failure", async () => {
      const client = createMockClient();
      const handler: MessageHandler = {
        handle: mock(() => Promise.reject(new Error("Handler error"))),
      };

      setupSlashCommands(client, {
        clientId: "client123",
        token: "token123",
        messageHandler: handler,
      });

      const onCall = (client.on as ReturnType<typeof mock>).mock.calls[0];
      const interactionHandler = onCall[1];

      const interaction = createMockInteraction("ask", {
        question: "test",
      });
      await interactionHandler(interaction);

      // Should use followUp since deferReply was called
      expect(interaction.followUp).toHaveBeenCalled();
    });
  });
});
