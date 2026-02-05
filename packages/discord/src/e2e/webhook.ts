/**
 * Discord Webhook Client for E2E Testing
 *
 * Sends test messages via webhook to trigger bot responses.
 */

export interface WebhookConfig {
  /** Webhook URL (includes id and token) */
  url: string;
  /** Username to display (default: "E2E Tester") */
  username?: string;
}

export interface WebhookMessage {
  /** Message content */
  content: string;
  /** Username override */
  username?: string;
}

export interface WebhookResponse {
  /** Message ID if wait=true */
  id?: string;
  /** Whether send succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Send a message via Discord webhook.
 *
 * @param config - Webhook configuration
 * @param message - Message to send
 * @returns Response with message ID (if wait=true)
 */
export async function sendWebhookMessage(
  config: WebhookConfig,
  message: WebhookMessage,
): Promise<WebhookResponse> {
  const url = new URL(config.url);
  // Add ?wait=true to get the message ID back
  url.searchParams.set("wait", "true");

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: message.content,
        username: message.username ?? config.username ?? "E2E Tester",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Webhook failed: ${response.status} ${text}`,
      };
    }

    const data = (await response.json()) as { id: string };
    return {
      id: data.id,
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: `Webhook error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate a unique test message ID for correlation.
 *
 * @returns Unique test ID (format: e2e-<timestamp>-<random>)
 */
export function generateTestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `e2e-${timestamp}-${random}`;
}

/**
 * Create a test message with embedded test ID.
 *
 * @param testId - Unique test identifier
 * @param content - Optional additional content
 * @returns Message content with test ID
 */
export function createTestMessage(testId: string, content = "ping"): string {
  return `[${testId}] ${content}`;
}

/**
 * Extract test ID from a message.
 *
 * @param content - Message content
 * @returns Test ID if found, null otherwise
 */
export function extractTestId(content: string): string | null {
  const match = content.match(/\[(e2e-[a-z0-9]+-[a-z0-9]+)\]/);
  return match ? match[1] : null;
}
