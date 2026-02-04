import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message } from "discord.js";
import {
  DEFAULT_DEBOUNCE_WINDOW_MS,
  type DebouncedHandler,
  createDebounceManager,
} from "./debounce";

// Mock message factory
function createMockMessage(
  content: string,
  userId = "user123",
  channelId = "channel456",
): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    content,
    author: { id: userId },
    channel: { id: channelId },
  } as unknown as Message;
}

describe("debounce", () => {
  describe("DEFAULT_DEBOUNCE_WINDOW_MS", () => {
    test("is 3000ms", () => {
      expect(DEFAULT_DEBOUNCE_WINDOW_MS).toBe(3000);
    });
  });

  describe("createDebounceManager", () => {
    let handler: DebouncedHandler & ReturnType<typeof mock>;

    beforeEach(() => {
      handler = mock(async () => {});
    });

    test("calls handler after window expires", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const message = createMockMessage("hello");

      manager.add(message);

      expect(handler).not.toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(message, "hello", [message]);
    });

    test("merges consecutive messages", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const msg1 = createMockMessage("hello");
      const msg2 = createMockMessage("world");

      manager.add(msg1);
      manager.add(msg2);

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg1, "hello\nworld", [msg1, msg2]);
    });

    test("resets timer on new message", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const msg1 = createMockMessage("hello");

      manager.add(msg1);

      await new Promise((r) => setTimeout(r, 30));
      expect(handler).not.toHaveBeenCalled();

      const msg2 = createMockMessage("world");
      manager.add(msg2);

      await new Promise((r) => setTimeout(r, 30));
      expect(handler).not.toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 50));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("handles different users independently", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const msg1 = createMockMessage("hello", "user1");
      const msg2 = createMockMessage("world", "user2");

      manager.add(msg1);
      manager.add(msg2);

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    test("handles different channels independently", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const msg1 = createMockMessage("hello", "user1", "channel1");
      const msg2 = createMockMessage("world", "user1", "channel2");

      manager.add(msg1);
      manager.add(msg2);

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    test("clear cancels pending debounces", async () => {
      const manager = createDebounceManager(handler, { windowMs: 50 });
      const message = createMockMessage("hello");

      manager.add(message);
      manager.clear();

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).not.toHaveBeenCalled();
    });

    test("pendingCount reflects queued groups", () => {
      const manager = createDebounceManager(handler, { windowMs: 1000 });

      expect(manager.pendingCount).toBe(0);

      manager.add(createMockMessage("hello", "user1"));
      expect(manager.pendingCount).toBe(1);

      manager.add(createMockMessage("world", "user1"));
      expect(manager.pendingCount).toBe(1); // Same group

      manager.add(createMockMessage("hello", "user2"));
      expect(manager.pendingCount).toBe(2);

      manager.clear();
      expect(manager.pendingCount).toBe(0);
    });

    test("returns true when message is queued", () => {
      const manager = createDebounceManager(handler, { windowMs: 1000 });
      const message = createMockMessage("hello");

      const result = manager.add(message);

      expect(result).toBe(true);
      manager.clear();
    });

    test("handles handler errors gracefully", async () => {
      const errorHandler = mock(async () => {
        throw new Error("Handler error");
      });
      const manager = createDebounceManager(errorHandler, { windowMs: 50 });
      const message = createMockMessage("hello");

      manager.add(message);

      // Should not throw
      await new Promise((r) => setTimeout(r, 100));

      expect(errorHandler).toHaveBeenCalled();
    });
  });
});
