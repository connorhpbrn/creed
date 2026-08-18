import "server-only";
import { createHash } from "node:crypto";
import {
  GOALS_SECTION_ID,
  IDENTITY_SECTION_ID,
  PREFERENCES_SECTION_ID,
  ROUTINES_SECTION_ID,
  WORK_SECTION_ID,
  type CreedSection,
} from "@creed/core/creed-data";
import { callOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import {
  deductCredits,
  deductSharedCredits,
  resolveAiCredential,
  resolveSharedAiCredential,
  cancelCreditReservation,
} from "@creed/edition/ai";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import {
  buildQualityPrompt,
  buildQualityResponseFormat,
  CREED_QUALITY_RUBRIC_VERSION,
  qualitySubject,
  type QualityScope,
} from "@/lib/ai/quality-rubric";
import {
  QUALITY_FINGERPRINT_VERSION,
  qualitySectionFingerprintInput,
} from "@/lib/ai/quality-fingerprint";
import type {
  AnalysisGuidance,
  AnalysisGuidanceType,
  CreedQualityReport,
  QualityNote,
} from "@/lib/ai/quality-types";

import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

export type { AnalysisGuidance, CreedQualityReport, QualityNote } from "@/lib/ai/quality-types";

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
const GREEN_TAGS = new Set<string>(QUALITY_TAG_VOCAB.green);
const GUIDANCE_TYPES = new Set<AnalysisGuidanceType>(["edit", "ask", "remove", "move", "review"]);

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export function hashCreedSections(sections: CreedSection[]) {
  return createHash("sha256")
    .update(JSON.stringify(sections.map(qualitySectionFingerprintInput)))
    .digest("hex");
}

export function hashCreedSection(section: CreedSection) {
  return createHash("sha256")
    .update(JSON.stringify(qualitySectionFingerprintInput(section)))
    .digest("hex");
}

export function hashCreedSectionsById(sections: CreedSection[]) {
  return Object.fromEntries(sections.map((section) => [section.id, hashCreedSection(section)]));
}

const LEGACY_QUALITY_HASH_IGNORED_KEYS = new Set([
  "lastEditedAt",
  "lastEditedBy",
  "lastEditedLabel",
  "lastEditedType",
  "revision",
]);

function legacyQualityHash(value: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (key, nestedValue) =>
        LEGACY_QUALITY_HASH_IGNORED_KEYS.has(key) ? undefined : nestedValue,
      ),
    )
    .digest("hex");
}

export function storedQualitySectionIsFresh({
  storedHash,
  section,
}: {
  storedHash: string | undefined;
  section: CreedSection;
}) {
  if (!storedHash) return false;
  return (
    storedHash === hashCreedSection(section) ||
    storedHash === legacyQualityHash(section)
  );
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
// something is still missing. Clean evidence does not raise a low model score;
// it only leaves the model's chosen band intact.
function evidenceRange(tags: string[], hasGap: boolean): [number, number] {
  const reds = tags.filter((tag) => RED_TAGS.has(tag)).length;
  const ambers = tags.filter((tag) => AMBER_TAGS.has(tag)).length;
  if (reds >= 3) return [0, 61];
  if (reds === 2) return [0, 77];
  if (reds === 1) return [0, 89];
  if (ambers >= 1 || hasGap) return [0, 89];
  return [0, 100];
}

function tagsForScore(tags: string[], score: number) {
  if (score >= 90) {
    return tags.filter((tag) => !RED_TAGS.has(tag) && !AMBER_TAGS.has(tag));
  }
  return tags;
}

function reconcileOverallEvidence(
  computedScore: number,
  overall: Pick<OverallQualitative, "tags" | "gap" | "guidance">,
) {
  let gap = overall.gap;
  const [, initialEvidenceCeiling] = evidenceRange(
    overall.tags,
    gap !== null || overall.guidance !== null,
  );
  let score = Math.min(clampScore(computedScore), initialEvidenceCeiling);
  if (!gap && score < 90) {
    gap = fallbackGapFromTags(overall.tags) ?? {
      title: "Score needs evidence",
      detail: "The overall score is below 90, but the analysis did not identify the specific issue holding it back.",
    };
  }
  const linkedEvidence = linkEvidenceTags(overall.tags, null, gap);
  const [, finalEvidenceCeiling] = evidenceRange(
    linkedEvidence.tags,
    gap !== null || overall.guidance !== null,
  );
  score = Math.min(score, finalEvidenceCeiling);
  return { score, tags: tagsForScore(linkedEvidence.tags, score), gap };
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

function normalizeNote(
  value: unknown,
  fallbackTitle?: string,
  allowedTags?: ReadonlySet<string>,
): QualityNote | null {
  // Accept either the new {title, detail} shape, the array fallback (first
  // string with sane heuristics), or null/undefined.
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const detail = typeof obj.detail === "string" ? obj.detail.trim() : "";
    const tag =
      typeof obj.tag === "string" && (!allowedTags || allowedTags.has(obj.tag))
        ? obj.tag
        : undefined;
    if (title && detail) {
      return {
        title: title.slice(0, 60),
        detail: detail.slice(0, 240),
        ...(tag ? { tag } : {}),
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

function inferGapTag(note: QualityNote): string {
  const text = `${note.title} ${note.detail}`.toLowerCase();
  if (/contradict|conflict|inconsistent/.test(text)) return "Contradiction";
  if (/stale|outdated|date|no longer current/.test(text)) return "Stale";
  if (/duplicate|repeat|redundan|bloat/.test(text)) return "Bloated";
  if (/wordy|verbose|long-winded/.test(text)) return "Bloated";
  if (/example|evidence|proof/.test(text)) return "No examples";
  if (/off-topic|misplaced|wrong section|move/.test(text)) return "Off-topic";
  if (/empty|placeholder/.test(text)) return "Empty";
  if (/vague|broad|generic|unclear|abstract/.test(text)) return "Vague";
  return "Context";
}

function linkEvidenceTags(
  rawTags: string[],
  strength: QualityNote | null,
  gap: QualityNote | null,
) {
  const strengthTag =
    strength?.tag ?? rawTags.find((tag) => GREEN_TAGS.has(tag));
  const gapTag = gap?.tag ?? (gap ? inferGapTag(gap) : undefined);
  const linkedStrength =
    strength && strengthTag ? { ...strength, tag: strengthTag } : strength;
  const linkedGap = gap && gapTag ? { ...gap, tag: gapTag } : gap;
  const tags = normalizeTags([
    ...(strengthTag ? [strengthTag] : []),
    ...(gapTag ? [gapTag] : []),
    ...rawTags,
  ]);
  return { strength: linkedStrength, gap: linkedGap, tags };
}

function deriveLegacyNote(items: string[] | undefined, fallbackTitle: string): QualityNote | null {
  if (!items || !items.length) return null;
  const detail = items[0];
  return {
    title: fallbackTitle,
    detail: detail.slice(0, 240),
  };
}

function normalizeGuidance({
  value,
  legacyFocus,
  fallbackGap,
  sectionIds,
  fallbackSectionIds,
}: {
  value: unknown;
  legacyFocus?: unknown;
  fallbackGap?: QualityNote | null;
  sectionIds: Set<string>;
  fallbackSectionIds: string[];
}): AnalysisGuidance | null {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const rawTitle = typeof raw?.title === "string" ? raw.title.trim() : "";
  const rawDetail = typeof raw?.detail === "string" ? raw.detail.trim() : "";
  const legacyItems = Array.isArray(legacyFocus)
    ? normalizeStringArray(legacyFocus, [])
    : typeof legacyFocus === "string" && legacyFocus.trim()
      ? [legacyFocus.trim()]
      : [];
  const detail = rawDetail || legacyItems[0] || fallbackGap?.detail || "";
  if (!detail) return null;
  const rawType = raw?.type;
  const type = typeof rawType === "string" && GUIDANCE_TYPES.has(rawType as AnalysisGuidanceType)
    ? rawType as AnalysisGuidanceType
    : legacyItems.length > 0
      ? "edit"
      : "review";

  const requestedTargets = normalizeStringArray(raw?.targetSectionIds, [])
    .filter((sectionId) => sectionIds.has(sectionId));
  const targetSectionIds = requestedTargets.length
    ? requestedTargets
    : fallbackSectionIds.filter((sectionId) => sectionIds.has(sectionId));
  const requiresUserInput = type === "ask" || type === "review";

  return {
    type,
    title: (rawTitle || fallbackGap?.title || "Improve this section").slice(0, 60),
    detail: detail.slice(0, 240),
    targetSectionIds,
    requiresUserInput,
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
  guidance: AnalysisGuidance | null;
  strengths: string[];
  gaps: string[];
};

// Normalize one section's raw model/stored payload into a section report.
// `raw === undefined` (a section the model skipped, or one with no stored
// entry) yields a neutral fallback the caller can choose to override with a
// carried-forward score instead of showing a phantom zero.
function normalizeSectionReport(
  raw: Record<string, unknown> | undefined,
  section: CreedSection,
  sectionIds: Set<string>,
): SectionReport {
  const strengths = normalizeStringArray(raw?.strengths, []).slice(0, 3);
  const gaps = normalizeStringArray(
    raw?.gaps,
    raw?.missingContext ? normalizeStringArray(raw.missingContext, []) : []
  ).slice(0, 3);

  const rawTags = normalizeTags(raw?.tags);
  let strength =
    normalizeNote(raw?.strength, undefined, GREEN_TAGS) ??
    deriveLegacyNote(strengths, "Worth keeping");
  let gap =
    normalizeNote(raw?.gap, undefined, RED_TAGS) ??
    deriveLegacyNote(gaps, "Needs work");
  let guidance = normalizeGuidance({
    value: raw?.guidance,
    legacyFocus: raw?.focus,
    fallbackGap: gap,
    sectionIds,
    fallbackSectionIds: [section.id],
  });

  // Negative evidence caps the band; clean evidence leaves the model's chosen
  // score intact rather than upgrading an unexplained low score.
  const linkedEvidence = linkEvidenceTags(rawTags, strength, gap);
  strength = linkedEvidence.strength;
  gap = linkedEvidence.gap;
  const [lo, hi] = evidenceRange(
    linkedEvidence.tags,
    gap !== null || guidance !== null,
  );
  const score = Math.max(lo, Math.min(hi, clampScore(raw?.score ?? 0)));
  let tags = tagsForScore(linkedEvidence.tags, score);
  // Gap is mandatory below 90. If the model flagged the section but named no
  // gap, surface one from the flag so the popover always explains the score.
  if (!gap && score < 90) {
    gap = fallbackGapFromTags(tags) ?? {
      title: "Score needs evidence",
      detail: "The score is below 90, but the analysis did not identify the specific issue holding it back.",
    };
  }
  const finalEvidence = linkEvidenceTags(tags, strength, gap);
  strength = finalEvidence.strength;
  gap = finalEvidence.gap;
  tags = finalEvidence.tags;
  guidance ??= normalizeGuidance({
    value: raw?.guidance,
    legacyFocus: raw?.focus,
    fallbackGap: gap,
    sectionIds,
    fallbackSectionIds: [section.id],
  });

  return {
    sectionId: section.id,
    sectionName: section.name,
    score,
    tags,
    strength,
    gap,
    guidance,
    reasons: normalizeStringArray(raw?.reasons, ["Needs a clearer signal that helps future AI know you."]).slice(0, 3),
    strengths,
    gaps,
    missingContext: normalizeStringArray(raw?.missingContext, []).slice(0, 3),
    focus: guidance?.detail ?? "",
  };
}

function parseOverallQualitative(value: unknown, sectionIds: Set<string>): OverallQualitative {
  const overall = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strengths = normalizeStringArray(overall.strengths, []).slice(0, 4);
  const gaps = normalizeStringArray(overall.gaps, []).slice(0, 4);

  let strength =
    normalizeNote(overall.strength, undefined, GREEN_TAGS) ??
    deriveLegacyNote(strengths, "Working well");
  let gap =
    normalizeNote(overall.gap, undefined, RED_TAGS) ??
    deriveLegacyNote(gaps, "Biggest gap");
  const linkedEvidence = linkEvidenceTags(
    normalizeTags(overall.tags),
    strength,
    gap,
  );
  strength = linkedEvidence.strength;
  gap = linkedEvidence.gap;
  return {
    summary:
      typeof overall.summary === "string" && overall.summary.trim()
        ? overall.summary.trim()
        : "The profile has useful structure but needs sharper, more specific personal context.",
    tags: linkedEvidence.tags,
    strength,
    gap,
    guidance: normalizeGuidance({
      value: overall.guidance,
      legacyFocus: overall.focus,
      fallbackGap: gap,
      sectionIds,
      fallbackSectionIds: [],
    }),
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
  const sectionIds = new Set(sections.map((section) => section.id));
  const sectionReports = sections.map(
    (section) =>
      gradedById.get(section.id) ?? priorById.get(section.id) ?? normalizeSectionReport(undefined, section, sectionIds)
  );
  const overallEvidence = reconcileOverallEvidence(
    computeOverallScore(sectionReports),
    overall,
  );

  return {
    contentHash,
    overall: {
      score: overallEvidence.score,
      summary: overall.summary,
      tags: overallEvidence.tags,
      strength: overall.strength,
      gap: overallEvidence.gap,
      guidance: overall.guidance,
      strengths: overall.strengths,
      gaps: overall.gaps,
      focus: overall.guidance ? [overall.guidance.detail] : [],
    },
    sections: sectionReports,
    generatedAt: new Date().toISOString(),
  };
}

// Validate a stored (full-shape) report against the current sections. Used when
// reading a persisted report (cache hit, baseline read, the MCP read path). The
// model-response path uses `normalizeSectionReport` + `assembleReport` instead.
export function validateQualityReport(
  value: unknown,
  sections: CreedSection[],
  contentHash: string,
  // A shared report is one shared report, generated over ALL sections and keyed
  // by creed_id, but each member reads it scoped to the sections they can see.
  // For a shared read we must show the SAME thing to everyone: the stored shared
  // overall score (not one recomputed over the reader's visible subset, which
  // would differ per member) and the full shared narrative (score + tags +
  // strengths + gaps), so a member sees the identical headline and description as
  // the owner. Personal reads (sharedRead=false) recompute the score from the
  // owner's own sections, which they always see in full - byte-identical to before.
  sharedRead = false,
  analyzedAt?: string,
): CreedQualityReport {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawOverall = root.overall && typeof root.overall === "object" ? (root.overall as Record<string, unknown>) : {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];

  const sectionIds = new Set(sections.map((section) => section.id));
  const sectionReports = sections.map((section) =>
    normalizeSectionReport(findRawSection(rawSections, section.id), section, sectionIds)
  );
  const overall = parseOverallQualitative(rawOverall, sectionIds);

  // The shared score written by the run/merge path (computeOverallScore over the
  // full file). Used verbatim for shared reads so every member sees one true
  // number; falls back to a recompute if an old row has no stored score.
  const storedScore =
    typeof rawOverall.score === "number" && Number.isFinite(rawOverall.score)
      ? rawOverall.score
      : null;
  const overallEvidence = reconcileOverallEvidence(
    sharedRead && storedScore !== null ? storedScore : computeOverallScore(sectionReports),
    overall,
  );

  return {
    contentHash,
    overall: {
      score: overallEvidence.score,
      summary: overall.summary,
      tags: overallEvidence.tags,
      strength: overall.strength,
      gap: overallEvidence.gap,
      guidance: overall.guidance,
      strengths: overall.strengths,
      gaps: overall.gaps,
      focus: overall.guidance ? [overall.guidance.detail] : [],
    },
    sections: sectionReports,
    generatedAt:
      analyzedAt ??
      (typeof root.generatedAt === "string" && root.generatedAt.trim()
        ? root.generatedAt
        : new Date().toISOString()),
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
    guidance: report.overall.guidance,
    strengths: report.overall.strengths,
    gaps: report.overall.gaps,
  };
}

// A shared report is shared and keyed by creed_id; a personal report is the
// per-user row keyed by user_id. When creedId is set, reads/writes go by
// creed_id (so every member sees the one shared report); otherwise the personal
// path is byte-identical to before.
async function readCachedReport(
  client: unknown,
  userId: string,
  contentHash: string,
  creedId?: string
) {
  const db = client as SupabaseLikeClient;
  let query = db.from("creed_quality_reports").select("*").eq("content_hash", contentHash);
  query = creedId ? query.eq("creed_id", creedId) : query.eq("user_id", userId);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();

  assertNoError(error, "Could not load quality report.");
  return data as {
    section_hashes?: Record<string, string>;
    report?: CreedQualityReport & { sectionHashes?: Record<string, string> };
  } | null;
}

export async function readLatestQualityReport(client: unknown, userId: string, creedId?: string) {
  const db = client as SupabaseLikeClient;
  let query = db.from("creed_quality_reports").select("*");
  query = creedId ? query.eq("creed_id", creedId) : query.eq("user_id", userId);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
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
  creedId,
  sections,
  sharedRead = false,
}: {
  client: unknown;
  userId: string;
  // The report key (personal creed or Shared Creed). Always set.
  creedId: string;
  sections: CreedSection[];
  // True for shared reads: show the shared stored overall score + full narrative
  // to every member, not a per-viewer recompute (see validateQualityReport).
  sharedRead?: boolean;
}) {
  const contentHash = hashCreedSections(sections);
  const sectionHashes = hashCreedSectionsById(sections);
  const latest = await readLatestQualityReport(client, userId, creedId);
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

  const storedSectionHashes = readStoredSectionHashes(latest);
  const compatibleStoredSectionHashes = Object.fromEntries(
    sections.flatMap((section) =>
      storedQualitySectionIsFresh({
        storedHash: storedSectionHashes[section.id],
        section,
      })
        ? [[section.id, sectionHashes[section.id]]]
        : storedSectionHashes[section.id]
          ? [[section.id, storedSectionHashes[section.id]]]
          : [],
    ),
  );
  const current =
    latest.content_hash === contentHash ||
    latest.content_hash === legacyQualityHash(sections);

  return {
    report: validateQualityReport(
      latest.report,
      sections,
      latest.content_hash || contentHash,
      sharedRead,
      latest.updated_at,
    ),
    contentHash,
    sectionHashes,
    storedContentHash: latest.content_hash ?? null,
    storedSectionHashes: compatibleStoredSectionHashes,
    current,
  };
}

type StoredReport = CreedQualityReport & { rubricVersion?: string };
type ReportWithHashes = CreedQualityReport & {
  sectionHashes: Record<string, string>;
  rubricVersion: string;
  fingerprintVersion: number;
};

// Merge a freshly-graded (possibly partial) shared report into the stored
// shared report so a run never drops sections the runner couldn't see. The
// fresh report's section entries win; every other stored section carries
// forward untouched. A run whose fresh report covers every stored section (an
// owner/admin whole-file run) fully replaces the overall narrative; a partial
// (member) run keeps the stored narrative and just refreshes the score. The
// stored full-file content hash is preserved on a partial run - a re-grade does
// not change the file, so "is this report current?" stays keyed to the last
// whole-file analysis.
function mergeSharedReport(
  stored: StoredReport | null,
  fresh: ReportWithHashes,
  storedSectionHashes: Record<string, string> | null,
  freshSectionHashes: Record<string, string>,
  storedContentHash: string | null,
  freshContentHash: string,
): { report: ReportWithHashes; sectionHashes: Record<string, string>; contentHash: string } {
  if (!stored?.sections?.length) {
    return { report: fresh, sectionHashes: freshSectionHashes, contentHash: freshContentHash };
  }
  const bySectionId = new Map(stored.sections.map((section) => [section.sectionId, section]));
  for (const section of fresh.sections) bySectionId.set(section.sectionId, section);
  const mergedSections = [...bySectionId.values()];

  const freshIds = new Set(fresh.sections.map((section) => section.sectionId));
  const freshCoversStored = stored.sections.every((section) => freshIds.has(section.sectionId));
  const overall = freshCoversStored ? fresh.overall : stored.overall;
  const contentHash = freshCoversStored ? freshContentHash : storedContentHash ?? freshContentHash;
  const overallEvidence = reconcileOverallEvidence(
    computeOverallScore(mergedSections),
    overall,
  );

  const report: ReportWithHashes = {
    ...fresh,
    contentHash,
    overall: {
      ...overall,
      score: overallEvidence.score,
      tags: overallEvidence.tags,
    },
    sections: mergedSections,
  };
  return {
    report,
    sectionHashes: { ...(storedSectionHashes ?? {}), ...freshSectionHashes },
    contentHash,
  };
}

// Completion is only valid after this service-role write succeeds. The run
// remains failed when persistence fails, so another tab never observes a
// transient client-only report as completed.
async function persistQualityReport({
  userId,
  creedId,
  mergeShared = false,
  reportWithHashes,
  contentHash,
  sectionHashes,
  modelId,
}: {
  userId: string;
  creedId: string;
  mergeShared?: boolean;
  reportWithHashes: ReportWithHashes;
  contentHash: string;
  sectionHashes: Record<string, string>;
  modelId: string;
}) {
  const now = new Date().toISOString();
  const db = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  let report: ReportWithHashes = reportWithHashes;
  let hashes = sectionHashes;
  let hash = contentHash;
  if (mergeShared) {
    const { data: stored } = (await db
      .from("creed_quality_reports")
      .select("report, content_hash, section_hashes")
      .eq("creed_id", creedId)
      .maybeSingle()) as {
      data: { report?: StoredReport; content_hash?: string; section_hashes?: Record<string, string> } | null;
    };
    const merged = mergeSharedReport(
      stored?.report ?? null,
      reportWithHashes,
      stored?.section_hashes ?? null,
      sectionHashes,
      stored?.content_hash ?? null,
      contentHash,
    );
    report = merged.report;
    hashes = merged.sectionHashes;
    hash = merged.contentHash;
  }

  const { error } = await db.from("creed_quality_reports").upsert(
    {
      user_id: userId,
      creed_id: creedId,
      content_hash: hash,
      section_hashes: hashes,
      model_id: modelId,
      report,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "creed_id" },
  );
  assertNoError(error, "Could not save quality report.");
}

// Analyze quality with one whole-file pass that is the single source of truth.
// The model always sees the full profile (so cross-section judgment holds), but
// only re-scores the sections that changed since the last analysis (or the
// explicit `targetSectionIds`); unchanged sections carry their prior score
// forward, and the overall score is computed deterministically from the result.
export async function analyzeCreedQuality({
  client,
  userId,
  creedId,
  sharedCreedId,
  allowedTargetIds,
  sections: allSections,
  force = false,
  targetSectionIds,
}: {
  client: unknown;
  userId: string;
  // The report key. Every report (personal or shared) is keyed by creed_id: a
  // personal report by the owner's personal creed, a shared report by the
  // Shared Creed (so every member sees the one report).
  creedId: string;
  // Set only for a shared analysis: bill the shared wallet and use the shared
  // credential, attributed to userId (the owner/admin who ran it). Unset for a
  // personal analysis, which bills the personal wallet exactly as before.
  sharedCreedId?: string;
  // Shared only: the sections this caller is allowed to (re)grade - owner/admin
  // get every section (undefined = no cap); a member gets just the sections they
  // hold propose/direct on. Targets are capped to this set, so a member run only
  // re-scores their editable sections and merges into the shared report.
  allowedTargetIds?: string[];
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
    const cached = await readCachedReport(client, userId, contentHash, creedId);
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
  const latest = await readLatestQualityReport(client, userId, creedId);
  const priorReport = latest?.report
    ? validateQualityReport(
        latest.report,
        sections,
        latest.content_hash || contentHash,
        false,
        latest.updated_at,
      )
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
  const computedTargets = !priorReport || rubricStale
    ? sectionIds
    : requested && requested.length
      ? requested
      : sections
          .filter((section) => priorSectionHashes[section.id] !== sectionHashes[section.id] || !priorById.has(section.id))
          .map((section) => section.id);
  // Cap to the caller's allowed set (shared members can only re-grade sections
  // they can edit). Owner/admin and personal pass no cap.
  const allowed = allowedTargetIds ? new Set(allowedTargetIds) : null;
  const targets = allowed ? computedTargets.filter((id) => allowed.has(id)) : computedTargets;

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
    const reportWithHashes = {
      ...report,
      sectionHashes,
      rubricVersion: CREED_QUALITY_RUBRIC_VERSION,
      fingerprintVersion: QUALITY_FINGERPRINT_VERSION,
    };
    if (latest?.content_hash !== contentHash) {
      await persistQualityReport({
        userId,
        creedId,
        mergeShared: Boolean(sharedCreedId),
        reportWithHashes,
        contentHash,
        sectionHashes,
        modelId: latest?.model_id ?? "carry-forward",
      });
    }
    if (sharedCreedId) {
      // Same shared-report scoping as the model-run return below, so a shared
      // caller sees the one true overall, not a subset recompute.
      const shared = await readQualityBaseline({ client, userId, creedId, sections, sharedRead: true });
      if (shared.report) {
        return { report: shared.report, contentHash, sectionHashes, cached: false, creditBalanceUsd: null };
      }
    }
    return { report: reportWithHashes, contentHash, sectionHashes, cached: false, creditBalanceUsd: null };
  }

  const credential = sharedCreedId
    ? await resolveSharedAiCredential(sharedCreedId, "analysis", userId)
    : await resolveAiCredential(client, userId, "analysis", creedId);
  const qualityScope: QualityScope = sharedCreedId ? "shared" : "personal";
  const qualitySubjectText = qualitySubject(qualityScope);
  let result: Awaited<ReturnType<typeof callOpenRouter>>;
  try {
    result = await callOpenRouter({
    apiKey: credential.apiKey,
    modelId: credential.modelId,
    // The schema-valid reply is compact (scores + short notes for the targeted
    // sections), so this ceiling is generous headroom, not a target.
    maxTokens: 8000,
    // Terra does not support temperature. A fixed seed plus explicit reasoning
    // effort gives repeat runs the most stable supported sampling profile.
    seed: 0,
    reasoning: { effort: "medium", exclude: true },
    // GPT-class reasoning over a full Creed can take 60-150s; the default 90s
    // abort surfaces mid-stream as "empty response". The route allows 300s.
    timeoutMs: 240000,
    responseFormat: buildQualityResponseFormat(),
    plugins: [{ id: "response-healing" }],
    // Only route to privacy-safe endpoints that honor the strict schema,
    // reasoning level, and seed instead of silently dropping a parameter.
    providerPreferences: {
      require_parameters: true,
      data_collection: "deny",
    },
    messages: [
      {
        role: "system",
        content: `Score how well this Creed (${qualitySubjectText.noun}) ${qualitySubjectText.purpose}. Use rubric ${CREED_QUALITY_RUBRIC_VERSION}. Be strict, specific, and consistent. Judge how complete, accurate, current, and concrete the file is - not how it would help engineering. Return valid JSON only.`,
      },
      {
        role: "user",
        content: buildQualityPrompt(sections, targets, qualityScope),
      },
    ],
    });
  } catch (error) {
    await cancelCreditReservation(credential.reservationId);
    throw error;
  }

  // Parse the model output first. A truncated or malformed response throws
  // here, before any charge, so the user is never billed for an analysis that
  // produced no usable report. Surface a clean message, not the raw JSON error.
  let parsed: unknown;
  try {
    parsed = parseJsonObject(result.content);
  } catch {
    await cancelCreditReservation(credential.reservationId);
    throw new Error("Analysis failed. Try again");
  }

  const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  const targetSet = new Set(targets);
  const allSectionIds = new Set(sectionIds);
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
      gradedById.set(section.id, normalizeSectionReport(raw, section, allSectionIds));
    }
  }

  const report = assembleReport({
    sections,
    gradedById,
    priorById,
    overall: parseOverallQualitative(root.overall, allSectionIds),
    contentHash,
  });
  const reportWithHashes = {
    ...report,
    sectionHashes,
    rubricVersion: CREED_QUALITY_RUBRIC_VERSION,
    fingerprintVersion: QUALITY_FINGERPRINT_VERSION,
  };

  // Now that we have a valid report, bill prepaid credits - before the report /
  // usage writes so a later DB hiccup can't skip the charge. No-op for BYOK.
  let creditBalanceUsd: number | null = null;
  let chargedMicroUsd: number | null = null;
  if (credential.mode === "credits") {
    const debit = sharedCreedId
      ? await deductSharedCredits({
          creedId: sharedCreedId,
          spentBy: userId,
          costUsd: result.costUsd,
          feature: "analysis",
          modelId: credential.modelId,
          reservationId: credential.reservationId,
        })
      : await deductCredits({
          userId,
          costUsd: result.costUsd,
          feature: "analysis",
          modelId: credential.modelId,
          reservationId: credential.reservationId,
        });
    if (debit) {
      creditBalanceUsd = debit.balanceUsd;
      chargedMicroUsd = debit.chargedMicroUsd;
    }
  }

  await persistQualityReport({
    userId,
    creedId,
    mergeShared: Boolean(sharedCreedId),
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
        // Stamp shared usage with the shared creed so the shared spend chart
        // attributes it; personal usage stays creed-less exactly as before.
        creedId: sharedCreedId,
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

  if (sharedCreedId) {
    // Return exactly what every member reads: the just-persisted shared report
    // (full-file overall score + narrative) scoped to this caller's visible
    // sections. Without this the runner would briefly show an overall recomputed
    // over its own subset - a transient number nobody else sees.
    const shared = await readQualityBaseline({ client, userId, creedId, sections, sharedRead: true });
    if (shared.report) {
      return { report: shared.report, contentHash, sectionHashes, cached: false, creditBalanceUsd };
    }
  }

  return { report: reportWithHashes, contentHash, sectionHashes, cached: false, creditBalanceUsd };
}
