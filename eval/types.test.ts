/**
 * Unit tests for eval types and utility functions
 */

import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PASS_THRESHOLD,
  type EvalCase,
  type Judgement,
  type QuickCheck,
  createQuickCheckResult,
  getPassThreshold,
  isJudgementPassing,
  runQuickCheck,
} from "./types.js";

// =============================================================================
// runQuickCheck tests
// =============================================================================

describe("runQuickCheck", () => {
  describe("containsAny", () => {
    it("should pass when output contains one of the values", () => {
      const check: QuickCheck = { containsAny: ["foo", "bar", "baz"] };
      const result = runQuickCheck("hello bar world", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("containsAny: found [bar]");
    });

    it("should pass when output contains multiple values", () => {
      const check: QuickCheck = { containsAny: ["foo", "bar", "baz"] };
      const result = runQuickCheck("foo and bar", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("foo");
      expect(result.details).toContain("bar");
    });

    it("should fail when output contains none of the values", () => {
      const check: QuickCheck = { containsAny: ["foo", "bar", "baz"] };
      const result = runQuickCheck("hello world", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("containsAny: none of");
    });

    it("should handle empty containsAny array", () => {
      const check: QuickCheck = { containsAny: [] };
      const result = runQuickCheck("hello world", check);

      expect(result.passed).toBe(true);
    });

    it("should handle emoji values", () => {
      const check: QuickCheck = { containsAny: ["🍅", "🦊", "🤖"] };
      const result = runQuickCheck("I am Tomato 🍅", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("🍅");
    });

    it("should handle Chinese characters", () => {
      const check: QuickCheck = { containsAny: ["番茄", "狐狸", "机器人"] };
      const result = runQuickCheck("我是番茄助手", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("番茄");
    });
  });

  describe("containsAll", () => {
    it("should pass when output contains all values", () => {
      const check: QuickCheck = { containsAll: ["foo", "bar"] };
      const result = runQuickCheck("foo and bar", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("containsAll: all found");
    });

    it("should fail when output is missing one value", () => {
      const check: QuickCheck = { containsAll: ["foo", "bar", "baz"] };
      const result = runQuickCheck("foo and bar", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("missing [baz]");
    });

    it("should fail when output is missing all values", () => {
      const check: QuickCheck = { containsAll: ["foo", "bar"] };
      const result = runQuickCheck("hello world", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("foo");
      expect(result.details).toContain("bar");
    });

    it("should handle empty containsAll array", () => {
      const check: QuickCheck = { containsAll: [] };
      const result = runQuickCheck("hello world", check);

      expect(result.passed).toBe(true);
    });
  });

  describe("notContains", () => {
    it("should pass when output contains none of the forbidden values", () => {
      const check: QuickCheck = { notContains: ["Claude", "GPT", "OpenAI"] };
      const result = runQuickCheck("I am Tomato", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("notContains: none found");
    });

    it("should fail when output contains a forbidden value", () => {
      const check: QuickCheck = { notContains: ["Claude", "GPT", "OpenAI"] };
      const result = runQuickCheck("I am Claude", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("found forbidden [Claude]");
    });

    it("should fail when output contains multiple forbidden values", () => {
      const check: QuickCheck = { notContains: ["Claude", "GPT"] };
      const result = runQuickCheck("Claude and GPT are AI", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("Claude");
      expect(result.details).toContain("GPT");
    });

    it("should handle empty notContains array", () => {
      const check: QuickCheck = { notContains: [] };
      const result = runQuickCheck("hello world", check);

      expect(result.passed).toBe(true);
    });
  });

  describe("matchPattern", () => {
    it("should pass when output matches the pattern", () => {
      const check: QuickCheck = { matchPattern: "\\d{3}-\\d{4}" };
      const result = runQuickCheck("Call 123-4567", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("matchPattern: matched");
    });

    it("should fail when output does not match the pattern", () => {
      const check: QuickCheck = { matchPattern: "\\d{3}-\\d{4}" };
      const result = runQuickCheck("No phone number here", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("not matched");
    });

    it("should handle invalid regex gracefully", () => {
      const check: QuickCheck = { matchPattern: "[invalid" };
      const result = runQuickCheck("test", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("invalid regex");
    });

    it("should match case-sensitive by default", () => {
      const check: QuickCheck = { matchPattern: "Tomato" };
      const result = runQuickCheck("tomato", check);

      expect(result.passed).toBe(false);
    });

    it("should support case-insensitive flag in pattern", () => {
      const check: QuickCheck = { matchPattern: "tomato" };
      const result = runQuickCheck("TOMATO", check);

      // Without flag, should not match
      expect(result.passed).toBe(false);
    });
  });

  describe("minLength", () => {
    it("should pass when output meets minimum length", () => {
      const check: QuickCheck = { minLength: 10 };
      const result = runQuickCheck("hello world!", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("minLength: 12 >= 10");
    });

    it("should fail when output is too short", () => {
      const check: QuickCheck = { minLength: 20 };
      const result = runQuickCheck("short", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("minLength: 5 < 20");
    });

    it("should pass when output exactly meets minimum", () => {
      const check: QuickCheck = { minLength: 5 };
      const result = runQuickCheck("12345", check);

      expect(result.passed).toBe(true);
    });

    it("should handle minLength of 0", () => {
      const check: QuickCheck = { minLength: 0 };
      const result = runQuickCheck("", check);

      expect(result.passed).toBe(true);
    });
  });

  describe("maxLength", () => {
    it("should pass when output is within maximum length", () => {
      const check: QuickCheck = { maxLength: 20 };
      const result = runQuickCheck("short text", check);

      expect(result.passed).toBe(true);
      expect(result.details).toContain("maxLength: 10 <= 20");
    });

    it("should fail when output exceeds maximum length", () => {
      const check: QuickCheck = { maxLength: 5 };
      const result = runQuickCheck("this is too long", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("maxLength: 16 > 5");
    });

    it("should pass when output exactly meets maximum", () => {
      const check: QuickCheck = { maxLength: 5 };
      const result = runQuickCheck("12345", check);

      expect(result.passed).toBe(true);
    });
  });

  describe("combined checks", () => {
    it("should pass when all checks pass", () => {
      const check: QuickCheck = {
        containsAny: ["Tomato", "🍅"],
        notContains: ["Claude"],
        minLength: 5,
      };
      const result = runQuickCheck("I am Tomato!", check);

      expect(result.passed).toBe(true);
    });

    it("should fail when any check fails", () => {
      const check: QuickCheck = {
        containsAny: ["Tomato", "🍅"],
        notContains: ["Claude"],
        minLength: 5,
      };
      const result = runQuickCheck("I am Claude!", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("containsAny");
      expect(result.details).toContain("notContains");
    });

    it("should report all failures when multiple checks fail", () => {
      const check: QuickCheck = {
        containsAny: ["foo"],
        containsAll: ["bar", "baz"],
        notContains: ["bad"],
      };
      const result = runQuickCheck("bad stuff", check);

      expect(result.passed).toBe(false);
      expect(result.details).toContain("containsAny");
      expect(result.details).toContain("containsAll");
      expect(result.details).toContain("notContains");
    });

    it("should handle complex real-world check", () => {
      const check: QuickCheck = {
        containsAny: ["Tomato", "🍅", "番茄"],
        notContains: ["Claude", "Anthropic", "GPT", "OpenAI"],
        minLength: 10,
        maxLength: 500,
      };
      const result = runQuickCheck(
        "你好！我是 Tomato 🍅，一个友好的 AI 助手。",
        check,
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty output", () => {
      const check: QuickCheck = { containsAny: ["foo"] };
      const result = runQuickCheck("", check);

      expect(result.passed).toBe(false);
    });

    it("should handle empty check object", () => {
      const check: QuickCheck = {};
      const result = runQuickCheck("any output", check);

      expect(result.passed).toBe(true);
      expect(result.details).toBe("");
    });

    it("should be case-sensitive for string matching", () => {
      const check: QuickCheck = { containsAny: ["Tomato"] };

      expect(runQuickCheck("Tomato", check).passed).toBe(true);
      expect(runQuickCheck("tomato", check).passed).toBe(false);
      expect(runQuickCheck("TOMATO", check).passed).toBe(false);
    });
  });
});

// =============================================================================
// getPassThreshold tests
// =============================================================================

describe("getPassThreshold", () => {
  it("should return custom threshold when specified", () => {
    const evalCase: EvalCase = {
      id: "test",
      name: "Test",
      description: "Test",
      targetPrompt: "TEST.md",
      category: "test",
      input: "test",
      criteria: "test",
      passThreshold: 80,
    };

    expect(getPassThreshold(evalCase)).toBe(80);
  });

  it("should return default threshold when not specified", () => {
    const evalCase: EvalCase = {
      id: "test",
      name: "Test",
      description: "Test",
      targetPrompt: "TEST.md",
      category: "test",
      input: "test",
      criteria: "test",
    };

    expect(getPassThreshold(evalCase)).toBe(DEFAULT_PASS_THRESHOLD);
  });

  it("should use DEFAULT_PASS_THRESHOLD of 70", () => {
    expect(DEFAULT_PASS_THRESHOLD).toBe(70);
  });

  it("should handle threshold of 0", () => {
    const evalCase: EvalCase = {
      id: "test",
      name: "Test",
      description: "Test",
      targetPrompt: "TEST.md",
      category: "test",
      input: "test",
      criteria: "test",
      passThreshold: 0,
    };

    expect(getPassThreshold(evalCase)).toBe(0);
  });

  it("should handle threshold of 100", () => {
    const evalCase: EvalCase = {
      id: "test",
      name: "Test",
      description: "Test",
      targetPrompt: "TEST.md",
      category: "test",
      input: "test",
      criteria: "test",
      passThreshold: 100,
    };

    expect(getPassThreshold(evalCase)).toBe(100);
  });
});

// =============================================================================
// isJudgementPassing tests
// =============================================================================

describe("isJudgementPassing", () => {
  const baseCase: EvalCase = {
    id: "test",
    name: "Test",
    description: "Test",
    targetPrompt: "TEST.md",
    category: "test",
    input: "test",
    criteria: "test",
  };

  it("should return true when score meets default threshold", () => {
    const judgement: Judgement = {
      passed: true,
      score: 70,
      reasoning: "Good",
    };

    expect(isJudgementPassing(judgement, baseCase)).toBe(true);
  });

  it("should return true when score exceeds default threshold", () => {
    const judgement: Judgement = {
      passed: true,
      score: 85,
      reasoning: "Great",
    };

    expect(isJudgementPassing(judgement, baseCase)).toBe(true);
  });

  it("should return false when score is below default threshold", () => {
    const judgement: Judgement = {
      passed: false,
      score: 60,
      reasoning: "Needs improvement",
    };

    expect(isJudgementPassing(judgement, baseCase)).toBe(false);
  });

  it("should use custom threshold when specified", () => {
    const customCase = { ...baseCase, passThreshold: 90 };
    const judgement: Judgement = {
      passed: true,
      score: 85,
      reasoning: "Good but not enough",
    };

    expect(isJudgementPassing(judgement, customCase)).toBe(false);
  });

  it("should pass when score exactly matches threshold", () => {
    const customCase = { ...baseCase, passThreshold: 75 };
    const judgement: Judgement = {
      passed: true,
      score: 75,
      reasoning: "Just enough",
    };

    expect(isJudgementPassing(judgement, customCase)).toBe(true);
  });

  it("should handle edge case of 0 threshold", () => {
    const customCase = { ...baseCase, passThreshold: 0 };
    const judgement: Judgement = {
      passed: true,
      score: 0,
      reasoning: "Zero",
    };

    expect(isJudgementPassing(judgement, customCase)).toBe(true);
  });

  it("should handle edge case of 100 threshold", () => {
    const customCase = { ...baseCase, passThreshold: 100 };

    const perfect: Judgement = {
      passed: true,
      score: 100,
      reasoning: "Perfect",
    };
    const almostPerfect: Judgement = {
      passed: true,
      score: 99,
      reasoning: "Almost",
    };

    expect(isJudgementPassing(perfect, customCase)).toBe(true);
    expect(isJudgementPassing(almostPerfect, customCase)).toBe(false);
  });
});

// =============================================================================
// createQuickCheckResult tests
// =============================================================================

describe("createQuickCheckResult", () => {
  it("should return not-ran result when check is undefined", () => {
    const result = createQuickCheckResult(undefined, "any output");

    expect(result.ran).toBe(false);
    expect(result.passed).toBe(null);
    expect(result.details).toBeUndefined();
  });

  it("should return passing result when check passes", () => {
    const check: QuickCheck = { containsAny: ["hello"] };
    const result = createQuickCheckResult(check, "hello world");

    expect(result.ran).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.details).toBeDefined();
  });

  it("should return failing result when check fails", () => {
    const check: QuickCheck = { containsAny: ["foo"] };
    const result = createQuickCheckResult(check, "hello world");

    expect(result.ran).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.details).toBeDefined();
  });

  it("should include details from runQuickCheck", () => {
    const check: QuickCheck = {
      containsAny: ["hello"],
      notContains: ["goodbye"],
    };
    const result = createQuickCheckResult(check, "hello world");

    expect(result.details).toContain("containsAny");
    expect(result.details).toContain("notContains");
  });
});
