import "server-only";
import { createHash } from "node:crypto";
import {
  GOALS_SECTION_ID,
  IDENTITY_SECTION_ID,
  PREFERENCES_SECTION_ID,
  ROUTINES_SECTION_ID,
  WORK_SECTION_ID,
  type CreedSection,
} from "@/lib/creed-data";
import { callOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import { deductCredits, resolveAiCredential } from "@/lib/ai/credits";
import {
  buildQualityPrompt,
  buildQualityResponseFormat,
  CREED_QUALITY_RUBRIC_VERSION,
} from "@/lib/ai/quality-rubric";
import { log } from "@/lib/observability";

import type { SupabaseLikeClient } from "@/lib/supabase/types";

// A short headline + a one-sentence detail. The headline shows in the
// collapsed quality popover; the detail expands on demand.
export type QualityNote = { title: string; detail: string };

export type CreedQualityReport = {
  contentHash: string;
  overall: {
    score: number;
    summary: string;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    // Legacy arrays - kept for backwards-compat consumers / fallback when the
    // model returns the previous shape.
    strengths: string[];
    gaps: string[];
    focus: string[];
  };
  sections: Array<{
    sectionId: string;
    sectionName: string;
    score: number;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    reasons: string[];
    strengths: string[];
    gaps: string[];
    missingContext: string[];
    focus: string;
  }>;
  generatedAt: string;
};

// Controlled tag vocabulary. The AI only picks from this set so the UI can
// reliably colour-code every tag. Order matches narrative weight.
export const QUALITY_TAG_VOCAB = {
  green: [
    "Specific",
    "Concrete",
    "Actionable",
    "Durable",
    "Examples",
    "Current",
    "Tight",
  ],
  amber: [
    "Generic",
    "Thin",
    "Surface",
    "Wordy",
    "Drifty",
  ],
  red: [
    "Bloated",
    "Vague",
    "Empty",
    "Context",
    "Stale",
    "Off-topic",
    "No examples",
    "Contradiction",
  ],
} as const;

const ALL_TAGS = new Set<string>([
  ...QUALITY_TAG_VOCAB.green,
  ...QUALITY_TAG_VOCAB.amber,
  ...QUALITY_TAG_VOCAB.red,
]);

const RED_TAGS = new Set<string>(QUALITY_TAG_VOCAB.red);
const AMBER_TAGS = new Set<string>(QUALITY_TAG_VOCAB.amber);

const QUALITY_HASH_IGNORED_KEYS = new Set([
  "lastEditedAt",
  "lastEditedBy",
  "lastEditedLabel",
  "lastEditedType",
  "revision",
]);

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export function hashCreedSections(sections: CreedSection[]) {
  return createHash("sha256")
    .update(JSON.stringify(sections, (key, value) => QUALITY_HASH_IGNORED_KEYS.has(key) ? undefined : value))
    .digest("hex");
}

export function hashCreedSection(section: CreedSection) {
  return createHash("sha256")
    .update(JSON.stringify(section, (key, value) => QUALITY_HASH_IGNORED_KEYS.has(key) ? undefined : value))
    .digest("hex");
}

export function hashCreedSectionsById(sections: CreedSection[]) {
  return Object.fromEntries(sections.map((section) => [section.id, hashCreedSection(section)]));
}

function clampScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

// The visible evidence (the tags, and whether a gap is named) pins the allowed
// score, so the number can never disagree with what the popover shows. A red
// tag means a best practice is broken; an amber tag or a named gap means
// something is still missing; nothing flagged and no gap means the section is
// genuinely complete and must land in the top band.
function evidenceRange(tags: string[], hasGap: boolean): [number, number] {
  const reds = tags.filter((tag) => RED_TAGS.has(tag)).length;
  const ambers = tags.filter((tag) => AMBER_TAGS.has(tag)).length;
  if (reds >= 2) return [0, 61];
  if (reds === 1) return [0, 77];
  if (ambers >= 1 || hasGap) return [0, 89];
  return [90, 100];
}

// Last-resort gap so a sub-90 section always tells the user what is costing it
// points. The rubric requires the model to supply a real, specific gap; this
// only fires if it flagged the section yet named no gap.
function fallbackGapFromTags(tags: string[]): QualityNote | null {
  const flagged = tags.find((tag) => RED_TAGS.has(tag)) ?? tags.find((tag) => AMBER_TAGS.has(tag));
  if (!flagged) {
    return null;
  }
  return {
    title: "Held back",
    detail: `Flagged "${flagged}"; resolve that to lift the score.`,
  };
}

// The five always-on core sections. The overall score is computed from these
// (weighted) rather than asked of the model, so the headline can never drift
// from the section scores underneath it.
const CORE_SECTION_IDS = new Set<string>([
  IDENTITY_SECTION_ID,
  GOALS_SECTION_ID,
  WORK_SECTION_ID,
  PREFERENCES_SECTION_ID,
  ROUTINES_SECTION_ID,
]);

// Deterministic overall score: strong essentials are the floor, good extra
// context is the climb. A flawless core alone tops out around 90; rich,
// well-written non-core sections (optional or custom) lift it toward 100. Weak
// extras never drag the headline, so trying new context is never punished, and
// a hollow core caps the whole file. So 95-100 needs a strong core AND rich
// additional context.
function computeOverallScore(sections: Array<{ sectionId: string; score: number }>) {
  if (!sections.length) {
    return 0;
  }

  const coreScores = sections.filter((section) => CORE_SECTION_IDS.has(section.sectionId)).map((section) => section.score);
  if (!coreScores.length) {
    // No core sections present (unusual): fall back to a plain average.
    return clampScore(sections.reduce((sum, section) => sum + section.score, 0) / sections.length);
  }

  const coreAvg = coreScores.reduce((sum, value) => sum + value, 0) / coreScores.length;
  if (Math.min(...coreScores) < 40) {
    return clampScore(Math.min(coreAvg, 70));
  }

  const base = Math.min(coreAvg, 90);
  const extras = sections.filter((section) => !CORE_SECTION_IDS.has(section.sectionId) && section.score >= 70);
  const lift = Math.min(10, extras.reduce((sum, section) => sum + (section.score - 70) / 30, 0) * 4);
  return clampScore(base + lift);
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);

  return items.length ? items : fallback;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!ALL_TAGS.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 3) break;
  }
  return out;
}

function normalizeNote(value: unknown, fallbackTitle?: string): QualityNote | null {
  // Accept either the new {title, detail} shape, the array fallback (first
  // string with sane heuristics), or null/undefined.
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const detail = typeof obj.detail === "string" ? obj.detail.trim() : "";
    if (title && detail) {
      return {
        title: title.slice(0, 60),
        detail: detail.slice(0, 240),
      };
    }
    if (title) {
      return { title: title.slice(0, 60), detail: title };
    }
    if (detail) {
      return { title: fallbackTitle ?? detail.split(/[.,;:]/)[0].slice(0, 60), detail: detail.slice(0, 240) };
    }
  }

  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    return { title: fallbackTitle ?? text.split(/[.,;:]/)[0].slice(0, 60), detail: text.slice(0, 240) };
  }

  return null;
}

function deriveLegacyNote(items: string[] | undefined, fallbackTitle: string): QualityNote | null {
  if (!items || !items.length) return null;
  const detail = items[0];
  return {
    title: fallbackTitle,
    detail: detail.slice(0, 240),
  };
}

type SectionReport = CreedQualityReport["sections"][number];

// The whole-file qualitative judgment (everything on `overall` except the
// computed score). Shared by the model-parse path and the carry-forward path.
type OverallQualitative = {
  summary: string;
  tags: string[];
  strength: QualityNote | null;
  gap: QualityNote | null;
  strengths: string[];
  gaps: string[];
};

// Normalize one section's raw model/stored payload into a section report.
// `raw === undefined` (a section the model skipped, or one with no stored
// entry) yields a neutral fallback the caller can choose to override with a
// carried-forward score instead of showing a phantom zero.
function normalizeSectionReport(raw: Record<string, unknown> | undefined, section: CreedSection): SectionReport {
  const strengths = normalizeStringArray(raw?.strengths, []).slice(0, 3);
  const gaps = normalizeStringArray(
    raw?.gaps,
    raw?.missingContext ? normalizeStringArray(raw.missingContext, []) : []
  ).slice(0, 3);

  const tags = normalizeTags(raw?.tags);
  const strength = normalizeNote(raw?.strength) ?? deriveLegacyNote(strengths, "Worth keeping");
  let gap = normalizeNote(raw?.gap) ?? deriveLegacyNote(gaps, "Needs work");

  // The evidence decides the band; the model's number only places it within.
  const [lo, hi] = evidenceRange(tags, gap !== null);
  const score = Math.max(lo, Math.min(hi, clampScore(raw?.score ?? 0)));

  // Gap is mandatory below 90. If the model flagged the section but named no
  // gap, surface one from the flag so the popover always explains the score.
  if (!gap && score < 90) {
    gap = fallbackGapFromTags(tags);
  }

  return {
    sectionId: section.id,
    sectionName: section.name,
    score,
    tags,
    strength,
    gap,
    reasons: normalizeStringArray(raw?.reasons, ["Needs a clearer signal that helps future AI know you."]).slice(0, 3),
    strengths,
    gaps,
    missingContext: normalizeStringArray(raw?.missingContext, []).slice(0, 3),
    focus:
      typeof raw?.focus === "string" && raw.focus.trim()
        ? raw.focus.trim()
        : "Make this section more specific, current, and grounded in concrete details about you.",
  };
}

function parseOverallQualitative(value: unknown): OverallQualitative {
  const overall = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strengths = normalizeStringArray(overall.strengths, []).slice(0, 4);
  const gaps = normalizeStringArray(overall.gaps, []).slice(0, 4);

  return {
    summary:
      typeof overall.summary === "string" && overall.summary.trim()
        ? overall.summary.trim()
        : "The profile has useful structure but needs sharper, more specific personal context.",
    tags: normalizeTags(overall.tags),
    strength: normalizeNote(overall.strength) ?? deriveLegacyNote(strengths, "Working well"),
    gap: normalizeNote(overall.gap) ?? deriveLegacyNote(gaps, "Biggest gap"),
    strengths,
    gaps,
  };
}

// Build the final report from freshly graded sections, carrying forward prior
// section reports for anything not graded this run, and computing the overall
// score deterministically so it always agrees with its sections.
function assembleReport({
  sections,
  gradedById,
  priorById,
  overall,
  contentHash,
}: {
  sections: CreedSection[];
  gradedById: Map<string, SectionReport>;
  priorById: Map<string, SectionReport>;
  overall: OverallQualitative;
  contentHash: string;
}): CreedQualityReport {
  const sectionReports = sections.map(
    (section) =>
      gradedById.get(section.id) ?? priorById.get(section.id) ?? normalizeSectionReport(undefined, section)
  );

  return {
    contentHash,
    overall: {
      score: computeOverallScore(sectionReports),
      summary: overall.summary,
      tags: overall.tags,
      strength: overall.strength,
      gap: overall.gap,
      strengths: overall.strengths,
      gaps: overall.gaps,
      focus: overall.gap ? [overall.gap.detail] : [],
    },
    sections: sectionReports,
    generatedAt: new Date().toISOString(),
  };
}

// Validate a stored (full-shape) report against the current sections. Used when
// reading a persisted report (cache hit, baseline read, the MCP read path). The
// model-response path uses `normalizeSectionReport` + `assembleReport` instead.
export function validateQualityReport(value: unknown, sections: CreedSection[], contentHash: string): CreedQualityReport {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawOverall = root.overall && typeof root.overall === "object" ? (root.overall as Record<string, unknown>) : {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];

  const sectionReports = sections.map((section) =>
    normalizeSectionReport(findRawSection(rawSections, section.id), section)
  );
  const overall = parseOverallQualitative(rawOverall);

  return {
    contentHash,
    overall: {
      // Always recomputed from the sections (which are themselves re-clamped to
      // the evidence ladder), so the headline can never drift from its sections,
      // even when reading an older stored report.
      score: computeOverallScore(sectionReports),
      summary: overall.summary,
      tags: overall.tags,
      strength: overall.strength,
      gap: overall.gap,
      strengths: overall.strengths,
      gaps: overall.gaps,
      focus: normalizeStringArray(rawOverall.focus, overall.gap ? [overall.gap.detail] : []).slice(0, 5),
    },
    sections: sectionReports,
    generatedAt: new Date().toISOString(),
  };
}

function findRawSection(rawSections: unknown[], sectionId: string) {
  return rawSections.find(
    (item) => item && typeof item === "object" && (item as Record<string, unknown>).sectionId === sectionId
  ) as Record<string, unknown> | undefined;
}

function overallQualitativeFromReport(report: CreedQualityReport): OverallQualitative {
  return {
    summary: report.overall.summary,
    tags: report.overall.tags,
    strength: report.overall.strength,
    gap: report.overall.gap,
    strengths: report.overall.strengths,
    gaps: report.overall.gaps,
  };
}

async function readCachedReport(client: unknown, userId: string, contentHash: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_quality_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  assertNoError(error, "Could not load quality report.");
  return data as {
    section_hashes?: Record<string, string>;
    report?: CreedQualityReport & { sectionHashes?: Record<string, string> };
  } | null;
}

export async function readLatestQualityReport(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_quality_reports")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  assertNoError(error, "Could not load quality report.");
  return data as {
    content_hash?: string;
    model_id?: string;
    section_hashes?: unknown;
    report?: unknown;
    updated_at?: string;
  } | null;
}

function normalizeSectionHashes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function readStoredSectionHashes(row: { section_hashes?: unknown; report?: unknown } | null | undefined) {
  const columnHashes = normalizeSectionHashes(row?.section_hashes);
  if (Object.keys(columnHashes).length) {
    return columnHashes;
  }

  if (!row?.report || typeof row.report !== "object") {
    return {};
  }

  return normalizeSectionHashes((row.report as { sectionHashes?: unknown }).sectionHashes);
}

export async function readQualityBaseline({
  client,
  userId,
  sections,
}: {
  client: unknown;
  userId: string;
  sections: CreedSection[];
}) {
  const contentHash = hashCreedSections(sections);
  const sectionHashes = hashCreedSectionsById(sections);
  const latest = await readLatestQualityReport(client, userId);
  if (!latest?.report) {
    return {
      report: null,
      contentHash,
      sectionHashes,
      storedContentHash: null,
      storedSectionHashes: {},
      current: false,
    };
  }

  return {
    report: validateQualityReport(latest.report, sections, latest.content_hash || contentHash),
    contentHash,
    sectionHashes,
    storedContentHash: latest.content_hash ?? null,
    storedSectionHashes: readStoredSectionHashes(latest),
    current: latest.content_hash === contentHash,
  };
}

// Best-effort persist of the single per-user report row. The client already
// has the report in the response, so a write hiccup must never fail (or
// raw-toast) the analysis.
async function persistQualityReport({
  client,
  userId,
  reportWithHashes,
  contentHash,
  sectionHashes,
  modelId,
}: {
  client: unknown;
  userId: string;
  reportWithHashes: CreedQualityReport & { sectionHashes: Record<string, string>; rubricVersion: string };
  contentHash: string;
  sectionHashes: Record<string, string>;
  modelId: string;
}) {
  try {
    const now = new Date().toISOString();
    const db = client as SupabaseLikeClient;
    const { error } = await db.from("creed_quality_reports").upsert(
      {
        user_id: userId,
        content_hash: contentHash,
        section_hashes: sectionHashes,
        model_id: modelId,
        report: reportWithHashes,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    assertNoError(error, "Could not save quality report.");
  } catch (cause) {
    log.warn("quality_report_persist_failed", {
      userId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

// Analyze quality with one whole-file pass that is the single source of truth.
// The model always sees the full profile (so cross-section judgment holds), but
// only re-scores the sections that changed since the last analysis (or the
// explicit `targetSectionIds`); unchanged sections carry their prior score
// forward, and the overall score is computed deterministically from the result.
export async function analyzeCreedQuality({
  client,
  userId,
  sections: allSections,
  force = false,
  targetSectionIds,
}: {
  client: unknown;
  userId: string;
  sections: CreedSection[];
  force?: boolean;
  targetSectionIds?: string[];
}) {
  // Archived sections are not part of the live file, so they are excluded from
  // scoring entirely (hashing, targets, prompt, and report all see live only).
  const sections = allSections.filter((section) => !section.archived);
  const contentHash = hashCreedSections(sections);
  const sectionHashes = hashCreedSectionsById(sections);

  if (!force) {
    const cached = await readCachedReport(client, userId, contentHash);
    if (cached?.report) {
      const storedHashes = readStoredSectionHashes(cached);
      return {
        report: cached.report,
        contentHash,
        sectionHashes: Object.keys(storedHashes).length ? storedHashes : sectionHashes,
        cached: true,
        creditBalanceUsd: null,
      };
    }
  }

  // Load the prior report so unchanged sections can carry their score forward.
  const latest = await readLatestQualityReport(client, userId);
  const priorReport = latest?.report
    ? validateQualityReport(latest.report, sections, latest.content_hash || contentHash)
    : null;
  const priorSectionHashes = readStoredSectionHashes(latest);
  const priorById = new Map(priorReport?.sections.map((section) => [section.sectionId, section]) ?? []);

  // When the rubric version changes, the carried-forward scores were produced by
  // a different scoring method, so regrade the whole file once to bring it onto
  // the new rubric instead of mixing old and new numbers.
  const storedRubricVersion = (latest?.report as { rubricVersion?: string } | null | undefined)?.rubricVersion;
  const rubricStale = Boolean(priorReport) && storedRubricVersion !== CREED_QUALITY_RUBRIC_VERSION;

  // Decide which sections to (re)grade. With no prior report (or a stale rubric)
  // we grade them all; otherwise the caller's explicit targets, falling back to
  // whatever drifted.
  const sectionIds = sections.map((section) => section.id);
  const requested = targetSectionIds?.filter((id) => sectionIds.includes(id));
  const targets = !priorReport || rubricStale
    ? sectionIds
    : requested && requested.length
      ? requested
      : sections
          .filter((section) => priorSectionHashes[section.id] !== sectionHashes[section.id] || !priorById.has(section.id))
          .map((section) => section.id);

  // Nothing drifted: recompute the deterministic overall over the carried
  // forward sections and return without a model call or a charge.
  if (targets.length === 0 && priorReport) {
    const report = assembleReport({
      sections,
      gradedById: new Map(),
      priorById,
      overall: overallQualitativeFromReport(priorReport),
      contentHash,
    });
    const reportWithHashes = { ...report, sectionHashes, rubricVersion: CREED_QUALITY_RUBRIC_VERSION };
    if (latest?.content_hash !== contentHash) {
      await persistQualityReport({
        client,
        userId,
        reportWithHashes,
        contentHash,
        sectionHashes,
        modelId: latest?.model_id ?? "carry-forward",
      });
    }
    return { report: reportWithHashes, contentHash, sectionHashes, cached: false, creditBalanceUsd: null };
  }

  const credential = await resolveAiCredential(client, userId, "analysis");
  const result = await callOpenRouter({
    apiKey: credential.apiKey,
    modelId: credential.modelId,
    // The schema-valid reply is compact (scores + short notes for the targeted
    // sections), so this ceiling is generous headroom, not a target.
    maxTokens: 8000,
    // Zero temperature so the same content earns the same score run to run.
    temperature: 0,
    // GPT-class reasoning over a full Creed can take 60-150s; the default 90s
    // abort surfaces mid-stream as "empty response". The route allows 300s.
    timeoutMs: 240000,
    responseFormat: buildQualityResponseFormat(),
    messages: [
      {
        role: "system",
        content: `Score how well this Creed (a personal context profile every AI reads before talking to its owner) lets a fresh AI know the user. Use rubric ${CREED_QUALITY_RUBRIC_VERSION}. Be strict, specific, and consistent. Judge how complete, accurate, current, and concrete the profile is - not how it would help engineering. Return valid JSON only.`,
      },
      {
        role: "user",
        content: buildQualityPrompt(sections, targets),
      },
    ],
  });

  // Parse the model output first. A truncated or malformed response throws
  // here, before any charge, so the user is never billed for an analysis that
  // produced no usable report. Surface a clean message, not the raw JSON error.
  let parsed: unknown;
  try {
    parsed = parseJsonObject(result.content);
  } catch {
    throw new Error("Analysis failed. Try again");
  }

  const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  const targetSet = new Set(targets);
  // Only adopt fresh scores for the sections we asked for; anything the model
  // skipped is left out of `gradedById` so `assembleReport` carries the prior
  // score forward instead of emitting a phantom zero.
  const gradedById = new Map<string, SectionReport>();
  for (const section of sections) {
    if (!targetSet.has(section.id)) {
      continue;
    }
    const raw = findRawSection(rawSections, section.id);
    if (raw) {
      gradedById.set(section.id, normalizeSectionReport(raw, section));
    }
  }

  const report = assembleReport({
    sections,
    gradedById,
    priorById,
    overall: parseOverallQualitative(root.overall),
    contentHash,
  });
  const reportWithHashes = { ...report, sectionHashes, rubricVersion: CREED_QUALITY_RUBRIC_VERSION };

  // Now that we have a valid report, bill prepaid credits - before the report /
  // usage writes so a later DB hiccup can't skip the charge. No-op for BYOK.
  let creditBalanceUsd: number | null = null;
  let chargedMicroUsd: number | null = null;
  if (credential.mode === "credits") {
    const debit = await deductCredits({
      userId,
      costUsd: result.costUsd,
      feature: "analysis",
      modelId: credential.modelId,
    });
    if (debit) {
      creditBalanceUsd = debit.balanceUsd;
      chargedMicroUsd = debit.chargedMicroUsd;
    }
  }

  await persistQualityReport({
    client,
    userId,
    reportWithHashes,
    contentHash,
    sectionHashes,
    modelId: credential.modelId,
  });

  // Record usage only when the charge actually landed: BYOK never charges, and
  // in credits mode a non-null balance means the debit succeeded. This keeps the
  // spend chart consistent with the balance (no phantom cost if the debit failed).
  if (credential.mode === "byok" || creditBalanceUsd !== null) {
    try {
      await recordAiUsage({
        client,
        userId,
        feature: "analysis",
        modelId: credential.modelId,
        modelQuality: result.modelQuality,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        // Credits mode charges the marked-up amount the debit returned; BYOK is
        // at-cost (the user paid their own key).
        chargedMicroUsd: chargedMicroUsd ?? Math.round(result.costUsd * 1_000_000),
        aiMode: credential.mode,
      });
    } catch {
      // Usage logging is best-effort; a completed, charged analysis must not
      // fail just because the spend-chart insert hiccupped.
    }
  }

  return { report: reportWithHashes, contentHash, sectionHashes, cached: false, creditBalanceUsd };
}
