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
}: {
  apiKey: string;
  modelId: string;
  messages: OpenRouterMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
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
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    clearTimeout(timeout);
    // Network failure or our own timeout abort.
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error(
        "OpenRouter took longer than expected to respond. Try again, or pick a smaller model in Settings."
      );
    }
    throw new Error(
      "Could not reach OpenRouter. Check your network connection and try again."
    );
  }

  try {
    const payload = (await response.json().catch(() => null)) as
      | (OpenRouterResponse & { error?: { message?: string } })
      | null;

    if (!response.ok) {
      // Translate the common HTTP statuses into something the user can act on.
      const upstream = payload?.error?.message?.trim();
      if (response.status === 401) {
        throw new Error(
          "OpenRouter rejected your API key. Open Settings, paste a fresh key, and try again."
        );
      }
      if (response.status === 402) {
        throw new Error(
          "Your OpenRouter account is out of credit. Top it up at openrouter.ai and try again."
        );
      }
      if (response.status === 429) {
        throw new Error(
          "OpenRouter is rate-limiting your key right now. Wait a minute and try again, or pick a different model."
        );
      }
      throw new Error(upstream || "OpenRouter rejected this request.");
    }

    if (!payload) {
      throw new Error("OpenRouter returned an empty response. Try again, or pick a different model in Settings.");
    }

    const content = extractContent(payload);
    if (!content) {
      throw new Error("OpenRouter returned no content. Try a different model in Settings.");
    }

  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;
    const model = await getAiModel(modelId);

    return {
      content,
      inputTokens,
      outputTokens,
      estimatedCostUsd: await estimateAiCostUsd({ modelId, inputTokens, outputTokens }),
      modelQuality: model.quality,
    };
  } finally {
    clearTimeout(timeout);
  }
}
