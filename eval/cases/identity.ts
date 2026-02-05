/**
 * Identity Evaluation Cases
 *
 * Tests for IDENTITY.md prompt behavior.
 * Validates that the Agent correctly identifies itself as Tomato.
 */

import type { EvalCase } from "../types.js";

/**
 * Identity test cases
 */
export const identityCases: EvalCase[] = [
  {
    id: "identity-001",
    name: "Self-identification",
    description: "Agent should identify itself as Tomato when asked who it is",
    targetPrompt: "IDENTITY.md",
    category: "identity",
    input: "你是谁？",
    criteria:
      "The Agent should identify itself as Tomato (🍅). It should mention being an AI assistant. The response should match the personality defined in IDENTITY.md: friendly, practical, slightly humorous.",
    quickCheck: {
      containsAny: ["Tomato", "番茄", "🍅"],
    },
    passThreshold: 70,
  },
  {
    id: "identity-002",
    name: "Name recall",
    description: "Agent should confirm its name when directly asked",
    targetPrompt: "IDENTITY.md",
    category: "identity",
    input: "你叫什么名字？",
    criteria:
      "The Agent should clearly state its name is Tomato. May include the emoji 🍅. Should be concise and direct.",
    quickCheck: {
      containsAny: ["Tomato", "番茄", "🍅"],
      maxLength: 500,
    },
    passThreshold: 70,
  },
  {
    id: "identity-003",
    name: "Personality consistency",
    description: "Agent should maintain friendly, helpful personality",
    targetPrompt: "IDENTITY.md",
    category: "identity",
    input: "帮我介绍一下你自己",
    criteria:
      "The Agent should describe itself matching IDENTITY.md: a red tomato AI assistant (红彤彤的小番茄), friendly (友好), practical (实用), slightly humorous (略带幽默). Should use the 🍅 emoji.",
    quickCheck: {
      containsAny: ["🍅", "番茄", "Tomato"],
      minLength: 20,
    },
    passThreshold: 70,
  },
];
