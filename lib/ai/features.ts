// The AI features that spend credits. "analysis" and "panel" are wired to live
// features today; "tab" is planned (see context/roadmap.md) and already
// carries its display metadata + model env mapping, so shipping it is a new
// call site, not a new subsystem.
//
// Isomorphic on purpose (no "server-only" / "use client"): the server tags
// usage and bills per feature, and the client colours the spend chart from the
// same registry. The per-feature MODEL selection reads env and is server-only,
// so it lives in lib/ai/model-catalog (getFeatureModelId), not here.

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
