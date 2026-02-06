import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDispatcher } from "./dispatcher";
import type { DispatchHandler, DispatchRequest } from "./types";

function createMockRequest(
  overrides: Partial<DispatchRequest> = {},
): DispatchRequest {
  return {
    sessionKey: "test-session",
    content: "test content",
    source: "http",
    sender: { id: "user1", username: "testuser" },
    ...overrides,
  };
}

describe("createDispatcher", () => {
  let mockHandler: DispatchHandler;

  beforeEach(() => {
    mockHandler = {
      handle: vi.fn().mockResolvedValue({ text: "response", success: true }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("basic dispatch", () => {
    it("should dispatch request to handler", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });
      const request = createMockRequest();

      const response = await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(request);
      expect(response.success).toBe(true);
      expect(response.text).toBe("response");
    });

    it("should propagate handler errors", async () => {
      const errorHandler: DispatchHandler = {
        handle: vi.fn().mockRejectedValue(new Error("handler error")),
      };
      const dispatcher = createDispatcher({ handler: errorHandler });

      await expect(dispatcher.dispatch(createMockRequest())).rejects.toThrow(
        "handler error",
      );
    });

    it("should handle multiple sequential requests", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      await dispatcher.dispatch(createMockRequest({ content: "first" }));
      await dispatcher.dispatch(createMockRequest({ content: "second" }));
      await dispatcher.dispatch(createMockRequest({ content: "third" }));

      expect(mockHandler.handle).toHaveBeenCalledTimes(3);
    });
  });

  describe("concurrency control", () => {
    it("should limit concurrent executions", async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 50));
          concurrent--;
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 2,
      });

      const requests = Array.from({ length: 5 }, (_, i) =>
        createMockRequest({ content: `request-${i}` }),
      );

      await Promise.all(requests.map((r) => dispatcher.dispatch(r)));

      expect(maxConcurrent).toBe(2);
    });

    it("should default to concurrency 1", async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 20));
          concurrent--;
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({ handler: slowHandler });

      const requests = Array.from({ length: 3 }, (_, i) =>
        createMockRequest({ content: `request-${i}` }),
      );

      await Promise.all(requests.map((r) => dispatcher.dispatch(r)));

      expect(maxConcurrent).toBe(1);
    });
  });

  describe("priority ordering", () => {
    it("should process high priority requests first", async () => {
      const order: string[] = [];

      const trackingHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async (req: DispatchRequest) => {
          order.push(req.content);
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: trackingHandler,
        concurrency: 1,
      });

      dispatcher.pause();

      const p1 = dispatcher.dispatch(
        createMockRequest({
          content: "low",
          source: "heartbeat",
          priority: 1,
        }),
      );

      const p2 = dispatcher.dispatch(
        createMockRequest({
          content: "high",
          source: "discord",
          priority: 10,
        }),
      );

      const p3 = dispatcher.dispatch(
        createMockRequest({
          content: "medium",
          source: "cron",
          priority: 5,
        }),
      );

      dispatcher.resume();
      await Promise.all([p1, p2, p3]);

      expect(order).toEqual(["high", "medium", "low"]);
    });

    it("should use priority 0 as default", async () => {
      const executionOrder: string[] = [];

      const trackingHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async (req: DispatchRequest) => {
          executionOrder.push(req.requestId);
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: trackingHandler,
        concurrency: 1,
      });

      dispatcher.pause();

      // priority 5 request
      dispatcher.dispatch(createMockRequest({ requestId: "p5", priority: 5 }));
      // no priority (should default to 0, lowest)
      dispatcher.dispatch(createMockRequest({ requestId: "p0-default" }));
      // priority 10 request
      dispatcher.dispatch(
        createMockRequest({ requestId: "p10", priority: 10 }),
      );

      dispatcher.resume();
      await dispatcher.onIdle();

      // Should execute in priority order: 10 -> 5 -> 0(default)
      expect(executionOrder[0]).toBe("p10");
      expect(executionOrder[1]).toBe("p5");
      expect(executionOrder[2]).toBe("p0-default");
    });
  });

  describe("events", () => {
    it("should emit onEnqueue when request added", async () => {
      const onEnqueue = vi.fn();

      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onEnqueue },
      });

      const request = createMockRequest();
      await dispatcher.dispatch(request);

      expect(onEnqueue).toHaveBeenCalledTimes(1);
      expect(onEnqueue).toHaveBeenCalledWith(request);
    });

    it("should emit onActive when request starts", async () => {
      const onActive = vi.fn();

      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onActive },
      });

      const request = createMockRequest();
      await dispatcher.dispatch(request);

      expect(onActive).toHaveBeenCalledTimes(1);
      expect(onActive).toHaveBeenCalledWith(request);
    });

    it("should emit onComplete when request succeeds", async () => {
      const onComplete = vi.fn();

      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onComplete },
      });

      const request = createMockRequest();
      await dispatcher.dispatch(request);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(request, {
        text: "response",
        success: true,
      });
    });

    it("should emit onError when request fails", async () => {
      const onError = vi.fn();
      const failHandler: DispatchHandler = {
        handle: vi.fn().mockRejectedValue(new Error("fail")),
      };

      const dispatcher = createDispatcher({
        handler: failHandler,
        events: { onError },
      });

      const request = createMockRequest();
      await expect(dispatcher.dispatch(request)).rejects.toThrow("fail");

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(request, expect.any(Error));
    });

    it("should emit onIdle when queue becomes idle", async () => {
      const onIdle = vi.fn();

      const dispatcher = createDispatcher({
        handler: mockHandler,
        events: { onIdle },
      });

      await dispatcher.dispatch(createMockRequest());
      await dispatcher.onIdle();

      expect(onIdle).toHaveBeenCalled();
    });

    it("should not fail if events are not provided", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      await expect(
        dispatcher.dispatch(createMockRequest()),
      ).resolves.toBeDefined();
    });
  });

  describe("status", () => {
    it("should report correct queue status when idle", () => {
      const dispatcher = createDispatcher({
        handler: mockHandler,
        concurrency: 2,
      });

      const status = dispatcher.getStatus();

      expect(status.queued).toBe(0);
      expect(status.running).toBe(0);
      expect(status.concurrency).toBe(2);
      expect(status.isPaused).toBe(false);
    });

    it("should report running count during execution", async () => {
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 1,
      });

      const promise = dispatcher.dispatch(createMockRequest());
      await new Promise((r) => setTimeout(r, 10));

      const status = dispatcher.getStatus();
      expect(status.running).toBe(1);
      expect(status.queued).toBe(0);

      await promise;
    });

    it("should report queued count when requests are waiting", async () => {
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 1,
      });

      const p1 = dispatcher.dispatch(createMockRequest({ content: "first" }));
      const p2 = dispatcher.dispatch(createMockRequest({ content: "second" }));

      await new Promise((r) => setTimeout(r, 10));

      const status = dispatcher.getStatus();
      expect(status.running).toBe(1);
      expect(status.queued).toBe(1);

      await Promise.all([p1, p2]);
    });
  });

  describe("pause/resume", () => {
    it("should pause queue processing", () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      dispatcher.pause();

      expect(dispatcher.getStatus().isPaused).toBe(true);
    });

    it("should resume queue processing", () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      dispatcher.pause();
      dispatcher.resume();

      expect(dispatcher.getStatus().isPaused).toBe(false);
    });

    it("should not process new requests while paused", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      dispatcher.pause();

      const promise = dispatcher.dispatch(createMockRequest());

      await new Promise((r) => setTimeout(r, 50));
      expect(mockHandler.handle).not.toHaveBeenCalled();

      dispatcher.resume();
      await promise;

      expect(mockHandler.handle).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("should clear queued requests", async () => {
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 1,
      });

      dispatcher.dispatch(createMockRequest({ content: "first" }));
      dispatcher.dispatch(createMockRequest({ content: "second" }));
      dispatcher.dispatch(createMockRequest({ content: "third" }));

      await new Promise((r) => setTimeout(r, 10));

      dispatcher.clear();

      expect(dispatcher.getStatus().queued).toBe(0);
      expect(dispatcher.getStatus().running).toBe(1);

      await dispatcher.onIdle();
    });
  });

  describe("onIdle", () => {
    it("should resolve when queue is idle", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      await dispatcher.dispatch(createMockRequest());

      await expect(dispatcher.onIdle()).resolves.toBeUndefined();
    });

    it("should wait for all requests to complete", async () => {
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 2,
      });

      dispatcher.dispatch(createMockRequest());
      dispatcher.dispatch(createMockRequest());
      dispatcher.dispatch(createMockRequest());

      await dispatcher.onIdle();

      expect(slowHandler.handle).toHaveBeenCalledTimes(3);
    });
  });

  describe("shutdown", () => {
    it("should pause and clear queue", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      dispatcher.pause();
      dispatcher.dispatch(createMockRequest());
      dispatcher.dispatch(createMockRequest());

      await dispatcher.shutdown();

      const status = dispatcher.getStatus();
      expect(status.queued).toBe(0);
      expect(status.isPaused).toBe(true);
    });

    it("should wait for running requests to complete", async () => {
      let completed = false;
      const slowHandler: DispatchHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          completed = true;
          return { text: "ok", success: true };
        }),
      };

      const dispatcher = createDispatcher({
        handler: slowHandler,
        concurrency: 1,
      });

      dispatcher.dispatch(createMockRequest());
      await new Promise((r) => setTimeout(r, 10));

      await dispatcher.shutdown();

      expect(completed).toBe(true);
    });
  });

  describe("request sources", () => {
    it("should handle discord source", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ source: "discord" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ source: "discord" }),
      );
    });

    it("should handle http source", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ source: "http" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ source: "http" }),
      );
    });

    it("should handle terminal source", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ source: "terminal" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ source: "terminal" }),
      );
    });

    it("should handle cron source", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ source: "cron" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ source: "cron" }),
      );
    });

    it("should handle heartbeat source", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ source: "heartbeat" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ source: "heartbeat" }),
      );
    });
  });

  describe("request ID tracking", () => {
    it("should pass requestId to queue", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest({ requestId: "req-123" });
      await dispatcher.dispatch(request);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req-123" }),
      );
    });

    it("should handle requests without requestId", async () => {
      const dispatcher = createDispatcher({ handler: mockHandler });

      const request = createMockRequest();
      request.requestId = undefined;

      await expect(dispatcher.dispatch(request)).resolves.toBeDefined();
    });
  });
});
