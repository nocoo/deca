import { describe, expect, it } from "bun:test";
import { DISCORD_MAX_MESSAGE_LENGTH, chunkMessage } from "./chunk";

describe("chunkMessage", () => {
  describe("short messages", () => {
    it("returns single chunk for empty string", () => {
      const chunks = chunkMessage("");
      expect(chunks).toEqual([""]);
    });

    it("returns single chunk for short message", () => {
      const msg = "Hello, world!";
      const chunks = chunkMessage(msg);
      expect(chunks).toEqual([msg]);
    });

    it("returns single chunk for exactly max length", () => {
      const msg = "a".repeat(DISCORD_MAX_MESSAGE_LENGTH);
      const chunks = chunkMessage(msg);
      expect(chunks).toEqual([msg]);
      expect(chunks[0].length).toBe(DISCORD_MAX_MESSAGE_LENGTH);
    });
  });

  describe("long messages", () => {
    it("breaks at newlines when possible", () => {
      // 900 + 1 + 900 = 1801 (fits in first chunk)
      // 900 (second chunk)
      const line1 = "a".repeat(900);
      const line2 = "b".repeat(900);
      const line3 = "c".repeat(900);
      const msg = `${line1}\n${line2}\n${line3}`;

      const chunks = chunkMessage(msg);

      expect(chunks.length).toBe(2);
      // First chunk includes line1, newline, line2, and trailing newline
      expect(chunks[0]).toBe(`${line1}\n${line2}\n`);
      expect(chunks[1]).toBe(line3);
    });

    it("breaks at spaces when no newline", () => {
      // Create a message that's longer than max with spaces
      const words = Array(500).fill("hello").join(" ");
      const chunks = chunkMessage(words);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should end at a space boundary (not mid-word)
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk.endsWith(" ") || !chunk.includes(" ")).toBe(true);
      }
    });

    it("hard breaks when no good break point", () => {
      // Single very long word with no spaces or newlines
      const longWord = "a".repeat(3000);
      const chunks = chunkMessage(longWord);

      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(DISCORD_MAX_MESSAGE_LENGTH);
      expect(chunks[1].length).toBe(1000);
    });

    it("trims leading whitespace in subsequent chunks", () => {
      const msg = `${"a".repeat(1990)}          ${"b".repeat(100)}`;
      const chunks = chunkMessage(msg);

      expect(chunks.length).toBe(2);
      // First chunk should include the spaces up to max
      expect(chunks[0].length).toBeLessThanOrEqual(DISCORD_MAX_MESSAGE_LENGTH);
      // Second chunk should not start with spaces
      expect(chunks[1].startsWith(" ")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles unicode characters correctly", () => {
      // Emoji and CJK characters (multi-byte)
      const emoji = "🎉".repeat(600);
      const chunks = chunkMessage(emoji);

      // Each emoji is 2 chars in JS string, so 600 emojis = 1200 chars
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(emoji);

      // Now test with more emojis that exceed limit
      const manyEmoji = "🎉".repeat(1200);
      const moreChunks = chunkMessage(manyEmoji);
      expect(moreChunks.length).toBeGreaterThan(1);

      // Verify chunks don't split emoji in half
      for (const chunk of moreChunks) {
        expect(chunk.includes("\uFFFD")).toBe(false); // No replacement characters
      }
    });

    it("handles very long single word", () => {
      const longWord = "supercalifragilisticexpialidocious".repeat(100);
      const chunks = chunkMessage(longWord);

      expect(chunks.length).toBeGreaterThan(1);
      // Should hard break
      expect(chunks[0].length).toBe(DISCORD_MAX_MESSAGE_LENGTH);
    });

    it("handles multiple consecutive newlines", () => {
      const msg = "Hello\n\n\n\nWorld";
      const chunks = chunkMessage(msg);
      expect(chunks).toEqual([msg]);
    });

    it("respects custom max length", () => {
      const msg = "Hello World! This is a test message.";
      const chunks = chunkMessage(msg, 10);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(10);
      }
    });

    it("handles mixed content", () => {
      // Mix of short lines and long lines that exceed 2000 chars total
      // 10 + 1 + 1980 + 1 + 18 = 2010, breaks into 2 chunks
      const shortLine = "Short line";
      const longLine = "x".repeat(1980);
      const msg = `${shortLine}\n${longLine}\nAnother short line`;

      const chunks = chunkMessage(msg);

      expect(chunks.length).toBe(2);
      expect(chunks[0].startsWith(shortLine)).toBe(true);
      expect(chunks[0]).toContain(longLine);
    });

    it("handles message with only whitespace", () => {
      const chunks = chunkMessage("   \n\n   ");
      expect(chunks).toEqual(["   \n\n   "]);
    });

    it("handles newlines at chunk boundary", () => {
      // Message where newline is at a good break point
      const line1 = "a".repeat(1999);
      const line2 = "b".repeat(100);
      const msg = `${line1}\n${line2}`;

      const chunks = chunkMessage(msg);

      expect(chunks.length).toBe(2);
      // First chunk includes the newline
      expect(chunks[0]).toBe(`${line1}\n`);
      expect(chunks[1]).toBe(line2);
    });
  });
});
