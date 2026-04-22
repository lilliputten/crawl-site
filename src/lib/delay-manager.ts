// src/lib/delay-manager.ts

import { CrawlConfig } from '@/types';

export class DelayManager {
  private consecutiveErrors: number = 0;
  private config: CrawlConfig;

  constructor(config: CrawlConfig) {
    this.config = config;
  }

  /**
   * Get current delay based on consecutive errors
   */
  getCurrentDelay(): number {
    const baseDelay = this.config.crawlDelay;
    const multiplier = Math.pow(2, this.consecutiveErrors);
    const delay = baseDelay * multiplier;
    return Math.min(delay, this.config.maxDelay); // Cap at configured max delay
  }

  /**
   * Wait for the current delay
   */
  async wait(): Promise<void> {
    const delay = this.getCurrentDelay();
    if (delay > 0) {
      await this.sleep(delay);
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Record a failed request
   */
  recordError(): void {
    this.consecutiveErrors++;
  }

  /**
   * Reset error count
   */
  reset(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  getRetryDelay(attempt: number): number {
    return this.config.retryDelayBase * Math.pow(2, attempt);
  }
}
