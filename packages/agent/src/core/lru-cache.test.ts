import { describe, expect, it } from "bun:test";
import { LRUCache } from "./lru-cache.js";

describe("LRUCache", () => {
  describe("constructor", () => {
    it("should create cache with specified max size", () => {
      const cache = new LRUCache<string, number>(5);
      expect(cache.size()).toBe(0);
    });

    it("should create cache with default max size of 100", () => {
      const cache = new LRUCache<string, number>();
      // Add 101 items to verify default size
      for (let i = 0; i < 101; i++) {
        cache.put(`key${i}`, i);
      }
      expect(cache.size()).toBe(100);
    });

    it("should throw error for zero or negative max size", () => {
      expect(() => new LRUCache<string, number>(0)).toThrow(
        "Cache size must be greater than 0",
      );
      expect(() => new LRUCache<string, number>(-1)).toThrow(
        "Cache size must be greater than 0",
      );
    });
  });

  describe("put and get", () => {
    it("should store and retrieve values", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBe(2);
    });

    it("should return undefined for non-existent keys", () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should update value when putting same key", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("a", 10);
      expect(cache.get("a")).toBe(10);
      expect(cache.size()).toBe(1);
    });

    it("should evict least recently used item when capacity exceeded", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      cache.put("d", 4); // Should evict "a"

      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(true);
      expect(cache.has("c")).toBe(true);
      expect(cache.has("d")).toBe(true);
      expect(cache.size()).toBe(3);
    });

    it("should update LRU order on get", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      cache.get("a"); // "a" becomes most recently used
      cache.put("d", 4); // Should evict "b" (now least recently used)

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
      expect(cache.has("d")).toBe(true);
    });

    it("should update LRU order on put of existing key", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      cache.put("a", 10); // "a" becomes most recently used
      cache.put("d", 4); // Should evict "b"

      expect(cache.has("a")).toBe(true);
      expect(cache.get("a")).toBe(10);
      expect(cache.has("b")).toBe(false);
    });
  });

  describe("has", () => {
    it("should return true for existing keys", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      expect(cache.has("a")).toBe(true);
    });

    it("should return false for non-existing keys", () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.has("a")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should remove existing key and return true", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.has("a")).toBe(false);
      expect(cache.size()).toBe(0);
    });

    it("should return false for non-existing key", () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.delete("a")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(false);
    });
  });

  describe("size", () => {
    it("should return current number of entries", () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.size()).toBe(0);
      cache.put("a", 1);
      expect(cache.size()).toBe(1);
      cache.put("b", 2);
      expect(cache.size()).toBe(2);
    });
  });

  describe("iterators", () => {
    it("should iterate keys in insertion order", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      expect([...cache.keys()]).toEqual(["a", "b", "c"]);
    });

    it("should iterate values in insertion order", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      expect([...cache.values()]).toEqual([1, 2, 3]);
    });

    it("should iterate entries in insertion order", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      expect([...cache.entries()]).toEqual([
        ["a", 1],
        ["b", 2],
      ]);
    });

    it("should reflect LRU order after get", () => {
      const cache = new LRUCache<string, number>(3);
      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      cache.get("a"); // Move "a" to end
      expect([...cache.keys()]).toEqual(["b", "c", "a"]);
    });
  });
});
