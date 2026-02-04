/**
 * Discord Slash Commands
 *
 * Implements slash commands for the Discord bot.
 */

import {
  type ChatInputCommandInteraction,
  type Client,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import type { MessageHandler, MessageRequest } from "./types";

/**
 * Slash command handler type
 */
export type SlashCommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

/**
 * Command definition
 */
export interface CommandDefinition {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Command options */
  options?: {
    name: string;
    description: string;
    required?: boolean;
    type: "string" | "integer" | "boolean";
  }[];
  /** Command handler */
  handler: SlashCommandHandler;
}

/**
 * Slash commands configuration
 */
export interface SlashCommandsConfig {
  /** Application/Client ID */
  clientId: string;
  /** Bot token */
  token: string;
  /** Message handler for /ask command */
  messageHandler: MessageHandler;
  /** Agent ID for session keys */
  agentId?: string;
  /** Session clearer callback */
  onClearSession?: (sessionKey: string) => Promise<void>;
  /** Status callback */
  onGetStatus?: () => Promise<{
    uptime: number;
    guilds: number;
    pendingMessages: number;
  }>;
}

/**
 * Build slash command data for registration.
 *
 * @returns Array of slash command JSON data
 */
export function buildCommands(): unknown[] {
  const askCommand = new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the AI agent a question")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Your question")
        .setRequired(true),
    );

  const clearCommand = new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear conversation history");

  const statusCommand = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check bot status");

  return [askCommand.toJSON(), clearCommand.toJSON(), statusCommand.toJSON()];
}

/**
 * Register slash commands with Discord.
 *
 * @param config - Registration config
 * @param guildId - Optional guild ID for guild-specific commands (faster for testing)
 */
export async function registerCommands(
  config: { clientId: string; token: string },
  guildId?: string,
): Promise<void> {
  const rest = new REST().setToken(config.token);
  const commands = buildCommands();

  if (guildId) {
    // Guild-specific registration (instant)
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, guildId),
      { body: commands },
    );
  } else {
    // Global registration (can take up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });
  }
}

/**
 * Create session key for slash command interaction.
 */
function createSessionKey(
  interaction: ChatInputCommandInteraction,
  agentId = "deca",
): string {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;

  if (guildId) {
    return `discord:${agentId}:guild:${guildId}:${channelId}:${userId}`;
  }
  return `discord:${agentId}:dm:${userId}`;
}

/**
 * Set up slash command interaction handler.
 *
 * @param client - Discord client
 * @param config - Commands configuration
 * @returns Cleanup function
 */
export function setupSlashCommands(
  client: Client,
  config: SlashCommandsConfig,
): () => void {
  const onInteraction = async (
    interaction: ChatInputCommandInteraction,
  ): Promise<void> => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      switch (commandName) {
        case "ask":
          await handleAskCommand(interaction, config);
          break;
        case "clear":
          await handleClearCommand(interaction, config);
          break;
        case "status":
          await handleStatusCommand(interaction, config);
          break;
        default:
          await interaction.reply({
            content: "Unknown command",
            ephemeral: true,
          });
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "An error occurred";

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `⚠️ Error: ${errorMsg}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `⚠️ Error: ${errorMsg}`,
          ephemeral: true,
        });
      }
    }
  };

  client.on(Events.InteractionCreate, onInteraction as never);

  return () => {
    client.off(Events.InteractionCreate, onInteraction as never);
  };
}

/**
 * Handle /ask command
 */
async function handleAskCommand(
  interaction: ChatInputCommandInteraction,
  config: SlashCommandsConfig,
): Promise<void> {
  const question = interaction.options.getString("question", true);
  const sessionKey = createSessionKey(interaction, config.agentId);

  // Defer reply as processing may take time
  await interaction.deferReply();

  const request: MessageRequest = {
    sessionKey,
    content: question,
    sender: {
      id: interaction.user.id,
      username: interaction.user.username,
      displayName: interaction.user.displayName,
    },
    channel: {
      id: interaction.channelId,
      name: undefined,
      type: interaction.guildId ? "guild" : "dm",
      guildId: interaction.guildId ?? undefined,
    },
  };

  const response = await config.messageHandler.handle(request);

  if (response.success && response.text) {
    await interaction.editReply(response.text);
  } else {
    await interaction.editReply(`⚠️ ${response.error || "Failed to process"}`);
  }
}

/**
 * Handle /clear command
 */
async function handleClearCommand(
  interaction: ChatInputCommandInteraction,
  config: SlashCommandsConfig,
): Promise<void> {
  const sessionKey = createSessionKey(interaction, config.agentId);

  if (config.onClearSession) {
    await config.onClearSession(sessionKey);
    await interaction.reply({
      content: "✅ Conversation history cleared",
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: "⚠️ Session clearing not configured",
      ephemeral: true,
    });
  }
}

/**
 * Handle /status command
 */
async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  config: SlashCommandsConfig,
): Promise<void> {
  if (config.onGetStatus) {
    const status = await config.onGetStatus();
    const uptimeHours = (status.uptime / 3600000).toFixed(1);

    await interaction.reply({
      content: [
        "📊 **Bot Status**",
        `• Uptime: ${uptimeHours} hours`,
        `• Servers: ${status.guilds}`,
        `• Pending messages: ${status.pendingMessages}`,
      ].join("\n"),
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: "✅ Bot is running",
      ephemeral: true,
    });
  }
}
