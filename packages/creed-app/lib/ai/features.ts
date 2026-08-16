// The three user-facing AI features that spend credits. This shared registry
// keeps server-side billing and client-side usage reporting on the same keys.
//
// Isomorphic on purpose (no "server-only" / "use client"): the server tags
// usage and bills per feature, and the client colours the spend chart from the
// same registry. Production model selection is server-only, so the three pinned
// models live in lib/ai/feature-models rather than this shared registry.

export type AiFeature = "analysis" | "tab" | "panel";

// Canonical order, used for stable chart stacking and iteration.
export const AI_FEATURES: readonly AiFeature[] = ["analysis", "tab", "panel"];

// Display metadata for the spend chart and the credit history. One colour per
// feature; the chart stacks by feature, not by model.
export const AI_FEATURE_META: Record<AiFeature, { label: string; color: string }> = {
  analysis: { label: "Analysis", color: "#2563EB" },
  tab: { label: "Tab", color: "#16A34A" },
  panel: { label: "Panel", color: "#DB2777" },
};

// Fold legacy / aliased feature keys onto the canonical set. Rows written before
// the feature rename tagged Analysis as "quality_analysis"; "cmdk" was Panel's
// working name before it shipped.
export function normalizeFeature(feature: string): string {
  if (feature === "quality_analysis") return "analysis";
  if (feature === "cmdk") return "panel";
  return feature;
}

// Label + colour for any stored feature string, tolerant of unknown values.
export function featureMeta(feature: string): { label: string; color: string } {
  const key = normalizeFeature(feature);
  return (
    AI_FEATURE_META[key as AiFeature] ?? {
      label: key.replace(/_/g, " "),
      color: "#9CA3AF",
    }
  );
}
