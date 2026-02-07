import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Message } from "discord.js";
import { ReplyQueue } from "./reply-queue";

function createMockMessage(): Message {
  const channel = {
    send: mock(() => Promise.resolve({ id: "sent-msg-id" })),
    sendTyping: mock(() => Promise.resolve()),
    isTextBased: () => true,
  };

  return {
    id: "msg-id",
    reply: mock(() => Promise.resolve({ id: "reply-msg-id" })),
    channel,
  } as unknown as Message;
}

describe("ReplyQueue", () => {
  let queue: ReplyQueue;

  beforeEach(() => {
    queue = new ReplyQueue({ flushIntervalMs: 50 });
  });

  afterEach(() => {
    queue.reset();
  });

  describe("ack replies", () => {
    it("sends ack immediately", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Received", { kind: "ack" });

      expect(message.reply).toHaveBeenCalledWith("Received");
    });

    it("starts flush timer after ack", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Progress 1", { kind: "progress" });
      await queue.enqueue(message, "Progress 2", { kind: "progress" });

      expect(message.reply).toHaveBeenCalledTimes(1);

      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledTimes(2);
      expect(message.reply).toHaveBeenLastCalledWith("Progress 1\nProgress 2");
    });
  });

  describe("final replies", () => {
    it("flushes queue then sends final", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Progress 1", { kind: "progress" });
      await queue.enqueue(message, "Progress 2", { kind: "progress" });
      await queue.enqueue(message, "Done!", { kind: "final" });

      expect(message.reply).toHaveBeenCalledTimes(3);
      expect(message.reply).toHaveBeenNthCalledWith(1, "Ack");
      expect(message.reply).toHaveBeenNthCalledWith(
        2,
        "Progress 1\nProgress 2",
      );
      expect(message.reply).toHaveBeenNthCalledWith(3, "Done!");
    });

    it("stops flush timer after final", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Done!", { kind: "final" });

      const callCount = (message.reply as ReturnType<typeof mock>).mock.calls
        .length;
      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("progress replies", () => {
    it("queues progress without sending immediately", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Progress 1", { kind: "progress" });

      expect(message.reply).toHaveBeenCalledTimes(1);
    });

    it("batches multiple progress into single message", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Step 1", { kind: "progress" });
      await queue.enqueue(message, "Step 2", { kind: "progress" });
      await queue.enqueue(message, "Step 3", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledWith("Step 1\nStep 2\nStep 3");
    });

    it("sends multiple batches over time", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "Batch 1 - Item 1", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 60));

      await queue.enqueue(message, "Batch 2 - Item 1", { kind: "progress" });
      await queue.enqueue(message, "Batch 2 - Item 2", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledTimes(3);
      expect(message.reply).toHaveBeenNthCalledWith(1, "Ack");
      expect(message.reply).toHaveBeenNthCalledWith(2, "Batch 1 - Item 1");
      expect(message.reply).toHaveBeenNthCalledWith(
        3,
        "Batch 2 - Item 1\nBatch 2 - Item 2",
      );
    });
  });

  describe("finish", () => {
    it("flushes remaining queue items", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "P1", { kind: "progress" });
      await queue.enqueue(message, "P2", { kind: "progress" });

      await queue.finish();

      expect(message.reply).toHaveBeenCalledWith("P1\nP2");
    });

    it("stops timer after finish", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.finish();

      const callCount = (message.reply as ReturnType<typeof mock>).mock.calls
        .length;
      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("reset", () => {
    it("clears queue and stops timer", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "P1", { kind: "progress" });

      queue.reset();

      await new Promise((r) => setTimeout(r, 60));

      expect(message.reply).toHaveBeenCalledTimes(1);
    });

    it("allows reuse after reset", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "First Ack", { kind: "ack" });
      queue.reset();

      await queue.enqueue(message, "Second Ack", { kind: "ack" });

      expect(message.reply).toHaveBeenNthCalledWith(1, "First Ack");
      expect(message.reply).toHaveBeenNthCalledWith(2, "Second Ack");
    });
  });

  describe("empty queue", () => {
    it("flush does nothing when queue is empty", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.flush();

      expect(message.reply).toHaveBeenCalledTimes(1);
    });

    it("finish works with empty queue", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.finish();

      expect(message.reply).toHaveBeenCalledTimes(1);
    });
  });

  describe("ordering", () => {
    it("preserves order of queued items", async () => {
      const message = createMockMessage();

      await queue.enqueue(message, "Ack", { kind: "ack" });
      await queue.enqueue(message, "First", { kind: "progress" });
      await queue.enqueue(message, "Second", { kind: "progress" });
      await queue.enqueue(message, "Third", { kind: "progress" });

      await queue.flush();

      expect(message.reply).toHaveBeenLastCalledWith("First\nSecond\nThird");
    });
  });
});
