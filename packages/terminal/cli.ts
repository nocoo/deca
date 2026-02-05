#!/usr/bin/env bun
/**
 * Terminal Standalone CLI
 *
 * Run the Terminal REPL in standalone mode with an echo handler.
 * This is useful for testing the terminal without the full Deca agent.
 *
 * Usage:
 *   bun run packages/terminal/cli.ts
 *
 * Or with bun run:
 *   cd packages/terminal && bun run standalone
 */

import { createTerminal, createEchoHandler } from "./src";

console.log("🖥️  Starting Terminal standalone mode (echo handler)...\n");

const terminal = createTerminal({
  handler: createEchoHandler({ simulateStreaming: true }),
  streaming: true,
  events: {
    onStart: () => {
      console.log("✅ Terminal REPL started");
    },
    onExit: () => {
      console.log("👋 Terminal REPL exited");
    },
    onError: (error) => {
      console.error(`❌ Error: ${error.message}`);
    },
  },
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⏳ Shutting down...");
  terminal.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  terminal.stop();
  process.exit(0);
});

// Start the REPL
await terminal.start();
