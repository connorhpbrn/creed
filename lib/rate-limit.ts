// Lightweight in-memory token-bucket rate limiter. Per-process scope only —
// adequate for single-region deployments and the volumes Creed sees today;
// graduate to Upstash / Redis when running multi-instance.

type Bucket = {
  tokens: number;
  refilledAt: number;
};

const BUCKETS = new Map<string, Bucket>();
const CLEANUP_AFTER_MS = 1000 * 60 * 10; // 10 minutes
let lastCleanupAt = 0;

export type RateLimitVerdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export type RateLimitOptions = {
  /** Identifier for the limiter scope (e.g. "creed-write", "creed-read"). */
  scope: string;
  /** Stable identifier for the caller (token, IP, user id). */
  identifier: string;
  /** Maximum number of allowed actions per window. */
  limit: number;
  /** Window in milliseconds. */
  windowMs: number;
};

function cleanupExpired(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  for (const [key, bucket] of BUCKETS) {
    if (now - bucket.refilledAt > CLEANUP_AFTER_MS) {
      BUCKETS.delete(key);
    }
  }
  lastCleanupAt = now;
}

export function checkRateLimit({
  scope,
  identifier,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitVerdict {
  if (limit <= 0 || windowMs <= 0) {
    return { ok: true, remaining: limit };
  }

  const key = `${scope}:${identifier}`;
  const now = Date.now();
  cleanupExpired(now);

  const bucket = BUCKETS.get(key);

  if (!bucket) {
    BUCKETS.set(key, { tokens: limit - 1, refilledAt: now });
    return { ok: true, remaining: limit - 1 };
  }

  const elapsed = now - bucket.refilledAt;
  if (elapsed >= windowMs) {
    BUCKETS.set(key, { tokens: limit - 1, refilledAt: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return { ok: true, remaining: bucket.tokens };
  }

  const retryAfterSeconds = Math.ceil((windowMs - elapsed) / 1000);
  return { ok: false, retryAfterSeconds };
}
