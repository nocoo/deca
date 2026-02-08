#!/usr/bin/env bun
/**
 * Capture User ID from Discord Message
 *
 * Listens for messages in mainChannel and prints the sender's user ID.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Client, Events, GatewayIntentBits } from "discord.js";

async function main() {
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  const content = await Bun.file(credPath).text();
  const creds = JSON.parse(content);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.on(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user?.tag}`);
    console.log(
      `📡 Listening for messages in main channel: ${creds.mainChannelId}`,
    );
    console.log(
      "\n🔔 Send a message in the main channel to capture your user ID...\n",
    );
  });

  client.on(Events.MessageCreate, (message) => {
    // Skip bot messages
    if (message.author.bot) return;

    // Only listen to main channel
    if (message.channel.id !== creds.mainChannelId) return;

    console.log("=".repeat(50));
    console.log("📨 Message received!");
    console.log(`   Author: ${message.author.username}`);
    console.log(`   User ID: ${message.author.id}`);
    console.log(`   Content: ${message.content.slice(0, 50)}...`);
    console.log("=".repeat(50));
    console.log(`\n✅ Your user ID is: ${message.author.id}\n`);
    console.log("Add this to ~/.deca/credentials/discord.json:");
    console.log(`   "userId": "${message.author.id}"`);

    // Exit after capturing
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 1000);
  });

  await client.login(creds.botToken);
}

main().catch(console.error);
