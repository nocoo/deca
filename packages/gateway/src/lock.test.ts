import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GatewayLockError,
  type LockPayload,
  acquireGatewayLock,
  checkGatewayRunning,
  formatLockError,
} from "./lock";

describe("Gateway Lock", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "deca-lock-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("acquireGatewayLock", () => {
    it("should return null when allowMultiple is true", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
        allowMultiple: true,
      });
      expect(handle).toBeNull();
    });

    it("should create lock file and return handle", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
        httpPort: 7014,
        forceAcquire: true,
      });

      expect(handle).not.toBeNull();
      expect(handle?.lockPath).toBe(path.join(testDir, "gateway.lock"));

      if (!handle) throw new Error("Handle should not be null");
      const lockContent = await fs.readFile(handle.lockPath, "utf8");
      const payload = JSON.parse(lockContent) as LockPayload;

      expect(payload.pid).toBe(process.pid);
      expect(payload.httpPort).toBe(7014);
      expect(payload.createdAt).toBeDefined();

      await handle?.release();
    });

    it("should release lock file when release() is called", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
        forceAcquire: true,
      });

      expect(handle).not.toBeNull();
      await handle?.release();

      if (!handle) throw new Error("Handle should not be null");
      const exists = await fs
        .access(handle.lockPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("should throw GatewayLockError when lock already exists with live process", async () => {
      const firstHandle = await acquireGatewayLock({
        lockDir: testDir,
        httpPort: 7014,
        forceAcquire: true,
      });
      expect(firstHandle).not.toBeNull();

      await expect(
        acquireGatewayLock({
          lockDir: testDir,
          httpPort: 7015,
          forceAcquire: true,
        }),
      ).rejects.toThrow(GatewayLockError);

      await firstHandle?.release();
    });

    it("should remove stale lock file (dead process)", async () => {
      const staleLockPath = path.join(testDir, "gateway.lock");
      const stalePayload: LockPayload = {
        pid: 99999999,
        createdAt: new Date().toISOString(),
        httpPort: 7014,
      };
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(staleLockPath, JSON.stringify(stalePayload));

      const handle = await acquireGatewayLock({
        lockDir: testDir,
        httpPort: 7015,
        forceAcquire: true,
      });

      expect(handle).not.toBeNull();
      if (!handle) throw new Error("Handle should not be null");
      const lockContent = await fs.readFile(handle.lockPath, "utf8");
      const payload = JSON.parse(lockContent) as LockPayload;

      expect(payload.pid).toBe(process.pid);
      expect(payload.httpPort).toBe(7015);

      await handle?.release();
    });

    it("should use custom lock file name", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
        lockFile: "custom.lock",
        forceAcquire: true,
      });

      expect(handle?.lockPath).toBe(path.join(testDir, "custom.lock"));
      await handle?.release();
    });

    it("should return null in test environment without forceAcquire", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
      });
      expect(handle).toBeNull();
    });
  });

  describe("checkGatewayRunning", () => {
    it("should return null when no lock exists", async () => {
      const result = await checkGatewayRunning({ lockDir: testDir });
      expect(result).toBeNull();
    });

    it("should return payload when lock exists with live process", async () => {
      const handle = await acquireGatewayLock({
        lockDir: testDir,
        httpPort: 7014,
        forceAcquire: true,
      });
      expect(handle).not.toBeNull();

      const result = await checkGatewayRunning({ lockDir: testDir });
      expect(result).not.toBeNull();
      expect(result?.pid).toBe(process.pid);
      expect(result?.httpPort).toBe(7014);

      await handle?.release();
    });

    it("should return null when lock exists with dead process", async () => {
      const staleLockPath = path.join(testDir, "gateway.lock");
      const stalePayload: LockPayload = {
        pid: 99999999,
        createdAt: new Date().toISOString(),
        httpPort: 7014,
      };
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(staleLockPath, JSON.stringify(stalePayload));

      const result = await checkGatewayRunning({ lockDir: testDir });
      expect(result).toBeNull();
    });
  });

  describe("formatLockError", () => {
    it("should format error message with all details", () => {
      const payload: LockPayload = {
        pid: 12345,
        createdAt: "2026-02-07T04:00:00.000Z",
        httpPort: 7014,
      };

      const message = formatLockError(payload);

      expect(message).toContain("Gateway is already running!");
      expect(message).toContain("PID: 12345");
      expect(message).toContain("Started: 2026-02-07T04:00:00.000Z");
      expect(message).toContain("HTTP Port: 7014");
      expect(message).toContain("kill 12345");
      expect(message).toContain("DECA_ALLOW_MULTI_GATEWAY=1");
    });

    it("should format error message without httpPort", () => {
      const payload: LockPayload = {
        pid: 12345,
        createdAt: "2026-02-07T04:00:00.000Z",
      };

      const message = formatLockError(payload);

      expect(message).toContain("PID: 12345");
      expect(message).not.toContain("HTTP Port:");
    });
  });

  describe("GatewayLockError", () => {
    it("should include existing process info", () => {
      const payload: LockPayload = {
        pid: 12345,
        createdAt: "2026-02-07T04:00:00.000Z",
        httpPort: 7014,
      };

      const error = new GatewayLockError("test error", payload);

      expect(error.name).toBe("GatewayLockError");
      expect(error.message).toBe("test error");
      expect(error.existingProcess).toEqual(payload);
    });
  });
});
