// The AI features that spend credits. Only "analysis" is wired to a live
// feature today; "tab" and "cmdk" are planned (see project-context/roadmap.md)
// and already carry their display metadata + model env mapping, so shipping one
// is a new call site, not a new subsystem.
//
// Isomorphic on purpose (no "server-only" / "use client"): the server tags
// usage and bills per feature, and the client colours the spend chart from the
// same registry. The per-feature MODEL selection reads env and is server-only,
// so it lives in lib/ai/model-catalog (getFeatureModelId), not here.

export type AiFeature = "analysis" | "tab" | "cmdk";

// Canonical order, used for stable chart stacking and iteration.
export const AI_FEATURES: readonly AiFeature[] = ["analysis", "tab", "cmdk"];

// Display metadata for the spend chart and the credit history. One colour per
// feature; the chart stacks by feature, not by model.
export const AI_FEATURE_META: Record<AiFeature, { label: string; color: string }> = {
  analysis: { label: "Analysis", color: "#16A34A" },
  tab: { label: "Tab", color: "#2563EB" },
  cmdk: { label: "Command", color: "#DB2777" },
};

// Fold legacy / aliased feature keys onto the canonical set. Rows written before
// the feature rename tagged Analysis as "quality_analysis".
export function normalizeFeature(feature: string): string {
  return feature === "quality_analysis" ? "analysis" : feature;
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
