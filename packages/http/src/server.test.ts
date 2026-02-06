import { afterEach, describe, expect, it } from "bun:test";
import { createEchoHandler } from "./echo-handler";
import { createHttpServer } from "./server";
import type { HttpServer } from "./types";

// Track servers to clean up
const servers: HttpServer[] = [];

afterEach(() => {
  for (const server of servers) {
    if (server.isRunning) {
      server.stop();
    }
  }
  servers.length = 0;
});

function createTestServer(config: Parameters<typeof createHttpServer>[0]) {
  const server = createHttpServer({
    port: 0, // Random available port
    ...config,
  });
  servers.push(server);
  return server;
}

describe("createHttpServer", () => {
  describe("lifecycle", () => {
    it("starts and stops correctly", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      expect(server.isRunning).toBe(false);

      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      server.stop();
      expect(server.isRunning).toBe(false);
    });

    it("calls event callbacks", async () => {
      let started = false;
      let stopped = false;
      let startInfo: { hostname: string; port: number } | null = null;

      const server = createTestServer({
        handler: createEchoHandler(),
        events: {
          onStart: (info) => {
            started = true;
            startInfo = info;
          },
          onStop: () => {
            stopped = true;
          },
        },
      });

      await server.start();
      expect(started).toBe(true);
      expect(startInfo).not.toBeNull();
      expect(startInfo?.port).toBeGreaterThan(0);

      server.stop();
      expect(stopped).toBe(true);
    });

    it("ignores multiple start calls", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();
      const port1 = server.port;

      await server.start();
      const port2 = server.port;

      expect(port1).toBe(port2);
    });

    it("ignores stop when not running", () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      server.stop();
      expect(server.isRunning).toBe(false);
    });

    it("exposes app instance", () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      expect(server.app).toBeDefined();
      expect(typeof server.app.fetch).toBe("function");
    });
  });

  describe("/health endpoint", () => {
    it("returns ok", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ ok: true });
    });

    it("bypasses API key check", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        apiKey: "secret-key",
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe("/chat endpoint", () => {
    it("handles chat message", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.response).toBe("Echo: hello");
      expect(data.sessionId).toBeDefined();
    });

    it("uses provided senderId as session identity", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test", senderId: "user-123" }),
      });

      const data = await response.json();

      expect(data.sessionId).toBe("user-123");
    });

    it("returns error for missing message", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("message_required");
    });

    it("handles handler errors", async () => {
      const server = createTestServer({
        handler: {
          async handle() {
            throw new Error("Handler failed");
          },
        },
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Handler failed");
    });
  });

  describe("/message endpoint", () => {
    it("handles message", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.text).toBe("Echo: hello");
      expect(data.sessionKey).toBeDefined();
    });

    it("uses provided session key", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "test",
          sessionKey: "custom:session:key",
        }),
      });

      const data = await response.json();

      expect(data.sessionKey).toBe("custom:session:key");
    });

    it("returns error for missing content", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("content_required");
    });

    it("handles handler errors", async () => {
      let receivedError: Error | null = null;

      const server = createTestServer({
        handler: {
          async handle() {
            throw new Error("Message handler failed");
          },
        },
        events: {
          onError: (err) => {
            receivedError = err;
          },
        },
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });

      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Message handler failed");
      expect(receivedError?.message).toBe("Message handler failed");
    });
  });

  describe("API key authentication", () => {
    it("rejects requests without API key", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        apiKey: "secret-key",
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with wrong API key", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        apiKey: "secret-key",
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "wrong-key",
        },
        body: JSON.stringify({ message: "test" }),
      });

      expect(response.status).toBe(401);
    });

    it("accepts requests with correct API key", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        apiKey: "secret-key",
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret-key",
        },
        body: JSON.stringify({ message: "test" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("event callbacks", () => {
    it("calls onRequest for each request", async () => {
      const requests: Array<{ path: string; method: string }> = [];

      const server = createTestServer({
        handler: createEchoHandler(),
        events: {
          onRequest: (path, method) => {
            requests.push({ path, method });
          },
        },
      });

      await server.start();

      await fetch(`http://127.0.0.1:${server.port}/health`);
      await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      expect(requests).toEqual([
        { path: "/health", method: "GET" },
        { path: "/chat", method: "POST" },
      ]);
    });

    it("calls onError when handler throws", async () => {
      let receivedError: Error | null = null;

      const server = createTestServer({
        handler: {
          async handle() {
            throw new Error("Test error");
          },
        },
        events: {
          onError: (err) => {
            receivedError = err;
          },
        },
      });

      await server.start();

      await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      expect(receivedError).not.toBeNull();
      expect(receivedError?.message).toBe("Test error");
    });
  });

  describe("CORS middleware", () => {
    it("adds CORS headers when origins configured", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        corsOrigins: ["http://localhost:3000"],
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
        headers: {
          Origin: "http://localhost:3000",
        },
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:3000",
      );
    });

    it("handles preflight OPTIONS request", async () => {
      const server = createTestServer({
        handler: createEchoHandler(),
        corsOrigins: ["http://localhost:3000"],
      });

      await server.start();

      const response = await fetch(`http://127.0.0.1:${server.port}/chat`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST",
      );
    });
  });
});
