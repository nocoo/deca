import { describe, expect, it } from "bun:test";
import {
  enqueueInLane,
  resolveGlobalLane,
  resolveSessionLane,
  setLaneConcurrency,
} from "./command-queue.js";

describe("command-queue", () => {
  describe("resolveSessionLane", () => {
    it("should add session: prefix to plain key", () => {
      expect(resolveSessionLane("my-session")).toBe("session:my-session");
    });

    it("should not double-prefix session: keys", () => {
      expect(resolveSessionLane("session:my-session")).toBe(
        "session:my-session",
      );
    });

    it("should use 'main' for empty string", () => {
      expect(resolveSessionLane("")).toBe("session:main");
    });

    it("should trim whitespace", () => {
      expect(resolveSessionLane("  my-session  ")).toBe("session:my-session");
    });
  });

  describe("resolveGlobalLane", () => {
    it("should return 'global' for undefined", () => {
      expect(resolveGlobalLane(undefined)).toBe("global");
    });

    it("should return 'global' for empty string", () => {
      expect(resolveGlobalLane("")).toBe("global");
    });

    it("should return provided lane name", () => {
      expect(resolveGlobalLane("my-lane")).toBe("my-lane");
    });

    it("should trim whitespace and return global for whitespace-only", () => {
      expect(resolveGlobalLane("   ")).toBe("global");
    });
  });

  describe("enqueueInLane", () => {
    it("should execute task and return result", async () => {
      const result = await enqueueInLane("test-lane-1", async () => {
        return "hello";
      });
      expect(result).toBe("hello");
    });

    it("should propagate errors", async () => {
      await expect(
        enqueueInLane("test-lane-2", async () => {
          throw new Error("task error");
        }),
      ).rejects.toThrow("task error");
    });

    it("should execute tasks in sequence (default concurrency=1)", async () => {
      const order: number[] = [];
      const lane = `test-lane-seq-${Date.now()}`;

      const task1 = enqueueInLane(lane, async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
        return 1;
      });

      const task2 = enqueueInLane(lane, async () => {
        order.push(2);
        return 2;
      });

      await Promise.all([task1, task2]);

      expect(order).toEqual([1, 2]); // Task 1 completes before task 2 starts
    });

    it("should isolate different lanes", async () => {
      const order: string[] = [];
      const laneA = `lane-a-${Date.now()}`;
      const laneB = `lane-b-${Date.now()}`;

      const taskA = enqueueInLane(laneA, async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push("A");
        return "A";
      });

      const taskB = enqueueInLane(laneB, async () => {
        order.push("B");
        return "B";
      });

      await Promise.all([taskA, taskB]);

      // B should complete before A since they're in different lanes
      expect(order).toEqual(["B", "A"]);
    });
  });

  describe("setLaneConcurrency", () => {
    it("should allow parallel execution with higher concurrency", async () => {
      const order: number[] = [];
      const lane = `test-lane-concurrent-${Date.now()}`;

      setLaneConcurrency(lane, 2);

      const task1 = enqueueInLane(lane, async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
        return 1;
      });

      const task2 = enqueueInLane(lane, async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
        return 2;
      });

      await Promise.all([task1, task2]);

      // With concurrency 2, task2 (shorter) should complete first
      expect(order).toEqual([2, 1]);
    });

    it("should enforce minimum concurrency of 1", async () => {
      const lane = `test-lane-min-${Date.now()}`;
      setLaneConcurrency(lane, 0); // Should become 1

      const result = await enqueueInLane(lane, async () => "works");
      expect(result).toBe("works");
    });

    it("should floor non-integer concurrency values", async () => {
      const lane = `test-lane-floor-${Date.now()}`;
      setLaneConcurrency(lane, 2.9); // Should become 2

      const order: number[] = [];

      const tasks = [
        enqueueInLane(lane, async () => {
          await new Promise((r) => setTimeout(r, 20));
          order.push(1);
        }),
        enqueueInLane(lane, async () => {
          await new Promise((r) => setTimeout(r, 20));
          order.push(2);
        }),
        enqueueInLane(lane, async () => {
          order.push(3);
        }),
      ];

      await Promise.all(tasks);

      // Task 3 should wait for one of 1 or 2 to complete (concurrency = 2)
      // So task 3 cannot be first
      expect(order[0]).not.toBe(3);
    });
  });
});
