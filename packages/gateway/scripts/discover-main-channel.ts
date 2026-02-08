#!/usr/bin/env bun
/**
 * Discover Main Channel ID
 *
 * Sends a message via the main webhook and captures the channel ID from the response.
 * This is needed to configure mainChannelId for session routing.
 */

import { homedir } from "node:os";
import { join } from "node:path";

const MAIN_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1469830038357807276/sy9Cc8I-MOpE52yifcw-y5werTDL02_nvuK-WEPyYT1mYM1CLA4ZA3Gvq2Kw4-GMtkZu";

interface WebhookResponse {
  id: string;
  channel_id: string;
  // ... other fields
}

async function main() {
  console.log("🔍 Discovering Main Channel ID...\n");

  // Send a test message via webhook with wait=true to get full response
  const response = await fetch(`${MAIN_WEBHOOK_URL}?wait=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: `[Discovery] Channel ID probe - ${new Date().toISOString()}`,
    }),
  });

  if (!response.ok) {
    console.error(
      `❌ Webhook failed: ${response.status} ${response.statusText}`,
    );
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const data = (await response.json()) as WebhookResponse;

  console.log("✅ Message sent successfully!");
  console.log(`   Message ID: ${data.id}`);
  console.log(`   Channel ID: ${data.channel_id}`);

  // Show how to update credentials
  const credPath = join(homedir(), ".deca", "credentials", "discord.json");
  console.log("\n📝 Add these to your credentials file:");
  console.log(`   File: ${credPath}`);
  console.log(`\n   "mainWebhookUrl": "${MAIN_WEBHOOK_URL}",`);
  console.log(`   "mainChannelId": "${data.channel_id}"`);

  // Also output as JSON for easy copy
  console.log("\n📋 JSON snippet:");
  console.log(
    JSON.stringify(
      {
        mainWebhookUrl: MAIN_WEBHOOK_URL,
        mainChannelId: data.channel_id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
