import { describe, expect, test } from "bun:test";
import { createTestMessage, extractTestId, generateTestId } from "./webhook";

describe("webhook", () => {
  describe("generateTestId", () => {
    test("generates unique IDs", () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).not.toBe(id2);
    });

    test("follows e2e-<timestamp>-<random> format", () => {
      const id = generateTestId();

      expect(id).toMatch(/^e2e-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe("createTestMessage", () => {
    test("embeds test ID in message", () => {
      const testId = "e2e-abc123-def456";
      const message = createTestMessage(testId);

      expect(message).toBe("[e2e-abc123-def456] ping");
    });

    test("includes custom content", () => {
      const testId = "e2e-abc123-def456";
      const message = createTestMessage(testId, "hello world");

      expect(message).toBe("[e2e-abc123-def456] hello world");
    });
  });

  describe("extractTestId", () => {
    test("extracts test ID from message", () => {
      const content = "[e2e-abc123-def456] ping";
      const testId = extractTestId(content);

      expect(testId).toBe("e2e-abc123-def456");
    });

    test("extracts from echo response", () => {
      const content = "You said: [e2e-abc123-def456] ping";
      const testId = extractTestId(content);

      expect(testId).toBe("e2e-abc123-def456");
    });

    test("returns null for message without test ID", () => {
      const content = "Just a regular message";
      const testId = extractTestId(content);

      expect(testId).toBeNull();
    });

    test("returns null for malformed test ID", () => {
      const content = "[not-a-test-id] ping";
      const testId = extractTestId(content);

      expect(testId).toBeNull();
    });
  });
});
