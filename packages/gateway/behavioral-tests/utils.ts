/**
 * Shared utilities for behavioral tests
 */

/**
 * Prefixes that indicate a message is still processing
 */
const PROCESSING_PREFIXES = ["⏳", "Processing", "Thinking", "🔧"];

/**
 * Checks if a message is a processing/status message that should be filtered out
 * when waiting for the final agent response.
 *
 * @param content - The message content to check
 * @returns true if this is a processing message, false if it's a final response
 */
export function isProcessingMessage(content: string): boolean {
  const trimmed = content.trim();

  // Check for processing prefixes
  if (PROCESSING_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }

  // Code block with processing indicator
  if (trimmed.startsWith("```") && trimmed.includes("⏳")) {
    return true;
  }

  // Explicit processing message
  if (trimmed.includes("⏳ Processing")) {
    return true;
  }

  // Tool execution status messages like "🔧 正在执行 xxx...\n✅ xxx 完成"
  if (/^🔧.*正在执行/.test(trimmed)) {
    return true;
  }

  return false;
}
