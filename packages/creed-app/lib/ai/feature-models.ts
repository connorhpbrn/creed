import "server-only";

import type { AiFeature } from "@/lib/ai/features";

// The production model for each user-facing AI feature. Model choice is part
// of the feature's versioned behaviour, so it lives in source rather than
// deployment configuration. Search, Ask, and Agent are all Panel modes and
// deliberately share the same model.
export const AI_FEATURE_MODELS = {
  analysis: "openai/gpt-5.6-terra",
  tab: "openai/gpt-5.6-luna",
  panel: "openai/gpt-5.6-luna",
} as const satisfies Record<AiFeature, string>;

export function getAiFeatureModel(feature: AiFeature): string {
  return AI_FEATURE_MODELS[feature];
}
