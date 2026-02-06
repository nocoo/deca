import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageResponse } from "../types";
import { createDispatcherHandler } from "./handler-adapter";
import type { DispatchRequest, Dispatcher, RequestSource } from "./types";

describe("createDispatcherHandler", () => {
  let mockDispatcher: Dispatcher;
  let dispatchedRequests: DispatchRequest[];

  beforeEach(() => {
    dispatchedRequests = [];
    mockDispatcher = {
      dispatch: vi.fn().mockImplementation(async (req: DispatchRequest) => {
        dispatchedRequests.push(req);
        return { text: "response", success: true } as MessageResponse;
      }),
      getStatus: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      clear: vi.fn(),
      onIdle: vi.fn(),
      shutdown: vi.fn(),
    };
  });

  describe("request forwarding", () => {
    it("should forward request to dispatcher", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "discord");

      const response = await handler.handle({
        sessionKey: "test-session",
        content: "hello",
        sender: { id: "user1", username: "testuser" },
      });

      expect(mockDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(response).toEqual({ text: "response", success: true });
    });

    it("should include original request properties", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "http");
      const callbacks = { onTextDelta: vi.fn() };

      await handler.handle({
        sessionKey: "my-session",
        content: "test content",
        sender: { id: "user123", username: "alice" },
        callbacks,
      });

      const dispatched = dispatchedRequests[0];
      expect(dispatched.sessionKey).toBe("my-session");
      expect(dispatched.content).toBe("test content");
      expect(dispatched.sender).toEqual({ id: "user123", username: "alice" });
      expect(dispatched.callbacks).toBe(callbacks);
    });
  });

  describe("source assignment", () => {
    it.each<RequestSource>([
      "discord",
      "http",
      "terminal",
      "cron",
      "heartbeat",
    ])("should set source to %s", async (source) => {
      const handler = createDispatcherHandler(mockDispatcher, source);

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].source).toBe(source);
    });
  });

  describe("priority assignment", () => {
    it("should assign priority 10 for discord", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "discord");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].priority).toBe(10);
    });

    it("should assign priority 10 for http", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "http");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].priority).toBe(10);
    });

    it("should assign priority 10 for terminal", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "terminal");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].priority).toBe(10);
    });

    it("should assign priority 5 for cron", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "cron");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].priority).toBe(5);
    });

    it("should assign priority 1 for heartbeat", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "heartbeat");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].priority).toBe(1);
    });
  });

  describe("request ID generation", () => {
    it("should generate a request ID", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "discord");

      await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].requestId).toBeDefined();
      expect(dispatchedRequests[0].requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it("should generate unique request IDs", async () => {
      const handler = createDispatcherHandler(mockDispatcher, "discord");

      await handler.handle({
        sessionKey: "test1",
        content: "test1",
        sender: { id: "user" },
      });

      await handler.handle({
        sessionKey: "test2",
        content: "test2",
        sender: { id: "user" },
      });

      expect(dispatchedRequests[0].requestId).not.toBe(
        dispatchedRequests[1].requestId,
      );
    });
  });

  describe("error handling", () => {
    it("should propagate dispatcher errors", async () => {
      mockDispatcher.dispatch = vi
        .fn()
        .mockRejectedValue(new Error("dispatch failed"));

      const handler = createDispatcherHandler(mockDispatcher, "discord");

      await expect(
        handler.handle({
          sessionKey: "test",
          content: "test",
          sender: { id: "user" },
        }),
      ).rejects.toThrow("dispatch failed");
    });
  });

  describe("response forwarding", () => {
    it("should return dispatcher response unchanged", async () => {
      const expectedResponse: MessageResponse = {
        text: "custom response text",
        success: true,
      };
      mockDispatcher.dispatch = vi.fn().mockResolvedValue(expectedResponse);

      const handler = createDispatcherHandler(mockDispatcher, "discord");

      const response = await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(response).toEqual(expectedResponse);
    });

    it("should return error response unchanged", async () => {
      const errorResponse: MessageResponse = {
        text: "Error occurred",
        success: false,
        error: "Something went wrong",
      };
      mockDispatcher.dispatch = vi.fn().mockResolvedValue(errorResponse);

      const handler = createDispatcherHandler(mockDispatcher, "http");

      const response = await handler.handle({
        sessionKey: "test",
        content: "test",
        sender: { id: "user" },
      });

      expect(response).toEqual(errorResponse);
    });
  });
});
