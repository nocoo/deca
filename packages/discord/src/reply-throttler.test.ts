import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Message } from "discord.js";
import { ReplyThrottler } from "./reply-throttler";

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

describe("ReplyThrottler", () => {
  let throttler: ReplyThrottler;

  beforeEach(() => {
    throttler = new ReplyThrottler({ minIntervalMs: 100, maxProgress: 2 });
  });

  afterEach(() => {
    throttler.reset();
  });

  describe("ack replies", () => {
    it("always sends ack immediately", async () => {
      const message = createMockMessage();

      const sent = await throttler.maybeReply(message, "Received", {
        kind: "ack",
      });

      expect(sent).toBe(true);
      expect(message.reply).toHaveBeenCalledWith("Received");
    });

    it("sends multiple acks without throttling", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack 1", { kind: "ack" });
      await throttler.maybeReply(message, "Ack 2", { kind: "ack" });

      expect(message.reply).toHaveBeenCalledTimes(2);
    });
  });

  describe("final replies", () => {
    it("always sends final reply", async () => {
      const message = createMockMessage();

      const sent = await throttler.maybeReply(message, "Done!", {
        kind: "final",
      });

      expect(sent).toBe(true);
      expect(message.reply).toHaveBeenCalledWith("Done!");
    });

    it("sends final even after max progress reached", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Progress 1", { kind: "progress" });
      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "Progress 2", { kind: "progress" });
      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "Progress 3", { kind: "progress" });

      const sent = await throttler.maybeReply(message, "Final", {
        kind: "final",
      });

      expect(sent).toBe(true);
    });
  });

  describe("progress replies", () => {
    it("sends first progress immediately if interval passed", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack", { kind: "ack" });
      await new Promise((r) => setTimeout(r, 110));

      const sent = await throttler.maybeReply(message, "Working...", {
        kind: "progress",
      });

      expect(sent).toBe(true);
    });

    it("throttles rapid progress updates", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack", { kind: "ack" });
      await new Promise((r) => setTimeout(r, 110));

      await throttler.maybeReply(message, "Progress 1", { kind: "progress" });
      const sent = await throttler.maybeReply(message, "Progress 2", {
        kind: "progress",
      });

      expect(sent).toBe(false);
    });

    it("allows progress after interval", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack", { kind: "ack" });
      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "Progress 1", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 110));

      const sent = await throttler.maybeReply(message, "Progress 2", {
        kind: "progress",
      });

      expect(sent).toBe(true);
    });

    it("respects max progress limit", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack", { kind: "ack" });

      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "P1", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "P2", { kind: "progress" });

      await new Promise((r) => setTimeout(r, 110));
      const sent = await throttler.maybeReply(message, "P3", {
        kind: "progress",
      });

      expect(sent).toBe(false);
    });
  });

  describe("reset", () => {
    it("resets progress count", async () => {
      const message = createMockMessage();

      await throttler.maybeReply(message, "Ack", { kind: "ack" });
      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "P1", { kind: "progress" });
      await new Promise((r) => setTimeout(r, 110));
      await throttler.maybeReply(message, "P2", { kind: "progress" });

      throttler.reset();

      await new Promise((r) => setTimeout(r, 110));
      const sent = await throttler.maybeReply(message, "P3", {
        kind: "progress",
      });

      expect(sent).toBe(true);
    });
  });
});
