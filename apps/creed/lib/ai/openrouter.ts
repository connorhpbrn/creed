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
  const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    // Some providers wrap the object in prose or a stray leading token despite
    // the response_format. Salvage the outermost { ... } and parse that before
    // giving up, so a well-formed object with a little junk around it survives.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw error;
  }
}

export type OpenRouterCallResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  modelQuality: Awaited<ReturnType<typeof getAiModel>>["quality"];
};

// Streaming sibling of callOpenRouter. Streams the completion so the caller can
// surface live progress (onDelta fires per token chunk), and resolves with the
// same shape callOpenRouter returns. Used by the Agent route, which pipes token
// progress to the panel while the model writes an edit.
export async function streamOpenRouter({
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature = 0.2,
  timeoutMs = 90000,
  responseFormat,
  providerPreferences,
  reasoning,
  onDelta,
  signal,
}: {
  apiKey: string;
  modelId: string;
  messages: OpenRouterMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: Record<string, unknown>;
  providerPreferences?: Record<string, unknown>;
  // Optional OpenRouter reasoning config (e.g. { effort: "low", exclude:
  // true }). Reasoning models like gpt-oss spend completion tokens on hidden
  // reasoning by default; latency-critical callers with small max_tokens must
  // rein that in or the content can come back empty.
  reasoning?: Record<string, unknown>;
  onDelta?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<OpenRouterCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Fold an external abort (the user pressed Stop) into our controller.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": getSiteUrl(),
        "X-Title": "Creed",
      },
      body: JSON.stringify({
        model: modelId,
        temperature,
        max_tokens: maxTokens,
        messages,
        stream: true,
        usage: { include: true },
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(providerPreferences ? { provider: providerPreferences } : {}),
        ...(reasoning ? { reasoning } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    clearTimeout(timeout);
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("OpenRouter timed out");
    throw new Error("Couldn't reach OpenRouter");
  }

  if (!response.ok || !response.body) {
    clearTimeout(timeout);
    if (response.status === 401) throw new Error("OpenRouter rejected your key");
    if (response.status === 402) throw new Error("OpenRouter is out of credit");
    if (response.status === 429) throw new Error("OpenRouter is rate-limiting you");
    throw new Error("OpenRouter rejected this request.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: OpenRouterResponse["usage"] | undefined;

  // Parse one SSE line, accumulating content / usage. Shared by the streaming
  // loop and the post-loop flush so the last frame is handled identically.
  const consume = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) return; // keep-alive comment
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: OpenRouterResponse["usage"];
      };
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        onDelta?.(delta);
      }
      if (chunk.usage) usage = chunk.usage;
    } catch {
      // Ignore an unparseable frame; the stream continues.
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by blank lines; process complete lines only.
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        consume(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    // Flush the decoder and process a trailing frame that wasn't newline-
    // terminated, so a final data: line isn't silently dropped.
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } catch (cause) {
    if (controller.signal.aborted) throw new Error("OpenRouter timed out");
    throw cause instanceof Error ? cause : new Error("OpenRouter stream failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!content.trim()) throw new Error("OpenRouter returned no content");

  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const model = await getAiModel(modelId);
  const reportedCost = usage?.cost;
  const costUsd =
    typeof reportedCost === "number" && reportedCost > 0
      ? reportedCost
      : await estimateAiCostUsd({ modelId, inputTokens, outputTokens });

  return { content, inputTokens, outputTokens, costUsd, modelQuality: model.quality };
}

export async function callOpenRouter({
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature = 0.2,
  timeoutMs = 90000,
  responseFormat,
  providerPreferences,
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
  // Optional OpenRouter provider routing preferences (e.g. { sort:
  // "throughput" } to prefer the fastest host serving the model). Omitted for
  // default price-based routing.
  providerPreferences?: Record<string, unknown>;
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
        ...(providerPreferences ? { provider: providerPreferences } : {}),
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
