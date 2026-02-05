#!/usr/bin/env bun
/**
 * HTTP Standalone CLI
 *
 * Run the HTTP server in standalone mode with an echo handler.
 * This is useful for testing the HTTP API without the full Deca agent.
 *
 * Usage:
 *   bun run packages/http/cli.ts
 *   PORT=8080 bun run packages/http/cli.ts
 */

import { createHttpServer, createEchoHandler } from "./src";

const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.API_KEY;

console.log("🌐 Starting HTTP standalone mode (echo handler)...\n");

const server = createHttpServer({
  handler: createEchoHandler(),
  port,
  apiKey,
  events: {
    onStart: ({ hostname, port }) => {
      console.log(`✅ Server listening on http://${hostname}:${port}`);
      console.log("");
      console.log("Endpoints:");
      console.log("  GET  /health  - Health check");
      console.log("  POST /chat    - Send chat message");
      console.log("  POST /message - Send message (alternative)");
      console.log("");
      if (apiKey) {
        console.log(`🔑 API Key required: ${apiKey.slice(0, 4)}...`);
      } else {
        console.log("⚠️  No API key configured (set API_KEY env var)");
      }
      console.log("");
      console.log("Example:");
      console.log(`  curl -X POST http://127.0.0.1:${port}/chat \\`);
      console.log('    -H "Content-Type: application/json" \\');
      console.log('    -d \'{"message": "hello"}\'');
      console.log("");
      console.log("Press Ctrl+C to stop.\n");
    },
    onStop: () => {
      console.log("👋 Server stopped");
    },
    onRequest: (path, method) => {
      console.log(`📥 ${method} ${path}`);
    },
    onError: (error) => {
      console.error(`❌ Error: ${error.message}`);
    },
  },
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⏳ Shutting down...");
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});

// Start the server
await server.start();
