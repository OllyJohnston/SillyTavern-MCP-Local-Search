import pLimit from 'p-limit';

export class RateLimiter {
  private limit: ReturnType<typeof pLimit>;
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly windowIntervalMs: number = 60000; // 1 minute

  constructor(maxRequestsPerMinute: number = 10) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.limit = pLimit(5); // Max 5 concurrent requests
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Clean up older timestamps outside the rolling window
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.windowIntervalMs);
    
    // Check rate limit
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = this.windowIntervalMs - (now - oldestTimestamp);
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Execute with concurrency limit
    const result = await this.limit(async () => {
      // Record timestamp right before execution within concurrency tracking
      this.requestTimestamps.push(Date.now());
      return await fn();
    });

    return result;
  }

  getStatus(): { requestCount: number; maxRequests: number; waitTimeMs: number } {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.windowIntervalMs);
    
    let waitTimeMs = 0;
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      waitTimeMs = this.windowIntervalMs - (now - oldestTimestamp);
    }

    return {
      requestCount: this.requestTimestamps.length,
      maxRequests: this.maxRequestsPerMinute,
      waitTimeMs: Math.max(0, waitTimeMs),
    };
  }
} 
