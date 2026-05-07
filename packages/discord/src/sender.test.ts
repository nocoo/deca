import type { Message, TextChannel } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { sendReply, sendToChannel, showTyping } from "./sender";

// Mock message factory
function createMockMessage(overrides: Partial<Message> = {}): Message {
  const channelOverrides = (overrides.channel as object | undefined) ?? {};
  const channel = {
    send: vi.fn(() => Promise.resolve({ id: "sent-msg-id" })),
    sendTyping: vi.fn(() => Promise.resolve()),
    isTextBased: () => true,
    isSendable: () => true,
    ...channelOverrides,
  };

  const { channel: _ignored, ...restOverrides } = overrides;
  return {
    id: "msg-id",
    reply: vi.fn(() => Promise.resolve({ id: "reply-msg-id" })),
    channel,
    ...restOverrides,
  } as unknown as Message;
}

// Mock channel factory
function createMockChannel(overrides: Partial<TextChannel> = {}): TextChannel {
  return {
    id: "channel-id",
    send: vi.fn(() => Promise.resolve({ id: "sent-msg-id" })),
    sendTyping: vi.fn(() => Promise.resolve()),
    isTextBased: () => true,
    isSendable: () => true,
    ...overrides,
  } as unknown as TextChannel;
}

describe("sendReply", () => {
  describe("short messages", () => {
    it("sends single message as reply", async () => {
      const message = createMockMessage();
      await sendReply(message, "Hello!");

      expect(message.reply).toHaveBeenCalledWith("Hello!");
    });

    it("uses message.reply()", async () => {
      const replyMock = vi.fn(() => Promise.resolve({ id: "reply-id" }));
      const message = createMockMessage({ reply: replyMock as never });

      await sendReply(message, "Test message");

      expect(replyMock).toHaveBeenCalled();
    });
  });

  describe("long messages", () => {
    it("chunks long messages", async () => {
      const sendMock = vi.fn(() => Promise.resolve({ id: "sent-id" }));
      const message = createMockMessage({
        channel: { send: sendMock } as never,
      });

      const longMessage = "a".repeat(2500);
      await sendReply(message, longMessage);

      // First chunk via reply, subsequent via channel.send
      expect(message.reply).toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalled();
    });

    it("sends first chunk as reply", async () => {
      const replyMock = vi.fn(() => Promise.resolve({ id: "reply-id" }));
      const message = createMockMessage({ reply: replyMock as never });

      const longMessage = "a".repeat(2500);
      await sendReply(message, longMessage);

      // Verify first chunk was sent as reply
      const replyCall = replyMock.mock.calls[0];
      expect(replyCall[0]).toHaveLength(2000);
    });

    it("sends subsequent chunks to channel", async () => {
      const sendMock = vi.fn(() => Promise.resolve({ id: "sent-id" }));
      const message = createMockMessage({
        channel: { send: sendMock } as never,
      });

      const longMessage = "a".repeat(2500);
      await sendReply(message, longMessage);

      // Verify remaining content sent to channel
      expect(sendMock).toHaveBeenCalled();
      const sendCall = sendMock.mock.calls[0];
      expect(sendCall[0]).toHaveLength(500);
    });

    it("skips chunked sends when channel is not sendable", async () => {
      const sendMock = vi.fn(() => Promise.resolve({ id: "sent-id" }));
      const message = createMockMessage({
        channel: { send: sendMock, isSendable: () => false } as never,
      });

      const longMessage = "a".repeat(2500);
      const result = await sendReply(message, longMessage);

      // First chunk goes via reply; subsequent chunks are skipped
      expect(message.reply).toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("throws on send failure", async () => {
      const replyMock = vi.fn(() =>
        Promise.reject(new Error("Discord API error")),
      );
      const message = createMockMessage({ reply: replyMock as never });

      await expect(sendReply(message, "Test")).rejects.toThrow(
        "Discord API error",
      );
    });

    it("includes original error message", async () => {
      const replyMock = vi.fn(() => Promise.reject(new Error("Rate limited")));
      const message = createMockMessage({ reply: replyMock as never });

      try {
        await sendReply(message, "Test");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toBe("Rate limited");
      }
    });
  });
});

describe("sendToChannel", () => {
  it("sends to text channel", async () => {
    const sendMock = vi.fn(() => Promise.resolve({ id: "msg-id" }));
    const channel = createMockChannel({ send: sendMock as never });

    await sendToChannel(channel, "Hello!");

    expect(sendMock).toHaveBeenCalledWith("Hello!");
  });

  it("chunks long messages", async () => {
    const sendMock = vi.fn(() => Promise.resolve({ id: "msg-id" }));
    const channel = createMockChannel({ send: sendMock as never });

    const longMessage = "b".repeat(4500);
    await sendToChannel(channel, longMessage);

    // Should be called 3 times for 4500 chars
    expect(sendMock.mock.calls.length).toBe(3);
  });

  it("returns sent messages", async () => {
    const sendMock = vi.fn(() => Promise.resolve({ id: "msg-id" }));
    const channel = createMockChannel({ send: sendMock as never });

    const result = await sendToChannel(channel, "Hello!");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("msg-id");
  });
});

describe("showTyping", () => {
  it("calls sendTyping on channel", async () => {
    const sendTypingMock = vi.fn(() => Promise.resolve());
    const channel = createMockChannel({ sendTyping: sendTypingMock as never });

    await showTyping(channel);

    expect(sendTypingMock).toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    const sendTypingMock = vi.fn(() =>
      Promise.reject(new Error("Typing failed")),
    );
    const channel = createMockChannel({ sendTyping: sendTypingMock as never });

    // Should not throw
    await expect(showTyping(channel)).resolves.toBeUndefined();
  });
});
