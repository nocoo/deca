/**
 * Eval Cases Index
 *
 * Central registry of all evaluation test cases.
 * Import cases from individual category files and export as a unified collection.
 */

import type { EvalCase } from "../types.js";
import { identityCases } from "./identity.js";

/**
 * All registered evaluation cases
 */
export const allCases: EvalCase[] = [...identityCases];

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
