import type { Message } from "discord.js";
import { sendReply } from "./sender";
import type { ReplyMeta } from "./types";

const DEFAULT_MIN_INTERVAL_MS = 2000;
const DEFAULT_MAX_PROGRESS = 3;

interface ThrottlerConfig {
  minIntervalMs?: number;
  maxProgress?: number;
}

export class ReplyThrottler {
  private lastSentAt = 0;
  private progressCount = 0;
  private minIntervalMs: number;
  private maxProgress: number;
  private pending: Promise<void> = Promise.resolve();

  constructor(config: ThrottlerConfig = {}) {
    this.minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxProgress = config.maxProgress ?? DEFAULT_MAX_PROGRESS;
  }

  async maybeReply(
    message: Message,
    text: string,
    meta: ReplyMeta,
  ): Promise<boolean> {
    if (meta.kind === "ack") {
      this.pending = this.pending.then(async () => {
        await sendReply(message, text);
        this.lastSentAt = Date.now();
      });
      await this.pending;
      return true;
    }

    if (meta.kind === "final") {
      this.pending = this.pending.then(async () => {
        await sendReply(message, text);
      });
      await this.pending;
      return true;
    }

    const now = Date.now();
    const elapsed = now - this.lastSentAt;

    if (elapsed < this.minIntervalMs) {
      return false;
    }

    if (this.progressCount >= this.maxProgress) {
      return false;
    }

    this.pending = this.pending.then(async () => {
      await sendReply(message, text);
      this.lastSentAt = Date.now();
      this.progressCount++;
    });
    await this.pending;
    return true;
  }

  reset(): void {
    this.lastSentAt = 0;
    this.progressCount = 0;
    this.pending = Promise.resolve();
  }
}
