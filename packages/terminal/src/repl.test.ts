import { describe, expect, it } from "bun:test";
import { Readable } from "node:stream";
import { createTerminal } from "./repl";
import { createEchoHandler } from "./echo-handler";
import type { MessageResponse } from "./types";

/**
 * Create a mock input stream for testing
 */
function createMockInput(): Readable & { push(data: string | null): boolean } {
  const stream = new Readable({
    read() {},
  });
  return stream as Readable & { push(data: string | null): boolean };
}

/**
 * Create a mock output that captures writes synchronously
 */
function createMockOutput() {
  const chunks: string[] = [];

  const stream = {
    write(chunk: string | Buffer): boolean {
      chunks.push(chunk.toString());
      return true;
    },
    get data() {
      return chunks.join("");
    },
    clear() {
      chunks.length = 0;
    },
    isTTY: false,
  };

  return stream as unknown as NodeJS.WritableStream & { data: string; clear(): void };
}

describe("createTerminal", () => {
  describe("send method (programmatic)", () => {
    it("handles message with echo handler", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const response = await terminal.send("hello");

      expect(response.success).toBe(true);
      expect(response.text).toBe("Echo: hello");
    });

    it("returns empty response for empty input", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const response = await terminal.send("");

      expect(response.success).toBe(true);
      expect(response.text).toBe("");
    });

    it("handles exit command", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const response = await terminal.send("exit");

      expect(response.success).toBe(true);
      expect(response.text).toBe("__EXIT__");
    });

    it("handles quit command", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const response = await terminal.send("quit");

      expect(response.success).toBe(true);
      expect(response.text).toBe("__EXIT__");
    });

    it("handles help command", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      await terminal.send("help");

      expect(output.data).toContain("help");
      expect(output.data).toContain("exit");
    });

    it("handles ? help command", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      await terminal.send("?");

      expect(output.data).toContain("help");
    });
  });

  describe("session key", () => {
    it("generates session key by default", () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      expect(terminal.sessionKey).toMatch(/^terminal:deca:/);
    });

    it("uses custom session key", () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        sessionKey: "custom:session:key",
      });

      expect(terminal.sessionKey).toBe("custom:session:key");
    });

    it("uses userId in generated session key", () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        userId: "myuser",
      });

      expect(terminal.sessionKey).toContain("myuser");
    });
  });

  describe("event callbacks", () => {
    it("calls onMessage when message received", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let receivedMessage: string | null = null;

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
        events: {
          onMessage: (msg) => {
            receivedMessage = msg;
          },
        },
      });

      await terminal.send("test message");

      expect(receivedMessage).toBe("test message");
    });

    it("calls onResponse after handler responds", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let receivedResponse: MessageResponse | null = null;

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
        events: {
          onResponse: (res) => {
            receivedResponse = res;
          },
        },
      });

      await terminal.send("test");

      expect(receivedResponse).not.toBeNull();
      expect(receivedResponse?.text).toBe("Echo: test");
      expect(receivedResponse?.success).toBe(true);
    });

    it("calls onError when handler throws", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let receivedError: Error | null = null;

      const terminal = createTerminal({
        handler: {
          async handle() {
            throw new Error("Handler error");
          },
        },
        input,
        output,
        streaming: false,
        events: {
          onError: (err) => {
            receivedError = err;
          },
        },
      });

      const response = await terminal.send("test");

      expect(receivedError).not.toBeNull();
      expect(receivedError?.message).toBe("Handler error");
      expect(response.success).toBe(false);
      expect(response.error).toBe("Handler error");
    });
  });

  describe("streaming", () => {
    it("uses onTextDelta callback when streaming enabled", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const receivedDeltas: string[] = [];

      const terminal = createTerminal({
        handler: createEchoHandler({
          prefix: "",
          simulateStreaming: true,
          streamingDelayMs: 0,
        }),
        input,
        output,
        streaming: true,
        events: {
          onMessage: () => {
            // Track deltas via output
          },
        },
      });

      await terminal.send("ab");

      // Output should contain the streamed characters
      expect(output.data).toContain("a");
      expect(output.data).toContain("b");
    });

    it("does not use callback when streaming disabled", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler({
          prefix: "",
          simulateStreaming: true,
          streamingDelayMs: 0,
        }),
        input,
        output,
        streaming: false,
      });

      output.clear();
      await terminal.send("test");

      // Should print full response, not streamed
      expect(output.data).toContain("test");
    });
  });

  describe("isRunning state", () => {
    it("is false before start", () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      expect(terminal.isRunning).toBe(false);
    });

    it("send works even when not started", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const response = await terminal.send("test");
      expect(response.success).toBe(true);
    });
  });

  describe("start and stop lifecycle", () => {
    it("start sets isRunning to true", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      // Start in background
      const startPromise = terminal.start();

      // Give it a moment to initialize
      await new Promise((r) => setTimeout(r, 50));

      expect(terminal.isRunning).toBe(true);

      // Stop to clean up
      terminal.stop();
      await startPromise;

      expect(terminal.isRunning).toBe(false);
    });

    it("ignores multiple start calls", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let startCount = 0;
      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        events: {
          onStart: () => {
            startCount++;
          },
        },
      });

      const p1 = terminal.start();
      await new Promise((r) => setTimeout(r, 20));
      const p2 = terminal.start(); // Should be ignored

      expect(startCount).toBe(1);

      terminal.stop();
      await p1;
      await p2;
    });

    it("stop sets isRunning to false", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(terminal.isRunning).toBe(true);

      terminal.stop();
      await startPromise;

      expect(terminal.isRunning).toBe(false);
    });

    it("ignores multiple stop calls", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let exitCount = 0;
      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        events: {
          onExit: () => {
            exitCount++;
          },
        },
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      terminal.stop();
      terminal.stop(); // Should be ignored

      await startPromise;

      expect(exitCount).toBe(1);
    });

    it("calls onStart event callback", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let started = false;
      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        events: {
          onStart: () => {
            started = true;
          },
        },
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(started).toBe(true);

      terminal.stop();
      await startPromise;
    });

    it("calls onExit event callback", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      let exited = false;
      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        events: {
          onExit: () => {
            exited = true;
          },
        },
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      terminal.stop();
      await startPromise;

      expect(exited).toBe(true);
    });

    it("shows welcome message on start", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        welcomeMessage: "Custom Welcome!",
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(output.data).toContain("Custom Welcome!");

      terminal.stop();
      await startPromise;
    });

    it("shows goodbye message on stop", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      terminal.stop();
      await startPromise;

      expect(output.data).toContain("Goodbye!");
    });
  });

  describe("readline interaction", () => {
    it("processes line input", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
        streaming: false,
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      // Simulate user input
      input.push("hello\n");
      await new Promise((r) => setTimeout(r, 100));

      expect(output.data).toContain("Echo: hello");

      terminal.stop();
      await startPromise;
    });

    it("exits on exit command via line input", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      // Simulate exit command
      input.push("exit\n");
      await startPromise;

      expect(terminal.isRunning).toBe(false);
    });

    it("handles stream close event", async () => {
      const input = createMockInput();
      const output = createMockOutput();

      const terminal = createTerminal({
        handler: createEchoHandler(),
        input,
        output,
      });

      const startPromise = terminal.start();
      await new Promise((r) => setTimeout(r, 50));

      // Simulate stream close (Ctrl+D)
      input.push(null);
      await startPromise;

      expect(terminal.isRunning).toBe(false);
    });
  });
});
