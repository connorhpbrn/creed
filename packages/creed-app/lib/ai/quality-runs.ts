import "server-only";

import { createHash } from "node:crypto";
import type { CreedSection } from "@creed/core/creed-data";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { log } from "@/lib/observability";
import { analyzeCreedQuality, hashCreedSections } from "@/lib/ai/quality";

export type QualityRunStatus = "queued" | "running" | "completed" | "failed";

export type QualityRunPublic = {
  id: string;
  status: QualityRunStatus;
  contentHash: string;
  error: string | null;
  creditBalanceUsd: number | null;
  createdAt: string;
  completedAt: string | null;
};

type QualityRunRow = {
  id: string;
  creed_id: string;
  user_id: string;
  shared_creed_id: string | null;
  request_key: string;
  content_hash: string;
  status: QualityRunStatus;
  request_sections: unknown;
  target_section_ids: unknown;
  force: boolean;
  error_message: string | null;
  credit_balance_usd: number | string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function adminClient() {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

function asRow(value: unknown): QualityRunRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<QualityRunRow>;
  if (
    typeof row.id !== "string" ||
    typeof row.creed_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.request_key !== "string" ||
    typeof row.content_hash !== "string" ||
    !["queued", "running", "completed", "failed"].includes(row.status ?? "") ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  return row as QualityRunRow;
}

function publicRun(row: QualityRunRow): QualityRunPublic {
  const balance = row.credit_balance_usd;
  return {
    id: row.id,
    status: row.status,
    contentHash: row.content_hash,
    error: row.error_message,
    creditBalanceUsd:
      typeof balance === "number"
        ? balance
        : typeof balance === "string" && balance.trim()
          ? Number(balance)
          : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function parseSections(value: unknown): CreedSection[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  return value as CreedSection[];
}

function parseTargetIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((item): item is string => typeof item === "string");
  return ids.length ? ids : undefined;
}

function userFacingRunError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  if (message === "Add an OpenRouter key in Settings") {
    return "Add an OpenRouter key in Settings.";
  }
  if (message === "Out of credits") return "You are out of credits.";
  if (message === "Could not save quality report.") {
    return "Analysis finished but could not be saved. Try again.";
  }
  return "Analysis failed. Try again.";
}

function requestKey(input: {
  contentHash: string;
  targetSectionIds?: string[];
  force: boolean;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        contentHash: input.contentHash,
        targetSectionIds: [...(input.targetSectionIds ?? [])].sort(),
        force: input.force,
      }),
    )
    .digest("hex");
}

async function findActiveRun(creedId: string, key: string) {
  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .select("*")
    .eq("creed_id", creedId)
    .eq("request_key", key)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return asRow(data);
}

export async function createQualityRun(input: {
  userId: string;
  creedId: string;
  sharedCreedId?: string;
  sections: CreedSection[];
  force: boolean;
  targetSectionIds?: string[];
}) {
  const contentHash = hashCreedSections(input.sections);
  const key = requestKey({
    contentHash,
    targetSectionIds: input.targetSectionIds,
    force: input.force,
  });
  const active = await findActiveRun(input.creedId, key);
  if (active) return publicRun(active);

  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .insert({
      creed_id: input.creedId,
      user_id: input.userId,
      shared_creed_id: input.sharedCreedId ?? null,
      request_key: key,
      content_hash: contentHash,
      request_sections: input.sections,
      target_section_ids: input.targetSectionIds ?? null,
      force: input.force,
    })
    .select("*")
    .single();

  if (error) {
    const concurrent = await findActiveRun(input.creedId, key);
    if (concurrent) return publicRun(concurrent);
    throw new Error(error.message);
  }
  const row = asRow(data);
  if (!row) throw new Error("Could not create analysis run.");
  return publicRun(row);
}

export async function readQualityRun(runId: string) {
  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return asRow(data);
}

export async function readLatestActiveQualityRun(creedId: string) {
  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .select("*")
    .eq("creed_id", creedId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = asRow(data);
  return row ? publicRun(row) : null;
}

export function toPublicQualityRun(row: QualityRunRow) {
  return publicRun(row);
}

export async function requeueStaleQualityRun(row: QualityRunRow) {
  if (row.status !== "running") return row;
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  if (row.updated_at >= staleBefore) return row;
  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .update({ status: "queued", started_at: null, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "running")
    .lt("updated_at", staleBefore)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return asRow(data) ?? row;
}

export async function executeQualityRun(runId: string) {
  const pending = await readQualityRun(runId);
  if (!pending || pending.status !== "queued") return;
  const { data: earlierData, error: earlierError } = await adminClient()
    .from("creed_quality_runs")
    .select("*")
    .eq("creed_id", pending.creed_id)
    .in("status", ["queued", "running"])
    .lt("created_at", pending.created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (earlierError) throw new Error(earlierError.message);
  const earlier = asRow(earlierData);
  if (earlier) {
    const recoverable = await requeueStaleQualityRun(earlier);
    if (recoverable.status === "queued") await executeQualityRun(recoverable.id);
    return;
  }

  const now = new Date().toISOString();
  const { data, error } = await adminClient()
    .from("creed_quality_runs")
    .update({ status: "running", started_at: now, updated_at: now })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = asRow(data);
  if (!row) return;

  const sections = parseSections(row.request_sections);
  if (!sections) {
    await failQualityRun(row.id, "Analysis input could not be read.");
    return;
  }

  try {
    const result = await analyzeCreedQuality({
      client: adminClient(),
      userId: row.user_id,
      creedId: row.creed_id,
      sharedCreedId: row.shared_creed_id ?? undefined,
      sections,
      force: row.force,
      targetSectionIds: parseTargetIds(row.target_section_ids),
    });
    const completedAt = new Date().toISOString();
    const { error: completeError } = await adminClient()
      .from("creed_quality_runs")
      .update({
        status: "completed",
        request_sections: null,
        target_section_ids: null,
        error_message: null,
        credit_balance_usd: result.creditBalanceUsd,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", row.id)
      .eq("status", "running");
    if (completeError) throw new Error(completeError.message);
  } catch (cause) {
    const message = userFacingRunError(cause);
    await failQualityRun(row.id, message);
    log.warn("quality_run_failed", {
      runId: row.id,
      creedId: row.creed_id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

async function failQualityRun(runId: string, message: string) {
  const completedAt = new Date().toISOString();
  const safeMessage = message.trim().slice(0, 240) || "Analysis failed. Try again.";
  const { error } = await adminClient()
    .from("creed_quality_runs")
    .update({
      status: "failed",
      request_sections: null,
      target_section_ids: null,
      error_message: safeMessage,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}
