/**
 * HTTP Server Implementation
 *
 * A Hono-based HTTP server for handling chat messages.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  HttpServer,
  HttpServerConfig,
  ChatRequestBody,
  ChatResponseBody,
  MessageRequest,
} from "./types";
import {
  DEFAULT_PORT,
  DEFAULT_HOSTNAME,
  API_KEY_HEADER,
} from "./types";
import { generateSessionKey, extractSessionId } from "./session";

/**
 * Create an HTTP server instance
 */
export function createHttpServer(config: HttpServerConfig): HttpServer {
  const {
    handler,
    port = DEFAULT_PORT,
    hostname = DEFAULT_HOSTNAME,
    apiKey,
    corsOrigins = [],
    events = {},
  } = config;

  let server: ReturnType<typeof Bun.serve> | null = null;
  let isRunning = false;
  let actualPort = port;

  // Create Hono app
  const app = new Hono();

  // CORS middleware
  if (corsOrigins.length > 0) {
    app.use(
      "*",
      cors({
        origin: corsOrigins,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", API_KEY_HEADER],
      }),
    );
  }

  // API key middleware (if configured)
  if (apiKey) {
    app.use("*", async (c, next) => {
      // Skip health check
      if (c.req.path === "/health") {
        return next();
      }

      const providedKey = c.req.header(API_KEY_HEADER);
      if (providedKey !== apiKey) {
        return c.json({ error: "unauthorized" }, 401);
      }
      return next();
    });
  }

  // Health check endpoint
  app.get("/health", (c) => {
    events.onRequest?.("/health", "GET");
    return c.json({ ok: true });
  });

  // Chat endpoint
  app.post("/chat", async (c) => {
    events.onRequest?.("/chat", "POST");

    try {
      const body = await c.req.json<ChatRequestBody>();

      if (!body.message) {
        return c.json<ChatResponseBody>(
          {
            response: "",
            sessionId: "",
            success: false,
            error: "message_required",
          },
          400,
        );
      }

      // Generate or use provided session key
      const sessionKey = generateSessionKey({
        sessionId: body.sessionId,
      });
      const sessionId = extractSessionId(sessionKey) ?? "";

      // Create request
      const request: MessageRequest = {
        sessionKey,
        content: body.message,
        sender: {
          id: body.senderId ?? "anonymous",
          username: body.senderId,
        },
      };

      // Handle message
      const response = await handler.handle(request);

      return c.json<ChatResponseBody>({
        response: response.text,
        sessionId,
        success: response.success,
        error: response.error,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      events.onError?.(err);

      return c.json<ChatResponseBody>(
        {
          response: "",
          sessionId: "",
          success: false,
          error: err.message,
        },
        500,
      );
    }
  });

  // Send message endpoint (alias for chat)
  app.post("/message", async (c) => {
    events.onRequest?.("/message", "POST");

    try {
      const body = await c.req.json<{ content: string; sessionKey?: string }>();

      if (!body.content) {
        return c.json({ success: false, error: "content_required" }, 400);
      }

      const sessionKey = body.sessionKey ?? generateSessionKey();

      const request: MessageRequest = {
        sessionKey,
        content: body.content,
        sender: {
          id: "http-client",
        },
      };

      const response = await handler.handle(request);

      return c.json({
        text: response.text,
        sessionKey,
        success: response.success,
        error: response.error,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      events.onError?.(err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * Start the server
   */
  async function start(): Promise<void> {
    if (isRunning) {
      return;
    }

    server = Bun.serve({
      port: actualPort,
      hostname,
      fetch: app.fetch,
    });

    actualPort = server.port;
    isRunning = true;

    events.onStart?.({ hostname, port: actualPort });
  }

  /**
   * Stop the server
   */
  function stop(): void {
    if (!isRunning || !server) {
      return;
    }

    server.stop();
    server = null;
    isRunning = false;

    events.onStop?.();
  }

  return {
    start,
    stop,
    get isRunning() {
      return isRunning;
    },
    get port() {
      return actualPort;
    },
    get app() {
      return app;
    },
  };
}
