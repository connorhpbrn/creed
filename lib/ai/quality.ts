import "server-only";
import { createHash } from "node:crypto";
import type { CreedSection } from "@/lib/creed-data";
import { callOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { getUserOpenRouterCredential, recordAiUsage } from "@/lib/ai/persistence";
import { buildQualityPrompt, CREED_QUALITY_RUBRIC_VERSION } from "@/lib/ai/quality-rubric";

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
    // Legacy arrays — kept for backwards-compat consumers / fallback when the
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
  ],
  amber: [
    "Generic",
    "Thin",
    "Surface",
    "Wordy",
    "Drifty",
  ],
  red: [
    "Short",
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

export function validateQualityReport(value: unknown, sections: CreedSection[], contentHash: string): CreedQualityReport {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const overall = root.overall && typeof root.overall === "object" ? (root.overall as Record<string, unknown>) : {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];

  const sectionReports = sections.map((section) => {
    const raw =
      rawSections.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).sectionId === section.id
      ) as Record<string, unknown> | undefined;

    const strengths = normalizeStringArray(raw?.strengths, []).slice(0, 3);
    const gaps = normalizeStringArray(
      raw?.gaps,
      raw?.missingContext ? normalizeStringArray(raw.missingContext, []) : []
    ).slice(0, 3);

    const strength =
      normalizeNote(raw?.strength) ?? deriveLegacyNote(strengths, "Worth keeping");
    const gap =
      normalizeNote(raw?.gap) ?? deriveLegacyNote(gaps, "Needs work");

    return {
      sectionId: section.id,
      sectionName: section.name,
      score: clampScore(raw?.score ?? 0),
      tags: normalizeTags(raw?.tags),
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
  });

  const overallStrengthsArr = normalizeStringArray(overall.strengths, [
    "The profile has a clear personal-context structure.",
  ]).slice(0, 4);
  const overallGapsArr = normalizeStringArray(overall.gaps, [
    "Some sections need sharper, more specific personal detail.",
  ]).slice(0, 4);

  return {
    contentHash,
    overall: {
      score: clampScore(overall.score ?? average(sectionReports.map((section) => section.score))),
      summary:
        typeof overall.summary === "string" && overall.summary.trim()
          ? overall.summary.trim()
          : "The profile has useful structure but needs sharper, more specific personal context.",
      tags: normalizeTags(overall.tags),
      strength:
        normalizeNote(overall.strength) ?? deriveLegacyNote(overallStrengthsArr, "Working well"),
      gap: normalizeNote(overall.gap) ?? deriveLegacyNote(overallGapsArr, "Biggest gap"),
      strengths: overallStrengthsArr,
      gaps: overallGapsArr,
      focus: normalizeStringArray(overall.focus, [
        "Tighten weak sections with concrete details, examples, or defaults specific to you.",
      ]).slice(0, 5),
    },
    sections: sectionReports,
    generatedAt: new Date().toISOString(),
  };
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
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

export async function analyzeCreedQuality({
  client,
  userId,
  sections,
  force = false,
  persist = true,
}: {
  client: unknown;
  userId: string;
  sections: CreedSection[];
  force?: boolean;
  persist?: boolean;
}) {
  const contentHash = hashCreedSections(sections);
  const sectionHashes = hashCreedSectionsById(sections);
  const cached = force ? null : await readCachedReport(client, userId, contentHash);
  if (cached?.report) {
    return {
      report: cached.report,
      contentHash,
      sectionHashes: readStoredSectionHashes(cached) ?? cached.report.sectionHashes ?? sectionHashes,
      cached: true,
    };
  }

  const credential = await getUserOpenRouterCredential(client, userId);
  const result = await callOpenRouter({
    apiKey: credential.apiKey,
    modelId: credential.modelId,
    maxTokens: 4500,
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
        `Score how well this Creed (a personal context profile every AI reads before talking to its owner) lets a fresh AI know the user. Use rubric ${CREED_QUALITY_RUBRIC_VERSION}. Be strict, specific, concise. Judge how complete, accurate, current, and concrete the profile is — not how it would help engineering. Return valid JSON only.`,
      },
      {
        role: "user",
        content: buildQualityPrompt(sections),
      },
    ],
  });

  const report = validateQualityReport(parseJsonObject(result.content), sections, contentHash);
  const reportWithHashes = {
    ...report,
    sectionHashes,
  };
  if (persist) {
    const now = new Date().toISOString();
    const db = client as SupabaseLikeClient;
    const { error } = await db.from("creed_quality_reports").upsert(
      {
        user_id: userId,
        content_hash: contentHash,
        section_hashes: sectionHashes,
        model_id: credential.modelId,
        report: reportWithHashes,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    assertNoError(error, "Could not save quality report.");
  }

  await recordAiUsage({
    client,
    userId,
    feature: "quality_analysis",
    modelId: credential.modelId,
    modelQuality: result.modelQuality,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd: result.estimatedCostUsd,
  });

  return { report: reportWithHashes, contentHash, sectionHashes, cached: false };
}

export async function updateSectionQualityBaseline({
  client,
  userId,
  section,
  sectionReport,
}: {
  client: unknown;
  userId: string;
  section: CreedSection;
  sectionReport: CreedQualityReport["sections"][number];
}) {
  const latest = await readLatestQualityReport(client, userId);
  if (!latest?.report) {
    throw new Error("Run a full analysis before refreshing a single section.");
  }

  const now = new Date().toISOString();
  const sectionHash = hashCreedSection(section);
  const storedHashes = readStoredSectionHashes(latest);
  const storedReport =
    latest?.report && typeof latest.report === "object"
      ? latest.report as CreedQualityReport
      : null;
  const existingSections = Array.isArray(storedReport?.sections) ? storedReport.sections : [];
  const nextSections = new Map(existingSections.map((item) => [item.sectionId, item]));
  nextSections.set(section.id, sectionReport);
  const nextSectionHashes = {
    ...storedHashes,
    [section.id]: sectionHash,
  };
  const nextReport: CreedQualityReport = {
    contentHash: latest.content_hash ?? "",
    overall: storedReport?.overall ?? {
      score: sectionReport.score,
      summary: "",
      tags: [],
      strength: null,
      gap: null,
      strengths: [],
      gaps: [],
      focus: [],
    },
    sections: Array.from(nextSections.values()),
    generatedAt: now,
  };

  const db = client as SupabaseLikeClient;
  const { error } = await db.from("creed_quality_reports").upsert(
    {
      user_id: userId,
      content_hash: latest.content_hash ?? "",
      section_hashes: nextSectionHashes,
      model_id: latest.model_id ?? "section-refresh",
      report: {
        ...nextReport,
        sectionHashes: nextSectionHashes,
      },
      created_at: latest?.updated_at ?? now,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  assertNoError(error, "Could not save section quality baseline.");
  return {
    report: nextReport,
    sectionHash,
    sectionHashes: nextSectionHashes,
  };
}
