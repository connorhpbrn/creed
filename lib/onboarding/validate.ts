import type { OnboardingPreviewDraft, OnboardingRefinement } from "@/lib/onboarding/compile";

const GENERIC_PHRASES = [
  "ambitious builder",
  "visionary founder",
  "world-class",
  "cutting-edge",
  "best-in-class",
  "innovative",
  "mission-driven",
  "passionate about",
  "fast-moving founder",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeWhitespace(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWeakText(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return true;
  if (GENERIC_PHRASES.some((phrase) => normalized.includes(phrase))) return true;
  return normalized.length < 8;
}

function sanitizeText(value: unknown, maxLength: number, allowShort = false) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value)
    .replace(/\bi\b/g, "I")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bagi\b/gi, "AGI")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bml\b/gi, "ML")
    .replace(/\bgithub\b/gi, "GitHub")
    .slice(0, maxLength);
  if (!allowShort && isWeakText(normalized)) return undefined;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sanitizeNullableParagraph(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value).slice(0, maxLength);
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sanitizeArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  kind: "generic" | "preferences" | "tools" = "generic"
) {
  if (!Array.isArray(value)) return undefined;

  const normalized = dedupeStrings(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) =>
        normalizeWhitespace(item)
          .replace(/\bi\b/g, "I")
          .replace(/\bai\b/gi, "AI")
          .replace(/\bagi\b/gi, "AGI")
          .replace(/\bllm\b/gi, "LLM")
          .replace(/\bml\b/gi, "ML")
          .replace(/\bgithub\b/gi, "GitHub")
          .replace(/\bu\b/gi, "you")
          .slice(0, maxLength)
      )
      .filter((item) => {
        if (kind === "tools") return item.length >= 2;
        if (isWeakText(item)) return false;
        if (kind === "preferences") {
          // Preferences should read as instructions to AI (no first-person).
          if (/\b(i|my|me|u|ur)\b/i.test(item)) return false;
        }
        return true;
      })
      .map((item) => {
        if (kind === "tools") return item.replace(/[.!?]+$/, "");
        const capped = item.charAt(0).toUpperCase() + item.slice(1);
        return /[.!?]["”']?$/.test(capped) ? capped : `${capped}.`;
      })
  ).slice(0, maxItems);

  return normalized.length > 0 ? normalized : undefined;
}

export function validateRefinedDraft(
  refinement: unknown,
  compiledDraft: OnboardingPreviewDraft
): OnboardingRefinement {
  if (!refinement || typeof refinement !== "object" || Array.isArray(refinement)) {
    return {};
  }

  const record = refinement as Record<string, unknown>;
  const allowedKeys = new Set([
    "identityText",
    "beliefsText",
    "goalsText",
    "workText",
    "workTags",
    "preferences",
    "constraintsText",
    "peopleText",
    "healthText",
    "routines",
    "contextText",
  ]);

  const keys = Object.keys(record);
  if (keys.some((key) => !allowedKeys.has(key))) return {};

  const identityText = sanitizeText(record.identityText, 700);
  const beliefsText = sanitizeNullableParagraph(record.beliefsText, 700);
  const goalsText = sanitizeText(record.goalsText, 700, true);
  const workText = sanitizeText(record.workText, 700, true);
  const workTags = sanitizeArray(record.workTags, 24, 60, "tools");
  const preferences = sanitizeArray(record.preferences, 8, 220, "preferences");
  const constraintsText = sanitizeNullableParagraph(record.constraintsText, 700);
  const peopleText = sanitizeNullableParagraph(record.peopleText, 1200);
  const healthText = sanitizeNullableParagraph(record.healthText, 1200);
  const routines = sanitizeArray(record.routines, 8, 220, "generic");
  const contextText = sanitizeNullableParagraph(record.contextText, 1200);

  return {
    identityText:
      identityText && identityText !== compiledDraft.identityText ? identityText : undefined,
    beliefsText: beliefsText !== undefined ? beliefsText : undefined,
    goalsText:
      goalsText && goalsText !== compiledDraft.goalsText ? goalsText : undefined,
    workText:
      workText && workText !== compiledDraft.workText ? workText : undefined,
    workTags,
    preferences,
    constraintsText: constraintsText !== undefined ? constraintsText : undefined,
    peopleText: peopleText !== undefined ? peopleText : undefined,
    healthText: healthText !== undefined ? healthText : undefined,
    routines,
    contextText: contextText !== undefined ? contextText : undefined,
  };
}
