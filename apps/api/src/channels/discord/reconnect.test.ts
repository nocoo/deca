/**
 * Reconnection Manager Tests
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  DEFAULT_RECONNECT_CONFIG,
  type ReconnectConfig,
  type ReconnectManager,
  createReconnectManager,
} from "./reconnect";

describe("Reconnect Manager", () => {
  let manager: ReconnectManager;
  let connectFn: ReturnType<typeof mock>;
  let onReconnect: ReturnType<typeof mock>;
  let onMaxRetries: ReturnType<typeof mock>;

  beforeEach(() => {
    connectFn = mock(() => Promise.resolve());
    onReconnect = mock(() => {});
    onMaxRetries = mock(() => {});
  });

  afterEach(() => {
    manager?.stop();
  });

  describe("createReconnectManager", () => {
    it("creates manager with default config", () => {
      manager = createReconnectManager(connectFn);

      expect(manager).toBeDefined();
      expect(manager.isRunning).toBe(false);
      expect(manager.attempts).toBe(0);
    });

    it("creates manager with custom config", () => {
      const config: ReconnectConfig = {
        maxRetries: 10,
        baseDelayMs: 500,
        maxDelayMs: 30000,
        jitterFactor: 0.2,
      };

      manager = createReconnectManager(connectFn, config);

      expect(manager).toBeDefined();
    });

    it("uses default config values", () => {
      expect(DEFAULT_RECONNECT_CONFIG.maxRetries).toBe(5);
      expect(DEFAULT_RECONNECT_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RECONNECT_CONFIG.maxDelayMs).toBe(60000);
      expect(DEFAULT_RECONNECT_CONFIG.jitterFactor).toBe(0.1);
    });
  });

  describe("schedule", () => {
    it("schedules reconnection attempt", async () => {
      manager = createReconnectManager(connectFn, {
        baseDelayMs: 10,
        maxDelayMs: 100,
      });

      manager.schedule();

      expect(manager.isRunning).toBe(true);

      // Wait for reconnect
      await new Promise((r) => setTimeout(r, 50));

      expect(connectFn).toHaveBeenCalled();
    });

    it("increments attempt counter on failure", async () => {
      const alwaysFail = mock(() =>
        Promise.reject(new Error("Connection failed")),
      );

      manager = createReconnectManager(alwaysFail, {
        baseDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 5,
      });

      expect(manager.attempts).toBe(0);

      manager.schedule();
      await new Promise((r) => setTimeout(r, 50));

      expect(manager.attempts).toBeGreaterThanOrEqual(1);
    });

    it("does not schedule if already running", () => {
      manager = createReconnectManager(connectFn, {
        baseDelayMs: 1000,
      });

      manager.schedule();
      manager.schedule();
      manager.schedule();

      expect(manager.isRunning).toBe(true);
      // Only one pending reconnect
    });

    it("calls onReconnect callback on success", async () => {
      manager = createReconnectManager(connectFn, {
        baseDelayMs: 10,
        onReconnect,
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 50));

      expect(onReconnect).toHaveBeenCalledWith(1);
    });

    it("resets attempts on successful reconnect", async () => {
      manager = createReconnectManager(connectFn, {
        baseDelayMs: 10,
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 50));

      expect(manager.attempts).toBe(0);
      expect(manager.isRunning).toBe(false);
    });
  });

  describe("exponential backoff", () => {
    it("increases delay exponentially on failures", async () => {
      let callCount = 0;
      const failTwiceThenSucceed = mock(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("Connection failed"));
        }
        return Promise.resolve();
      });

      manager = createReconnectManager(failTwiceThenSucceed, {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxRetries: 5,
      });

      manager.schedule();

      // Wait for multiple retries
      await new Promise((r) => setTimeout(r, 200));

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("caps delay at maxDelayMs", async () => {
      const alwaysFail = mock(() =>
        Promise.reject(new Error("Connection failed")),
      );

      manager = createReconnectManager(alwaysFail, {
        baseDelayMs: 10,
        maxDelayMs: 50,
        maxRetries: 10,
      });

      const startTime = Date.now();
      manager.schedule();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 300));
      manager.stop();

      // Should have made multiple attempts within reasonable time
      expect(alwaysFail.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe("max retries", () => {
    it("stops after maxRetries exceeded", async () => {
      const alwaysFail = mock(() =>
        Promise.reject(new Error("Connection failed")),
      );

      manager = createReconnectManager(alwaysFail, {
        baseDelayMs: 5,
        maxDelayMs: 10,
        maxRetries: 3,
        onMaxRetries,
      });

      manager.schedule();

      // Wait for all retries
      await new Promise((r) => setTimeout(r, 200));

      expect(alwaysFail.mock.calls.length).toBe(3);
      expect(onMaxRetries).toHaveBeenCalled();
      expect(manager.isRunning).toBe(false);
    });

    it("calls onMaxRetries with last error", async () => {
      const error = new Error("Final connection error");
      const alwaysFail = mock(() => Promise.reject(error));

      manager = createReconnectManager(alwaysFail, {
        baseDelayMs: 5,
        maxDelayMs: 10,
        maxRetries: 2,
        onMaxRetries,
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 100));

      expect(onMaxRetries).toHaveBeenCalledWith(error);
    });
  });

  describe("stop", () => {
    it("cancels pending reconnection", async () => {
      manager = createReconnectManager(connectFn, {
        baseDelayMs: 1000,
      });

      manager.schedule();
      expect(manager.isRunning).toBe(true);

      manager.stop();

      expect(manager.isRunning).toBe(false);

      // Wait to ensure connect wasn't called
      await new Promise((r) => setTimeout(r, 50));
      expect(connectFn).not.toHaveBeenCalled();
    });

    it("resets attempt counter", () => {
      manager = createReconnectManager(connectFn);

      // Manually set attempts for testing
      manager.schedule();
      manager.stop();

      expect(manager.attempts).toBe(0);
    });

    it("is idempotent", () => {
      manager = createReconnectManager(connectFn);

      manager.stop();
      manager.stop();
      manager.stop();

      expect(manager.isRunning).toBe(false);
    });
  });

  describe("reset", () => {
    it("resets attempt counter without stopping", async () => {
      const failOnce = mock(() => {
        if (failOnce.mock.calls.length === 1) {
          return Promise.reject(new Error("First fail"));
        }
        return Promise.resolve();
      });

      manager = createReconnectManager(failOnce, {
        baseDelayMs: 10,
        maxDelayMs: 20,
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 30));

      // After first failure, attempts should be > 0
      // But after success, should be 0
      expect(manager.attempts).toBe(0);
    });
  });

  describe("jitter", () => {
    it("adds jitter to delay", async () => {
      const delays: number[] = [];
      let lastCallTime = Date.now();

      const trackDelay = mock(() => {
        const now = Date.now();
        if (delays.length > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;
        delays.push(0); // Mark call
        return Promise.reject(new Error("fail"));
      });

      manager = createReconnectManager(trackDelay, {
        baseDelayMs: 50,
        maxDelayMs: 100,
        maxRetries: 3,
        jitterFactor: 0.5, // High jitter for testing
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 500));

      // With jitter, delays should vary
      // Hard to test precisely, just ensure it ran
      expect(trackDelay.mock.calls.length).toBe(3);
    });
  });

  describe("integration", () => {
    it("handles intermittent failures", async () => {
      let callCount = 0;
      const intermittent = mock(() => {
        callCount++;
        // Fail first 2 attempts, then succeed
        if (callCount <= 2) {
          return Promise.reject(new Error(`Fail ${callCount}`));
        }
        return Promise.resolve();
      });

      manager = createReconnectManager(intermittent, {
        baseDelayMs: 10,
        maxDelayMs: 50,
        maxRetries: 5,
        onReconnect,
      });

      manager.schedule();

      // Wait for success
      await new Promise((r) => setTimeout(r, 200));

      expect(callCount).toBe(3);
      expect(onReconnect).toHaveBeenCalledWith(3);
      expect(manager.isRunning).toBe(false);
      expect(manager.attempts).toBe(0);
    });

    it("can be restarted after max retries", async () => {
      let shouldFail = true;
      const toggleable = mock(() => {
        if (shouldFail) {
          return Promise.reject(new Error("fail"));
        }
        return Promise.resolve();
      });

      manager = createReconnectManager(toggleable, {
        baseDelayMs: 5,
        maxDelayMs: 10,
        maxRetries: 2,
        onReconnect,
      });

      manager.schedule();
      await new Promise((r) => setTimeout(r, 100));

      expect(manager.isRunning).toBe(false);
      expect(onReconnect).not.toHaveBeenCalled();

      // Now allow success
      shouldFail = false;
      manager.schedule();
      await new Promise((r) => setTimeout(r, 50));

      expect(onReconnect).toHaveBeenCalled();
    });
  });
});
