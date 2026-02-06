/**
 * Eval Cases Index
 *
 * Central registry of all evaluation test cases.
 * Import cases from individual category files and export as a unified collection.
 *
 * Naming Convention:
 * - File: {prompt-name}.ts (e.g., soul.ts, identity.ts, agents.ts)
 * - Case ID: {category}-{subcategory}-{number} (e.g., soul-authentic-001)
 * - Categories match the prompt file being tested
 */

import type { EvalCase } from "../types.js";
import { agentsCases } from "./agents.js";
import { identityCases } from "./identity.js";
import { soulCases } from "./soul.js";

/**
 * All registered evaluation cases
 */
export const allCases: EvalCase[] = [
  ...soulCases,
  ...identityCases,
  ...agentsCases,
];

/**
 * Get cases by category
 */
export function getCasesByCategory(category: string): EvalCase[] {
  return allCases.filter((c) => c.category === category);
}

/**
 * Get cases by target prompt
 */
export function getCasesByPrompt(targetPrompt: string): EvalCase[] {
  return allCases.filter((c) => c.targetPrompt === targetPrompt);
}

/**
 * Get a single case by ID
 */
export function getCaseById(id: string): EvalCase | undefined {
  return allCases.find((c) => c.id === id);
}

/**
 * Get all unique categories
 */
export function getCategories(): string[] {
  return [...new Set(allCases.map((c) => c.category))];
}

/**
 * Get all unique target prompts
 */
export function getTargetPrompts(): string[] {
  return [...new Set(allCases.map((c) => c.targetPrompt))];
}

/**
 * Get case count summary
 */
export function getCaseSummary(): Record<string, number> {
  const summary: Record<string, number> = {
    total: allCases.length,
  };
  for (const category of getCategories()) {
    summary[category] = getCasesByCategory(category).length;
  }
  return summary;
}
