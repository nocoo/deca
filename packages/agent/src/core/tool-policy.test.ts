import { describe, expect, it } from "bun:test";
import type { Tool } from "../tools/types.js";
import {
  type ToolPolicy,
  filterToolsByPolicy,
  isToolAllowed,
  mergeToolPolicies,
} from "./tool-policy.js";

describe("tool-policy", () => {
  describe("isToolAllowed", () => {
    it("should allow all tools when no policy", () => {
      expect(isToolAllowed("read")).toBe(true);
      expect(isToolAllowed("exec")).toBe(true);
    });

    it("should allow all tools when policy is empty", () => {
      expect(isToolAllowed("read", {})).toBe(true);
    });

    it("should deny tool matching deny pattern", () => {
      const policy: ToolPolicy = { deny: ["exec"] };
      expect(isToolAllowed("exec", policy)).toBe(false);
      expect(isToolAllowed("read", policy)).toBe(true);
    });

    it("should support wildcard in deny", () => {
      const policy: ToolPolicy = { deny: ["memory_*"] };
      expect(isToolAllowed("memory_search", policy)).toBe(false);
      expect(isToolAllowed("memory_get", policy)).toBe(false);
      expect(isToolAllowed("read", policy)).toBe(true);
    });

    it("should deny all with * pattern", () => {
      const policy: ToolPolicy = { deny: ["*"] };
      expect(isToolAllowed("read", policy)).toBe(false);
      expect(isToolAllowed("exec", policy)).toBe(false);
    });

    it("should allow only matching tools when allow is specified", () => {
      const policy: ToolPolicy = { allow: ["read", "list"] };
      expect(isToolAllowed("read", policy)).toBe(true);
      expect(isToolAllowed("list", policy)).toBe(true);
      expect(isToolAllowed("exec", policy)).toBe(false);
    });

    it("should support wildcard in allow", () => {
      const policy: ToolPolicy = { allow: ["file_*"] };
      expect(isToolAllowed("file_read", policy)).toBe(true);
      expect(isToolAllowed("file_write", policy)).toBe(true);
      expect(isToolAllowed("exec", policy)).toBe(false);
    });

    it("should deny takes precedence over allow", () => {
      const policy: ToolPolicy = { allow: ["*"], deny: ["exec"] };
      expect(isToolAllowed("read", policy)).toBe(true);
      expect(isToolAllowed("exec", policy)).toBe(false);
    });

    it("should be case insensitive", () => {
      const policy: ToolPolicy = { deny: ["EXEC"] };
      expect(isToolAllowed("exec", policy)).toBe(false);
      expect(isToolAllowed("EXEC", policy)).toBe(false);
    });

    it("should handle empty string pattern", () => {
      const policy: ToolPolicy = { deny: [""] };
      expect(isToolAllowed("read", policy)).toBe(true);
    });

    it("should handle whitespace in patterns", () => {
      const policy: ToolPolicy = { deny: ["  exec  "] };
      expect(isToolAllowed("exec", policy)).toBe(false);
    });
  });

  describe("filterToolsByPolicy", () => {
    const mockTools: Tool[] = [
      {
        name: "read",
        description: "Read file",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "write",
        description: "Write file",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "exec",
        description: "Execute command",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "memory_search",
        description: "Search memory",
        inputSchema: { type: "object", properties: {} },
      },
    ];

    it("should return all tools when no policy", () => {
      const result = filterToolsByPolicy(mockTools);
      expect(result).toHaveLength(4);
    });

    it("should filter out denied tools", () => {
      const policy: ToolPolicy = { deny: ["exec"] };
      const result = filterToolsByPolicy(mockTools, policy);
      expect(result).toHaveLength(3);
      expect(result.find((t) => t.name === "exec")).toBeUndefined();
    });

    it("should filter by allow list", () => {
      const policy: ToolPolicy = { allow: ["read", "write"] };
      const result = filterToolsByPolicy(mockTools, policy);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toEqual(["read", "write"]);
    });

    it("should filter by wildcard pattern", () => {
      const policy: ToolPolicy = { deny: ["memory_*"] };
      const result = filterToolsByPolicy(mockTools, policy);
      expect(result).toHaveLength(3);
      expect(result.find((t) => t.name === "memory_search")).toBeUndefined();
    });
  });

  describe("mergeToolPolicies", () => {
    it("should return undefined when both are undefined", () => {
      expect(mergeToolPolicies(undefined, undefined)).toBeUndefined();
    });

    it("should return base policy when extra is undefined", () => {
      const base: ToolPolicy = { allow: ["read"], deny: ["exec"] };
      const result = mergeToolPolicies(base, undefined);
      expect(result?.allow).toEqual(["read"]);
      expect(result?.deny).toEqual(["exec"]);
    });

    it("should return extra policy when base is undefined", () => {
      const extra: ToolPolicy = { allow: ["write"], deny: ["list"] };
      const result = mergeToolPolicies(undefined, extra);
      expect(result?.allow).toEqual(["write"]);
      expect(result?.deny).toEqual(["list"]);
    });

    it("should merge allow lists", () => {
      const base: ToolPolicy = { allow: ["read"] };
      const extra: ToolPolicy = { allow: ["write"] };
      const result = mergeToolPolicies(base, extra);
      expect(result?.allow).toContain("read");
      expect(result?.allow).toContain("write");
    });

    it("should merge deny lists", () => {
      const base: ToolPolicy = { deny: ["exec"] };
      const extra: ToolPolicy = { deny: ["list"] };
      const result = mergeToolPolicies(base, extra);
      expect(result?.deny).toContain("exec");
      expect(result?.deny).toContain("list");
    });

    it("should deduplicate entries", () => {
      const base: ToolPolicy = { allow: ["read", "write"] };
      const extra: ToolPolicy = { allow: ["write", "exec"] };
      const result = mergeToolPolicies(base, extra);
      expect(result?.allow).toHaveLength(3);
      expect(result?.allow).toEqual(["read", "write", "exec"]);
    });

    it("should filter empty strings", () => {
      const base: ToolPolicy = { allow: ["read", ""] };
      const extra: ToolPolicy = { allow: ["  "] };
      const result = mergeToolPolicies(base, extra);
      expect(result?.allow).toEqual(["read"]);
    });

    it("should trim whitespace", () => {
      const base: ToolPolicy = { allow: ["  read  "] };
      const result = mergeToolPolicies(base, undefined);
      expect(result?.allow).toEqual(["read"]);
    });
  });
});
