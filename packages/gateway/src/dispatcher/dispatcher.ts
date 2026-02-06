import PQueue from "p-queue";
import type { MessageResponse } from "../types";
import type {
  DispatchRequest,
  Dispatcher,
  DispatcherConfig,
  DispatcherStatus,
} from "./types";

export function createDispatcher(config: DispatcherConfig): Dispatcher {
  const { concurrency = 2, timeout, handler, events = {} } = config;

  const queue = new PQueue({
    concurrency,
    timeout,
  });

  queue.on("idle", () => {
    events.onIdle?.();
  });

  async function dispatch(request: DispatchRequest): Promise<MessageResponse> {
    events.onEnqueue?.(request);

    const response = await queue.add(
      async () => {
        events.onActive?.(request);

        try {
          const result = await handler.handle(request);
          events.onComplete?.(request, result);
          return result;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          events.onError?.(request, err);
          throw err;
        }
      },
      {
        priority: request.priority ?? 0,
        id: request.requestId,
      },
    );

    if (!response) {
      throw new Error("Unexpected empty response from handler");
    }

    return response;
  }

  function getStatus(): DispatcherStatus {
    return {
      queued: queue.size,
      running: queue.pending,
      concurrency,
      isPaused: queue.isPaused,
    };
  }

  function pause(): void {
    queue.pause();
  }

  function resume(): void {
    queue.start();
  }

  function clear(): void {
    queue.clear();
  }

  async function onIdle(): Promise<void> {
    await queue.onIdle();
  }

  async function shutdown(): Promise<void> {
    queue.pause();
    queue.clear();
    await queue.onIdle();
  }

  return {
    dispatch,
    getStatus,
    pause,
    resume,
    clear,
    onIdle,
    shutdown,
  };
}
