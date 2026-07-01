import "server-only";
import { randomBytes } from "node:crypto";
import { encryptSecret } from "@/lib/secret-crypto";
import type { AiModelQuality } from "@/lib/ai/model-catalog";
import { normalizeFeature } from "@/lib/ai/features";

import type { SupabaseLikeClient } from "@/lib/supabase/types";

const MICRO_PER_USD = 1_000_000;

// Which key pays for first-party AI. 'credits' runs on Creed's platform key and
// bills the user's prepaid balance; 'byok' runs on the user's own key at no
// markup. The toggle lives in Settings; default is 'credits'. The model itself
// is server-selected per feature and hidden from the user in both modes.
export type AiMode = "credits" | "byok";

type AiSettingsRow = {
  user_id: string;
  provider: "openrouter";
  encrypted_api_key: string | null;
  api_key_last_four: string | null;
  key_status: "missing" | "valid" | "invalid";
  ai_mode: AiMode;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicAiSettings = {
  provider: "openrouter";
  keyStatus: "missing" | "valid" | "invalid";
  aiMode: AiMode;
  keyLastFour?: string;
  lastValidatedAt?: string;
};

export type AiUsageRange = "7d" | "30d" | "90d";

// The spend chart is tagged by feature (Analysis today; Tab/CMD-K later), not by
// model, since the model is hidden. Costs are the amounts actually charged
// (marked-up in credits mode, at-cost in BYOK), summed from creed_ai_usage.
export type AiUsageSummary = {
  range: AiUsageRange;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: Array<{ feature: string; costUsd: number }>;
  days: Array<{
    date: string;
    segments: Array<{ feature: string; costUsd: number }>;
  }>;
};

export type OpenRouterBalance = {
  usageUsd: number;
  // null limit means an unlimited key (OpenRouter returns limit: null).
  limitUsd: number | null;
  remainingUsd: number | null;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export function buildPublicAiSettings(row?: AiSettingsRow | null): PublicAiSettings {
  return {
    provider: "openrouter",
    keyStatus: row?.key_status ?? "missing",
    aiMode: row?.ai_mode ?? "credits",
    keyLastFour: row?.api_key_last_four ?? undefined,
    lastValidatedAt: row?.last_validated_at ?? undefined,
  };
}

export async function readAiSettings(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_ai_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error, "Could not load AI settings.");
  return (data as AiSettingsRow | null) ?? null;
}

export async function readPublicAiSettings(client: unknown, userId: string) {
  return buildPublicAiSettings(await readAiSettings(client, userId));
}

export async function upsertAiSettings({
  client,
  userId,
  apiKey,
  clearApiKey,
  aiMode,
}: {
  client: unknown;
  userId: string;
  apiKey?: string;
  clearApiKey?: boolean;
  aiMode?: AiMode;
}) {
  const db = client as SupabaseLikeClient;
  const existing = await readAiSettings(db, userId);
  const now = new Date().toISOString();
  const trimmedKey = apiKey?.trim();
  const nextMode: AiMode = aiMode ?? existing?.ai_mode ?? "credits";

  // No key-required guard here. This endpoint also handles the credits/byok
  // toggle, which involves no key. The "you need a key" check happens at
  // AI-call time (resolveAiCredential), and Save is disabled client-side when
  // the field is empty.
  if (trimmedKey) {
    await validateOpenRouterKey(trimmedKey);
  }

  const row = {
    user_id: userId,
    provider: "openrouter" as const,
    encrypted_api_key: clearApiKey
      ? null
      : trimmedKey
        ? encryptSecret(trimmedKey)
        : existing?.encrypted_api_key ?? null,
    api_key_last_four: clearApiKey
      ? null
      : trimmedKey
        ? trimmedKey.slice(-4)
        : existing?.api_key_last_four ?? null,
    // Preserve key_status on a mode-only save; only a new key flips it to valid
    // and a clear flips it to missing.
    key_status: clearApiKey
      ? ("missing" as const)
      : trimmedKey
        ? ("valid" as const)
        : existing?.key_status ?? ("missing" as const),
    ai_mode: nextMode,
    last_validated_at: now,
    updated_at: now,
    created_at: existing?.created_at ?? now,
  };

  const { error } = await db
    .from("creed_ai_settings")
    .upsert(row, { onConflict: "user_id" });

  assertNoError(error, "Could not save AI settings.");
  return buildPublicAiSettings(row);
}

// Read a BYOK user's live OpenRouter balance for the settings card. Throws on a
// bad/expired key so the caller can surface a clean error.
export async function fetchOpenRouterBalance(apiKey: string): Promise<OpenRouterBalance> {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("OpenRouter could not read that key");
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { usage?: number; limit?: number | null };
  } | null;

  const usageUsd = Number(payload?.data?.usage) || 0;
  const rawLimit = payload?.data?.limit;
  const limitUsd = typeof rawLimit === "number" ? rawLimit : null;
  const remainingUsd = limitUsd != null ? Math.max(0, limitUsd - usageUsd) : null;
  return { usageUsd, limitUsd, remainingUsd };
}

async function validateOpenRouterKey(apiKey: string) {
  // Reuse the balance fetch; it hits GET /api/v1/key and throws on a bad key.
  await fetchOpenRouterBalance(apiKey);
}

export async function recordAiUsage({
  client,
  userId,
  feature,
  modelId,
  modelQuality,
  inputTokens,
  outputTokens,
  costUsd,
  chargedMicroUsd,
  aiMode,
}: {
  client: unknown;
  userId: string;
  feature: string;
  modelId: string;
  modelQuality: AiModelQuality;
  inputTokens: number;
  outputTokens: number;
  // The real (at-cost) OpenRouter cost of the call.
  costUsd: number;
  // The amount actually charged, in micro-USD: marked-up in credits mode,
  // at-cost in BYOK. The spend chart sums this so it never re-prices on a
  // markup change.
  chargedMicroUsd: number;
  aiMode: AiMode;
}) {
  const db = client as SupabaseLikeClient;
  const { error } = await db.from("creed_ai_usage").insert({
    id: `ai_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`,
    user_id: userId,
    feature,
    provider: "openrouter",
    model_id: modelId,
    model_quality: modelQuality,
    ai_mode: aiMode,
    input_tokens: Math.max(0, Math.round(inputTokens)),
    output_tokens: Math.max(0, Math.round(outputTokens)),
    estimated_cost_usd: Number(costUsd.toFixed(6)),
    charged_micro_usd: Math.max(0, Math.round(chargedMicroUsd)),
    created_at: new Date().toISOString(),
  });

  assertNoError(error, "Could not record AI usage.");
}

export function getRangeStart(range: AiUsageRange) {
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function readAiUsageSummary(
  client: unknown,
  userId: string,
  range: AiUsageRange,
  mode: AiMode
) {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_ai_usage")
    .select("feature, charged_micro_usd, estimated_cost_usd, input_tokens, output_tokens, created_at")
    .eq("user_id", userId)
    .eq("ai_mode", mode)
    .gte("created_at", getRangeStart(range))
    .order("created_at", { ascending: true });

  assertNoError(error, "Could not load AI usage.");

  const rows =
    (data as Array<{
      feature: string;
      charged_micro_usd: number | string | null;
      estimated_cost_usd: number | string;
      input_tokens: number;
      output_tokens: number;
      created_at: string;
    }> | null) ?? [];

  const summary: AiUsageSummary = {
    range,
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byFeature: [],
    days: [],
  };
  const featureTotals = new Map<string, number>();
  // (date, feature) → cost, so the per-day tooltip can break down by feature.
  const dayTotals = new Map<string, Map<string, number>>();

  for (const row of rows) {
    // Prefer the charged amount (already marked-up in credits mode); fall back
    // to the at-cost value for any legacy row missing the column.
    const cost =
      row.charged_micro_usd != null
        ? (Number(row.charged_micro_usd) || 0) / MICRO_PER_USD
        : Number(row.estimated_cost_usd) || 0;
    // Fold legacy keys (e.g. "quality_analysis") onto the canonical feature so
    // the chart shows one series, not two.
    const feature = normalizeFeature(row.feature || "analysis");
    const date = row.created_at.slice(0, 10);

    summary.totalCostUsd += cost;
    summary.totalInputTokens += row.input_tokens ?? 0;
    summary.totalOutputTokens += row.output_tokens ?? 0;
    featureTotals.set(feature, (featureTotals.get(feature) ?? 0) + cost);

    if (!dayTotals.has(date)) {
      dayTotals.set(date, new Map());
    }
    const day = dayTotals.get(date) as Map<string, number>;
    day.set(feature, (day.get(feature) ?? 0) + cost);
  }

  summary.byFeature = Array.from(featureTotals.entries()).map(([feature, costUsd]) => ({
    feature,
    costUsd,
  }));
  summary.days = Array.from(dayTotals.entries()).map(([date, segments]) => ({
    date,
    segments: Array.from(segments.entries()).map(([feature, costUsd]) => ({
      feature,
      costUsd,
    })),
  }));

  return summary;
}
