/**
 * Heartbeat Tokens
 *
 * Protocol tokens for heartbeat communication between Agent and Gateway.
 * When Agent has nothing to report, it replies with HEARTBEAT_OK.
 * Gateway strips this token and suppresses delivery.
 */

/**
 * Token that Agent includes when heartbeat check found nothing actionable.
 */
export const HEARTBEAT_OK = "HEARTBEAT_OK";

/**
 * Result of stripping the heartbeat token from a response.
 */
export interface StripResult {
  /** Remaining text after stripping (empty if token-only) */
  text: string;
  /** Whether the token was found and stripped */
  didStrip: boolean;
  /** Whether delivery should be skipped (token-only or empty response) */
  shouldSkip: boolean;
}

/**
 * Strip HEARTBEAT_OK token from Agent response text.
 *
 * Handles:
 * - Exact match: "HEARTBEAT_OK" → skip
 * - Leading token: "HEARTBEAT_OK some text" → return "some text"
 * - Trailing token: "some text HEARTBEAT_OK" → return "some text"
 * - Empty/undefined → skip
 * - Token in middle: "before HEARTBEAT_OK after" → no strip (intentional embedding)
 */
export function stripHeartbeatToken(raw?: string): StripResult {
  if (!raw) {
    return { text: "", didStrip: false, shouldSkip: true };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "", didStrip: false, shouldSkip: true };
  }

  if (!trimmed.includes(HEARTBEAT_OK)) {
    return { text: trimmed, didStrip: false, shouldSkip: false };
  }

  // Exact match
  if (trimmed === HEARTBEAT_OK) {
    return { text: "", didStrip: true, shouldSkip: true };
  }

  // Leading token (must be followed by whitespace or end of string)
  if (
    trimmed.startsWith(`${HEARTBEAT_OK} `) ||
    trimmed.startsWith(`${HEARTBEAT_OK}\n`)
  ) {
    const rest = trimmed.slice(HEARTBEAT_OK.length).trimStart();
    if (rest) {
      return { text: rest, didStrip: true, shouldSkip: false };
    }
    return { text: "", didStrip: true, shouldSkip: true };
  }

  // Trailing token (must be preceded by whitespace)
  if (
    trimmed.endsWith(` ${HEARTBEAT_OK}`) ||
    trimmed.endsWith(`\n${HEARTBEAT_OK}`)
  ) {
    const rest = trimmed.slice(0, -HEARTBEAT_OK.length).trimEnd();
    if (rest) {
      return { text: rest, didStrip: true, shouldSkip: false };
    }
    return { text: "", didStrip: true, shouldSkip: true };
  }

  // Token in the middle — don't strip (intentional embedding)
  return { text: trimmed, didStrip: false, shouldSkip: false };
}
