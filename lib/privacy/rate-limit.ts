/**
 * In-process sliding-window rate limits for community write paths.
 * Suitable for a single Node instance (hackathon); not a distributed limit.
 */

export type RateLimitBucket =
  | "post_create"
  | "reply_create"
  | "interest_toggle"
  | "message_send"
  | "conversation_start"
  | "report_create"
  | "block_create"
  | "feedback_create"
  | "feedback_clear";

type Entry = { timestamps: number[] };

const store = new Map<string, Entry>();

const LIMITS: Record<RateLimitBucket, { max: number; windowMs: number }> = {
  post_create: { max: 10, windowMs: 60 * 60 * 1000 },
  reply_create: { max: 20, windowMs: 10 * 60 * 1000 },
  interest_toggle: { max: 30, windowMs: 10 * 60 * 1000 },
  message_send: { max: 60, windowMs: 10 * 60 * 1000 },
  conversation_start: { max: 20, windowMs: 60 * 60 * 1000 },
  report_create: { max: 15, windowMs: 60 * 60 * 1000 },
  block_create: { max: 30, windowMs: 60 * 60 * 1000 },
  feedback_create: { max: 60, windowMs: 10 * 60 * 1000 },
  feedback_clear: { max: 10, windowMs: 60 * 60 * 1000 },
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function key(bucket: RateLimitBucket, userId: string): string {
  return `${bucket}:${userId}`;
}

/** Record an attempt; returns whether it is allowed. */
export function checkRateLimit(
  bucket: RateLimitBucket,
  userId: string,
  now = Date.now(),
): RateLimitResult {
  const cfg = LIMITS[bucket];
  const k = key(bucket, userId);
  let entry = store.get(k);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(k, entry);
  }

  const cutoff = now - cfg.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= cfg.max) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + cfg.windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }

  entry.timestamps.push(now);
  return { ok: true };
}

/** Test helper — clear all buckets. */
export function resetRateLimitsForTests(): void {
  store.clear();
}

export function rateLimitExceededResponse(retryAfterSec: number) {
  return {
    body: {
      ok: false as const,
      error: "Too many requests. Please try again later.",
    },
    status: 429 as const,
    headers: { "Retry-After": String(retryAfterSec) },
  };
}
