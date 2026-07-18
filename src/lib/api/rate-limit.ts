/**
 * Per-session fixed-window rate limiter.
 *
 * In-memory (module-level Map) — correct for a single serverless
 * instance / local dev. Production would back this with Redis or Vercel
 * KV so the window is shared across instances. Called from `withApi`
 * on every /api request.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export function checkRateLimit(token: string, now: number): RateLimitResult {
  const bucket = buckets.get(token);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(token, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetMs: WINDOW_MS };
  }

  bucket.count++;
  const resetMs = WINDOW_MS - (now - bucket.windowStart);
  if (bucket.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetMs };
  }
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count, resetMs };
}
