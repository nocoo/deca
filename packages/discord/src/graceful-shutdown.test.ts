/**
 * Graceful Shutdown Manager Tests
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type GracefulShutdown,
  createGracefulShutdown,
} from "./graceful-shutdown";

describe("Graceful Shutdown", () => {
  let shutdown: GracefulShutdown;

  afterEach(() => {
    shutdown?.reset();
  });

  describe("createGracefulShutdown", () => {
    it("creates shutdown manager with default config", () => {
      shutdown = createGracefulShutdown();

      expect(shutdown).toBeDefined();
      expect(shutdown.isShuttingDown).toBe(false);
      expect(shutdown.pendingCount).toBe(0);
    });

    it("creates shutdown manager with custom timeout", () => {
      shutdown = createGracefulShutdown({ timeoutMs: 5000 });

      expect(shutdown).toBeDefined();
    });
  });

  describe("trackTask", () => {
    it("increments pending count", () => {
      shutdown = createGracefulShutdown();

      const done = shutdown.trackTask();

      expect(shutdown.pendingCount).toBe(1);

      done();
      expect(shutdown.pendingCount).toBe(0);
    });

    it("tracks multiple tasks", () => {
      shutdown = createGracefulShutdown();

      const done1 = shutdown.trackTask();
      const done2 = shutdown.trackTask();
      const done3 = shutdown.trackTask();

      expect(shutdown.pendingCount).toBe(3);

      done1();
      expect(shutdown.pendingCount).toBe(2);

      done2();
      done3();
      expect(shutdown.pendingCount).toBe(0);
    });

    it("returns noop when shutting down", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 10 });

      const done1 = shutdown.trackTask();
      shutdown.initiateShutdown();

      // New tasks should be rejected during shutdown
      const done2 = shutdown.trackTask();
      expect(shutdown.pendingCount).toBe(1); // Only first task

      done1();
      done2(); // Should be safe to call
    });
  });

  describe("initiateShutdown", () => {
    it("sets isShuttingDown to true", () => {
      shutdown = createGracefulShutdown();

      expect(shutdown.isShuttingDown).toBe(false);

      shutdown.initiateShutdown();

      expect(shutdown.isShuttingDown).toBe(true);
    });

    it("resolves immediately when no pending tasks", async () => {
      shutdown = createGracefulShutdown();

      const start = Date.now();
      await shutdown.initiateShutdown();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it("waits for pending tasks to complete", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 1000 });

      const done = shutdown.trackTask();

      let resolved = false;
      const shutdownPromise = shutdown.initiateShutdown().then(() => {
        resolved = true;
      });

      // Should not be resolved yet
      await new Promise((r) => setTimeout(r, 10));
      expect(resolved).toBe(false);

      // Complete the task
      done();

      await shutdownPromise;
      expect(resolved).toBe(true);
    });

    it("times out if tasks take too long", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 50 });

      shutdown.trackTask(); // Never completed

      const start = Date.now();
      await shutdown.initiateShutdown();
      const elapsed = Date.now() - start;

      // Should timeout around 50ms
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(150);
    });

    it("calls onTimeout callback on timeout", async () => {
      const onTimeout = mock(() => {});

      shutdown = createGracefulShutdown({
        timeoutMs: 20,
        onTimeout,
      });

      shutdown.trackTask(); // Never completed

      await shutdown.initiateShutdown();

      expect(onTimeout).toHaveBeenCalledWith(1);
    });

    it("is idempotent", async () => {
      shutdown = createGracefulShutdown();

      const promise1 = shutdown.initiateShutdown();
      const promise2 = shutdown.initiateShutdown();
      const promise3 = shutdown.initiateShutdown();

      await Promise.all([promise1, promise2, promise3]);

      expect(shutdown.isShuttingDown).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets shutdown state", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 10 });

      shutdown.trackTask();
      await shutdown.initiateShutdown();

      expect(shutdown.isShuttingDown).toBe(true);

      shutdown.reset();

      expect(shutdown.isShuttingDown).toBe(false);
      expect(shutdown.pendingCount).toBe(0);
    });

    it("allows new tasks after reset", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 10 });

      shutdown.trackTask();
      await shutdown.initiateShutdown();
      shutdown.reset();

      const done = shutdown.trackTask();
      expect(shutdown.pendingCount).toBe(1);

      done();
      expect(shutdown.pendingCount).toBe(0);
    });
  });

  describe("wrapTask", () => {
    it("wraps async function with tracking", async () => {
      shutdown = createGracefulShutdown();

      const result = await shutdown.wrapTask(async () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(shutdown.pendingCount).toBe(0);
    });

    it("tracks task during execution", async () => {
      shutdown = createGracefulShutdown();

      let duringExecution = 0;

      await shutdown.wrapTask(async () => {
        duringExecution = shutdown.pendingCount;
        return;
      });

      expect(duringExecution).toBe(1);
      expect(shutdown.pendingCount).toBe(0);
    });

    it("completes tracking on error", async () => {
      shutdown = createGracefulShutdown();

      try {
        await shutdown.wrapTask(async () => {
          throw new Error("Task failed");
        });
      } catch {
        // Expected
      }

      expect(shutdown.pendingCount).toBe(0);
    });

    it("returns undefined when shutting down", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 10 });

      shutdown.initiateShutdown();

      const result = await shutdown.wrapTask(async () => {
        return 42;
      });

      expect(result).toBeUndefined();
    });
  });

  describe("integration", () => {
    it("handles concurrent tasks during shutdown", async () => {
      shutdown = createGracefulShutdown({ timeoutMs: 500 });

      const results: number[] = [];

      // Start some tasks
      const task1 = shutdown.wrapTask(async () => {
        await new Promise((r) => setTimeout(r, 30));
        results.push(1);
      });

      const task2 = shutdown.wrapTask(async () => {
        await new Promise((r) => setTimeout(r, 20));
        results.push(2);
      });

      // Initiate shutdown while tasks are running
      const shutdownPromise = shutdown.initiateShutdown();

      // Wait for everything
      await Promise.all([task1, task2, shutdownPromise]);

      // All tasks should complete
      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });
});
