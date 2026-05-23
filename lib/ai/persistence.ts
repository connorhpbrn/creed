import "server-only";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_MODEL_ID,
  getAiModel,
  getOpenRouterModelCatalog,
  type AiModelQuality,
} from "@/lib/ai/model-catalog";

import type { SupabaseLikeClient } from "@/lib/supabase/types";

type AiSettingsRow = {
  user_id: string;
  provider: "openrouter";
  selected_model_id: string;
  encrypted_api_key: string | null;
  api_key_last_four: string | null;
  key_status: "missing" | "valid" | "invalid";
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicAiSettings = {
  provider: "openrouter";
  selectedModelId: string;
  keyStatus: "missing" | "valid" | "invalid";
  keyLastFour?: string;
  lastValidatedAt?: string;
};

export type AiUsageRange = "24h" | "7d" | "30d" | "1y";

export type AiUsageSummary = {
  range: AiUsageRange;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byQuality: Array<{
    quality: AiModelQuality;
    costUsd: number;
  }>;
  byModel: Array<{
    modelId: string;
    modelName: string;
    quality: AiModelQuality;
    costUsd: number;
  }>;
  days: Array<{
    date: string;
    segments: Array<{
      modelId: string;
      modelName: string;
      quality: AiModelQuality;
      costUsd: number;
    }>;
  }>;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export function buildPublicAiSettings(row?: AiSettingsRow | null): PublicAiSettings {
  return {
    provider: "openrouter",
    selectedModelId: row?.selected_model_id ?? DEFAULT_AI_MODEL_ID,
    keyStatus: row?.key_status ?? "missing",
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
  modelId,
  apiKey,
  clearApiKey,
}: {
  client: unknown;
  userId: string;
  modelId: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  const db = client as SupabaseLikeClient;
  const existing = await readAiSettings(db, userId);
  const model = await getAiModel(modelId);
  const now = new Date().toISOString();
  const trimmedKey = apiKey?.trim();

  if (!clearApiKey && !trimmedKey && !existing?.encrypted_api_key) {
    throw new Error("Paste an OpenRouter API key to continue.");
  }

  if (trimmedKey) {
    await validateOpenRouterKey(trimmedKey);
  }

  const row = {
    user_id: userId,
    provider: "openrouter" as const,
    selected_model_id: model.id,
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
    key_status: clearApiKey ? ("missing" as const) : ("valid" as const),
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

async function validateOpenRouterKey(apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("OpenRouter could not validate that API key.");
  }
}

export async function getUserOpenRouterCredential(client: unknown, userId: string) {
  const row = await readAiSettings(client, userId);
  if (!row?.encrypted_api_key || row.key_status !== "valid") {
    throw new Error("Add an OpenRouter API key before using Creed AI.");
  }

  return {
    apiKey: decryptSecret(row.encrypted_api_key),
    modelId: row.selected_model_id || DEFAULT_AI_MODEL_ID,
  };
}

export async function recordAiUsage({
  client,
  userId,
  feature,
  modelId,
  modelQuality,
  inputTokens,
  outputTokens,
  estimatedCostUsd,
}: {
  client: unknown;
  userId: string;
  feature: string;
  modelId: string;
  modelQuality: AiModelQuality;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}) {
  const db = client as SupabaseLikeClient;
  const { error } = await db.from("creed_ai_usage").insert({
    id: `ai_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`,
    user_id: userId,
    feature,
    provider: "openrouter",
    model_id: modelId,
    model_quality: modelQuality,
    input_tokens: Math.max(0, Math.round(inputTokens)),
    output_tokens: Math.max(0, Math.round(outputTokens)),
    estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)),
    created_at: new Date().toISOString(),
  });

  assertNoError(error, "Could not record AI usage.");
}

export function getRangeStart(range: AiUsageRange) {
  const now = Date.now();
  const ms =
    range === "24h"
      ? 24 * 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : range === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 365 * 24 * 60 * 60 * 1000;

  return new Date(now - ms).toISOString();
}

export async function readAiUsageSummary(client: unknown, userId: string, range: AiUsageRange) {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_ai_usage")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", getRangeStart(range))
    .order("created_at", { ascending: true });

  assertNoError(error, "Could not load AI usage.");

  const rows =
    (data as Array<{
      model_id: string;
      model_quality: AiModelQuality;
      input_tokens: number;
      output_tokens: number;
      estimated_cost_usd: number | string;
      created_at: string;
    }> | null) ?? [];

  const summary: AiUsageSummary = {
    range,
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byQuality: [],
    byModel: [],
    days: [],
  };
  const qualityTotals = new Map<AiModelQuality, number>();
  const modelTotals = new Map<string, { modelId: string; quality: AiModelQuality; costUsd: number }>();
  // (date, modelId) → cost, so the per-day tooltip can break down by model.
  const dayTotals = new Map<string, Map<string, { quality: AiModelQuality; costUsd: number }>>();
  const models = await getOpenRouterModelCatalog();

  for (const row of rows) {
    const cost = Number(row.estimated_cost_usd) || 0;
    const quality = row.model_quality;
    const date = row.created_at.slice(0, 10);
    const model = models.find((item) => item.id === row.model_id);
    const effectiveQuality = model?.quality ?? quality;

    summary.totalCostUsd += cost;
    summary.totalInputTokens += row.input_tokens ?? 0;
    summary.totalOutputTokens += row.output_tokens ?? 0;
    qualityTotals.set(quality, (qualityTotals.get(quality) ?? 0) + cost);
    modelTotals.set(row.model_id, {
      modelId: row.model_id,
      quality: effectiveQuality,
      costUsd: (modelTotals.get(row.model_id)?.costUsd ?? 0) + cost,
    });

    if (!dayTotals.has(date)) {
      dayTotals.set(date, new Map());
    }
    const day = dayTotals.get(date) as Map<string, { quality: AiModelQuality; costUsd: number }>;
    const existing = day.get(row.model_id);
    day.set(row.model_id, {
      quality: effectiveQuality,
      costUsd: (existing?.costUsd ?? 0) + cost,
    });
  }

  summary.byQuality = Array.from(qualityTotals.entries()).map(([quality, costUsd]) => ({
    quality,
    costUsd,
  }));
  summary.byModel = Array.from(modelTotals.values()).map((entry) => ({
    ...entry,
    modelName: models.find((model) => model.id === entry.modelId)?.name ?? AI_MODEL_CATALOG.find((model) => model.id === entry.modelId)?.name ?? entry.modelId,
  }));
  summary.days = Array.from(dayTotals.entries()).map(([date, segments]) => ({
    date,
    segments: Array.from(segments.entries()).map(([modelId, entry]) => ({
      modelId,
      modelName:
        models.find((model) => model.id === modelId)?.name ??
        AI_MODEL_CATALOG.find((model) => model.id === modelId)?.name ??
        modelId,
      quality: entry.quality,
      costUsd: entry.costUsd,
    })),
  }));

  return summary;
}
