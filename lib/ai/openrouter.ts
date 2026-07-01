import "server-only";
import { estimateAiCostUsd, getAiModel } from "@/lib/ai/model-catalog";
import { getSiteUrl } from "@/lib/supabase/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    // OpenRouter's authoritative billed cost for the call, present when usage
    // accounting is requested (usage: { include: true }).
    cost?: number;
  };
};

function extractContent(payload: OpenRouterResponse) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

export function parseJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

export async function callOpenRouter({
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature = 0.2,
  timeoutMs = 90000,
  responseFormat,
}: {
  apiKey: string;
  modelId: string;
  messages: OpenRouterMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  // Optional OpenRouter response_format (e.g. a json_schema) to force a
  // well-formed, schema-valid reply. Omitted for free-form calls.
  responseFormat?: Record<string, unknown>;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter uses HTTP-Referer for usage attribution on the user's
        // OpenRouter dashboard. Derive from the deployed origin so forks
        // get attributed to their own domain, not the upstream Creed.
        "HTTP-Referer": getSiteUrl(),
        "X-Title": "Creed",
      },
      body: JSON.stringify({
        model: modelId,
        temperature,
        max_tokens: maxTokens,
        messages,
        // Ask OpenRouter to return the authoritative billed cost so we charge
        // the true post-call amount rather than re-deriving it from the catalog.
        usage: { include: true },
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    clearTimeout(timeout);
    // Network failure or our own timeout abort.
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error("OpenRouter timed out");
    }
    throw new Error("Couldn't reach OpenRouter");
  }

  try {
    let payload: (OpenRouterResponse & { error?: { message?: string } }) | null;
    try {
      payload = (await response.json()) as OpenRouterResponse & { error?: { message?: string } };
    } catch {
      // A read failure here is almost always our own timeout aborting the
      // still-streaming body. Surface it as a timeout, not "empty response".
      if (controller.signal.aborted) {
        throw new Error("OpenRouter timed out");
      }
      payload = null;
    }

    if (!response.ok) {
      // Translate the common HTTP statuses into something the user can act on.
      const upstream = payload?.error?.message?.trim();
      if (response.status === 401) {
        throw new Error("OpenRouter rejected your key");
      }
      if (response.status === 402) {
        throw new Error("OpenRouter is out of credit");
      }
      if (response.status === 429) {
        throw new Error("OpenRouter is rate-limiting you");
      }
      throw new Error(upstream || "OpenRouter rejected this request.");
    }

    if (!payload) {
      throw new Error("OpenRouter returned an empty response");
    }

    const content = extractContent(payload);
    if (!content) {
      throw new Error("OpenRouter returned no content");
    }

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const model = await getAiModel(modelId);

    // Prefer OpenRouter's authoritative billed cost; fall back to pricing the
    // real returned token counts off our catalog if it isn't present.
    const reportedCost = payload.usage?.cost;
    const costUsd =
      typeof reportedCost === "number" && reportedCost > 0
        ? reportedCost
        : await estimateAiCostUsd({ modelId, inputTokens, outputTokens });

    return {
      content,
      inputTokens,
      outputTokens,
      costUsd,
      modelQuality: model.quality,
    };
  } finally {
    clearTimeout(timeout);
  }
}
