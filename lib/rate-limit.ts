import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

function localRateLimit({
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

type SharedRateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

type RateLimitRpcClient = {
  rpc(
    name: "check_rate_limit",
    params: {
      p_key: string;
      p_limit: number;
      p_window_seconds: number;
      p_cost: number;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function checkRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitVerdict> {
  const local = localRateLimit(options);
  if (!local.ok) return local;

  const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  const identifierHash = createHash("sha256")
    .update(options.identifier)
    .digest("hex");
  const client = getSupabaseAdminClient() as unknown as RateLimitRpcClient;
  const { data, error } = await client.rpc(
    "check_rate_limit",
    {
      p_key: `${options.scope}:${identifierHash}`,
      p_limit: options.limit,
      p_window_seconds: windowSeconds,
      p_cost: 1,
    },
  );
  if (error) {
    // Fail closed. A broken shared limiter must not silently restore the
    // serverless bypass this helper exists to prevent.
    return { ok: false, retryAfterSeconds: windowSeconds };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | SharedRateLimitRow
    | null;
  if (!row?.allowed) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, row?.retry_after_seconds ?? windowSeconds),
    };
  }
  return { ok: true, remaining: Math.max(0, row.remaining) };
}
