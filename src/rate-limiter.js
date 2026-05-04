/**
 * Token-bucket rate limiter.
 *
 * Plutio's published default is 1000 requests/hour per OAuth client. This
 * limiter queues callers transparently when the bucket runs dry so that a
 * burst of agent calls cannot blow past the cap and get the client temporarily
 * blocked.
 *
 * Use:
 *   const rl = new RateLimiter(1000);
 *   await rl.acquire();
 *   // ... do request
 *   rl.available(); // -> integer remaining
 */
class RateLimiter {
  constructor(requestsPerHour) {
    const capacity = Math.max(1, Math.floor(Number(requestsPerHour) || 1000));
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = capacity / (60 * 60 * 1000);
    this.lastRefill = Date.now();
    this.queue = [];
    this.drainTimer = null;
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const add = elapsed * this.refillPerMs;
    if (add > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + add);
      this.lastRefill = now;
    }
  }

  tryConsume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  acquire() {
    if (this.tryConsume()) return Promise.resolve();
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.scheduleDrain();
    });
  }

  scheduleDrain() {
    if (this.drainTimer) return;
    const msToNext = Math.max(10, Math.ceil((1 - this.tokens) / this.refillPerMs));
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      while (this.queue.length > 0 && this.tryConsume()) {
        const next = this.queue.shift();
        if (next) next();
      }
      if (this.queue.length > 0) this.scheduleDrain();
    }, msToNext);
  }

  available() {
    this.refill();
    return Math.floor(this.tokens);
  }

  status() {
    return {
      capacity: this.capacity,
      available: this.available(),
      queued: this.queue.length,
      windowSeconds: 3600
    };
  }
}

module.exports = {
  RateLimiter
};
