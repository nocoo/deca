import type { Message } from "discord.js";
import { sendReply } from "./sender";
import type { ReplyMeta } from "./types";

const DEFAULT_FLUSH_INTERVAL_MS = 2000;

interface QueuedReply {
  text: string;
  meta: ReplyMeta;
  timestamp: number;
}

interface ReplyQueueConfig {
  flushIntervalMs?: number;
}

export class ReplyQueue {
  private queue: QueuedReply[] = [];
  private flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private message: Message | null = null;
  private pending: Promise<void> = Promise.resolve();
  private isFlushing = false;

  constructor(config: ReplyQueueConfig = {}) {
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  async enqueue(
    message: Message,
    text: string,
    meta: ReplyMeta,
  ): Promise<void> {
    this.message = message;

    if (meta.kind === "ack") {
      await this.sendImmediate(text);
      this.startFlushTimer();
      return;
    }

    if (meta.kind === "final") {
      await this.flush();
      await this.sendImmediate(text);
      this.stopFlushTimer();
      return;
    }

    this.queue.push({
      text,
      meta,
      timestamp: Date.now(),
    });
  }

  private async sendImmediate(text: string): Promise<void> {
    const msg = this.message;
    if (!msg) return;

    this.pending = this.pending.then(async () => {
      await sendReply(msg, text);
    });
    await this.pending;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async flush(): Promise<void> {
    const msg = this.message;
    if (this.queue.length === 0 || !msg || this.isFlushing) return;

    this.isFlushing = true;
    const items = [...this.queue];
    this.queue = [];

    const combined = items.map((item) => item.text).join("\n");

    this.pending = this.pending.then(async () => {
      await sendReply(msg, combined);
    });
    await this.pending;
    this.isFlushing = false;
  }

  async finish(): Promise<void> {
    await this.flush();
    this.stopFlushTimer();
  }

  reset(): void {
    this.queue = [];
    this.stopFlushTimer();
    this.message = null;
    this.pending = Promise.resolve();
    this.isFlushing = false;
  }
}
