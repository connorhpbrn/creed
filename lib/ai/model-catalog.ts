export type AiModelQuality = "excellent" | "good" | "weak" | "uncertain";

export type AiModelCatalogItem = {
  id: string;
  name: string;
  provider: string;
  quality: AiModelQuality;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  description: string;
  contextLength?: number;
  benchmark?: {
    label: string;
    score: number;
  };
};

type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

export const AI_MODEL_QUALITY_META: Record<
  AiModelQuality,
  { label: string; color: string; tint: string }
> = {
  excellent: {
    label: "Excellent",
    color: "#10B981",
    tint: "#D1FAE5",
  },
  good: {
    label: "Good",
    color: "#EAB308",
    tint: "#FEF3C7",
  },
  weak: {
    label: "Weak",
    color: "#EF4444",
    tint: "#FEE2E2",
  },
  uncertain: {
    label: "Uncertain",
    color: "#9CA3AF",
    tint: "#F3F4F6",
  },
};

export const DEFAULT_AI_MODEL_ID = "openai/gpt-5.5";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const MODEL_CACHE_MS = 1000 * 60 * 60;

let cachedCatalog: {
  models: AiModelCatalogItem[];
  expiresAt: number;
} | null = null;

const seedModels: AiModelCatalogItem[] = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    quality: "excellent",
    inputCostPerMillion: 5,
    outputCostPerMillion: 30,
    description: "Best default for turning rough context into a sharp Creed.",
    benchmark: { label: "Creed reasoning proxy", score: 96 },
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    quality: "excellent",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    description: "Strong synthesis and taste with a calmer style.",
    benchmark: { label: "Creed reasoning proxy", score: 93 },
  },
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "Google",
    quality: "good",
    inputCostPerMillion: 2,
    outputCostPerMillion: 12,
    description: "Capable long-context analysis for quality checks.",
    benchmark: { label: "Creed reasoning proxy", score: 86 },
  },
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    provider: "xAI",
    quality: "good",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    description: "Useful for direct critique and broad inference.",
    benchmark: { label: "Creed reasoning proxy", score: 82 },
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    quality: "good",
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10,
    description: "A cheaper strong fallback for routine refinement.",
    benchmark: { label: "Creed reasoning proxy", score: 84 },
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    quality: "weak",
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 2,
    description: "Only use when cost matters more than depth.",
    benchmark: { label: "Creed reasoning proxy", score: 58 },
  },
];

export const AI_MODEL_CATALOG = seedModels;

// Tiered scoring rules. The first match wins, so list specific high-signal
// patterns (flagships) before broad ones (small variants). Score is a
// 0–100 reasoning-benchmark proxy that maps to the colored dot via
// `qualityFromBenchmark` — the goal is that any new model OpenRouter ships
// from a major provider lands on the right tier automatically without
// shipping a code change.
const benchmarkRules: Array<{ pattern: RegExp; score: number; label: string }> = [
  // OpenAI flagships
  { pattern: /\bgpt-5(\.\d+)?(?!.*-mini|.*-nano|.*-micro)/i, score: 96, label: "Reasoning benchmark proxy" },
  { pattern: /\bo[34](?:-pro)?(?!.*-mini)\b/i, score: 95, label: "Reasoning benchmark proxy" },
  // Anthropic flagships
  { pattern: /claude.*opus.*[4-9]/i, score: 96, label: "Reasoning benchmark proxy" },
  { pattern: /claude.*opus/i, score: 92, label: "Reasoning benchmark proxy" },
  { pattern: /claude.*sonnet.*[4-9]/i, score: 93, label: "Reasoning benchmark proxy" },
  { pattern: /claude.*sonnet/i, score: 88, label: "Reasoning benchmark proxy" },
  // xAI flagships
  { pattern: /grok-?4(?!.*mini|.*nano|.*fast)/i, score: 92, label: "Reasoning benchmark proxy" },
  { pattern: /grok-?[5-9]/i, score: 95, label: "Reasoning benchmark proxy" },
  { pattern: /grok-?3.*(reasoner|max|heavy)/i, score: 90, label: "Reasoning benchmark proxy" },
  // Google flagships
  { pattern: /gemini-?[3-9].*(pro|ultra)/i, score: 92, label: "Reasoning benchmark proxy" },
  { pattern: /gemini.*pro/i, score: 87, label: "Reasoning benchmark proxy" },
  // Open-weights flagships
  { pattern: /deepseek.*(r1|v3|chat-v3)/i, score: 86, label: "Reasoning benchmark proxy" },
  { pattern: /kimi.*k2|moonshot.*k2/i, score: 84, label: "Reasoning benchmark proxy" },
  { pattern: /qwen-?(?:3|max|coder.*plus|3-235|2\.5-72b)/i, score: 84, label: "Reasoning benchmark proxy" },
  { pattern: /glm-?4\.[5-9]/i, score: 82, label: "Reasoning benchmark proxy" },
  { pattern: /llama-?(?:4|3\.[1-3].*70|3\.[1-3].*405)/i, score: 82, label: "Reasoning benchmark proxy" },
  { pattern: /mistral.*(large|medium-3)/i, score: 80, label: "Reasoning benchmark proxy" },
  { pattern: /command-?(?:r-plus|a-)/i, score: 78, label: "Reasoning benchmark proxy" },
  // Fast/small variants of strong families
  { pattern: /claude.*haiku.*[4-9]/i, score: 78, label: "Reasoning benchmark proxy" },
  { pattern: /claude.*haiku/i, score: 70, label: "Reasoning benchmark proxy" },
  { pattern: /gemini.*flash.*[2-9]/i, score: 75, label: "Reasoning benchmark proxy" },
  { pattern: /gemini.*flash/i, score: 68, label: "Reasoning benchmark proxy" },
  { pattern: /\bgpt-5.*(mini|nano)|o[34]-mini\b/i, score: 72, label: "Reasoning benchmark proxy" },
  { pattern: /grok.*(mini|fast)/i, score: 70, label: "Reasoning benchmark proxy" },
  { pattern: /deepseek.*(distill|lite)/i, score: 64, label: "Reasoning benchmark proxy" },
  { pattern: /qwen.*(turbo|plus)/i, score: 70, label: "Reasoning benchmark proxy" },
  // Generic small / weak fallbacks (lowest priority)
  { pattern: /(?:^|[^\w])(?:1\.5b|3b|7b|8b|13b|nano|tiny)(?:[^\w]|$)/i, score: 50, label: "Reasoning benchmark proxy" },
  { pattern: /(?:^|[^\w])(?:small|lite|edge|micro)(?:[^\w]|$)/i, score: 56, label: "Reasoning benchmark proxy" },
  { pattern: /preview|experimental|beta/i, score: 68, label: "Reasoning benchmark proxy" },
];

// Provider-based fallback when nothing matches by name. Major providers we
// trust to ship competent default text models even on unfamiliar releases.
const providerScoreFallback: Record<string, number> = {
  openai: 80,
  anthropic: 80,
  "x-ai": 80,
  google: 78,
  "google-deepmind": 78,
  deepseek: 74,
  qwen: 72,
  moonshotai: 74,
  moonshot: 74,
  "z-ai": 72,
  zai: 72,
  mistralai: 72,
  mistral: 72,
  "meta-llama": 70,
  meta: 70,
  cohere: 70,
  perplexity: 68,
  amazon: 68,
  microsoft: 68,
  ai21: 68,
  nvidia: 66,
  nousresearch: 66,
};

function qualityFromBenchmark(score?: number): AiModelQuality {
  if (score === undefined) {
    return "uncertain";
  }

  if (score >= 86) {
    return "excellent";
  }

  if (score >= 70) {
    return "good";
  }

  return "weak";
}

function inferBenchmark(model: Pick<AiModelCatalogItem, "id" | "name" | "provider">) {
  const text = `${model.id} ${model.name}`;
  const rule = benchmarkRules.find((item) => item.pattern.test(text));
  if (rule) {
    return { label: rule.label, score: rule.score };
  }

  // Provider-tier fallback so flagship releases from major labs always show
  // a colored dot, even on day-one when the name doesn't match a pattern yet.
  const providerKey = model.id.split("/")[0]?.toLowerCase() ?? "";
  const providerScore = providerScoreFallback[providerKey];
  if (providerScore !== undefined) {
    return { label: "Provider-tier proxy", score: providerScore };
  }

  return undefined;
}

function providerFromModelId(id: string) {
  const raw = id.split("/")[0] || "OpenRouter";
  const known: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    "google-deepmind": "Google",
    "x-ai": "xAI",
    meta: "Meta",
    "meta-llama": "Meta",
    mistralai: "Mistral",
    mistral: "Mistral",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    moonshotai: "Moonshot",
    moonshot: "Moonshot",
    "z-ai": "Z.ai",
    zai: "Z.ai",
    cohere: "Cohere",
    perplexity: "Perplexity",
    amazon: "Amazon",
    microsoft: "Microsoft",
    ai21: "AI21",
    nvidia: "NVIDIA",
    nousresearch: "Nous Research",
    inflection: "Inflection",
  };

  return known[raw] ?? raw.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function dollarsPerMillion(value: unknown) {
  const numeric = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(numeric) ? numeric * 1_000_000 : 0;
}

const NON_TEXT_OUTPUT_MODALITIES = new Set(["image", "audio", "video", "speech"]);

const NON_TEXT_MODEL_PATTERNS = [
  /image/i,
  /vision[-_]?gen/i,
  /\bdall[-_ ]?e\b/i,
  /\bimagen\b/i,
  /\bflux\b/i,
  /\bsdxl\b/i,
  /stable[-_]?diffusion/i,
  /\bnano[-_ ]?banana\b/i,
  /\bideogram\b/i,
  /\bplayground[-_ ]?v\d/i,
  /\bkandinsky\b/i,
  /\baudio\b/i,
  /\btts\b/i,
  /\bwhisper\b/i,
  /\bspeech\b/i,
  /\bvideo\b/i,
  /\bsora\b/i,
  /\bveo\b/i,
];

function normalizeOpenRouterModel(model: OpenRouterModel): AiModelCatalogItem | null {
  const inputModalities = model.architecture?.input_modalities ?? [];
  const outputModalities = model.architecture?.output_modalities ?? [];
  const modality = model.architecture?.modality ?? "";
  const readsText = inputModalities.includes("text") || modality.includes("text");
  const writesText = outputModalities.includes("text") || modality.endsWith("->text");

  if (!readsText || !writesText) {
    return null;
  }

  // Reject any model that also emits non-text output (image-gen, audio, video).
  if (outputModalities.some((mod) => NON_TEXT_OUTPUT_MODALITIES.has(mod))) {
    return null;
  }

  if (modality.includes("->image") || modality.includes("->audio") || modality.includes("->video")) {
    return null;
  }

  // Pattern fallback for models whose architecture metadata isn't reliable
  // (some image/audio gen models declare text output for prompts/captions).
  const haystack = `${model.id} ${model.name ?? ""}`;
  if (NON_TEXT_MODEL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return null;
  }

  const item = {
    id: model.id,
    name: model.name?.replace(/^[^:]+:\s*/, "").trim() || model.id,
    provider: providerFromModelId(model.id),
    quality: "uncertain" as AiModelQuality,
    inputCostPerMillion: dollarsPerMillion(model.pricing?.prompt),
    outputCostPerMillion: dollarsPerMillion(model.pricing?.completion),
    description: model.description?.trim() || "Available through OpenRouter.",
    contextLength: model.context_length,
  };
  const benchmark = inferBenchmark(item);

  return {
    ...item,
    quality: qualityFromBenchmark(benchmark?.score),
    benchmark,
  };
}

function sortModels(models: AiModelCatalogItem[]) {
  const qualityRank: Record<AiModelQuality, number> = {
    excellent: 0,
    good: 1,
    uncertain: 2,
    weak: 3,
  };

  return [...models].sort((a, b) => {
    if (a.id === DEFAULT_AI_MODEL_ID) {
      return -1;
    }

    if (b.id === DEFAULT_AI_MODEL_ID) {
      return 1;
    }

    return (
      qualityRank[a.quality] - qualityRank[b.quality] ||
      (b.benchmark?.score ?? -1) - (a.benchmark?.score ?? -1) ||
      a.provider.localeCompare(b.provider) ||
      a.name.localeCompare(b.name)
    );
  });
}

export async function getOpenRouterModelCatalog({ force = false }: { force?: boolean } = {}) {
  if (!force && cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return cachedCatalog.models;
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as { data?: OpenRouterModel[] };

    if (!response.ok || !Array.isArray(payload.data)) {
      throw new Error("Could not load OpenRouter models.");
    }

    const liveModels = payload.data
      .map(normalizeOpenRouterModel)
      .filter((model): model is AiModelCatalogItem => Boolean(model));
    const byId = new Map<string, AiModelCatalogItem>();

    for (const model of liveModels) {
      byId.set(model.id, model);
    }

    for (const seed of seedModels) {
      byId.set(seed.id, {
        ...seed,
        ...byId.get(seed.id),
        quality: seed.quality,
        benchmark: seed.benchmark,
      });
    }

    const models = sortModels(Array.from(byId.values()));
    cachedCatalog = {
      models,
      expiresAt: Date.now() + MODEL_CACHE_MS,
    };
    return models;
  } catch {
    return seedModels;
  }
}

export async function getAiModel(modelId: string | null | undefined) {
  const models = await getOpenRouterModelCatalog();
  return models.find((model) => model.id === modelId) ?? models.find((model) => model.id === DEFAULT_AI_MODEL_ID) ?? seedModels[0];
}

export function getSeedAiModel(modelId: string | null | undefined) {
  return seedModels.find((model) => model.id === modelId) ?? seedModels[0];
}

export function formatModelCost(model: Pick<AiModelCatalogItem, "inputCostPerMillion" | "outputCostPerMillion">) {
  return `$${formatCost(model.inputCostPerMillion)} / $${formatCost(model.outputCostPerMillion)} pm`;
}

function formatCost(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export async function estimateAiCostUsd({
  modelId,
  inputTokens,
  outputTokens,
}: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const model = await getAiModel(modelId);
  return (
    (inputTokens / 1_000_000) * model.inputCostPerMillion +
    (outputTokens / 1_000_000) * model.outputCostPerMillion
  );
}
