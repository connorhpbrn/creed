import type { CreedSection } from "@creed/core/creed-data";
import { sectionBodyMarkdown } from "@creed/core/creed-data";
import { normalizeQualityMarkdown } from "@/lib/ai/quality-fingerprint-core";

export { normalizeQualityMarkdown } from "@/lib/ai/quality-fingerprint-core";

export const QUALITY_FINGERPRINT_VERSION = 2;

// Quality depends on the section identity, name, kind, and visible body. It
// does not depend on editor HTML noise, accent, permissions, edit attribution,
// revision history, or other metadata the rubric never judges.
export function qualitySectionFingerprintInput(section: CreedSection) {
  return {
    id: section.id,
    kind: section.kind,
    name: section.name.replace(/[ \t]+/g, " ").trim(),
    content: normalizeQualityMarkdown(sectionBodyMarkdown(section)),
  };
}

export function qualitySectionFingerprint(section: CreedSection): string {
  return JSON.stringify(qualitySectionFingerprintInput(section));
}
