import { gradeTrial } from "./grader.ts";
import { CreedBenchSimulator } from "./simulator.ts";
import { CREED_BENCH_INSTRUCTIONS, CREED_BENCH_TOOLS } from "./tool-contract.ts";
import type { BenchEffort, BenchTask, BenchTrial } from "./types.ts";

type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
};

type CompletionResponse = {
  model?: string;
  provider?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
  error?: { message?: string };
};

const MAX_PROVIDER_ATTEMPTS = 4;

function answerText(
  content: string | Array<{ type?: string; text?: string }> | null | undefined,
) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function parseArguments(value: string) {
  const parsed: unknown = JSON.parse(value || "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function effortPayload(effort: BenchEffort) {
  return { reasoning: { effort } };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function openRouterCompletion(options: {
  apiKey: string;
  modelId: string;
  messages: OpenRouterMessage[];
  tools: typeof CREED_BENCH_TOOLS;
  effort: BenchEffort;
  signal?: AbortSignal;
}): Promise<CompletionResponse> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://creed.so/bench",
          "X-Title": "Creed Bench",
        },
        body: JSON.stringify({
          model: options.modelId,
          messages: options.messages,
          tools: options.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          tool_choice: "auto",
          temperature: 0,
          max_tokens: 4096,
          ...effortPayload(options.effort),
        }),
        signal: options.signal,
      });
      const payload = (await response.json()) as CompletionResponse;
      if (response.ok && !payload.error) return payload;
      lastError = new Error(
        payload.error?.message ?? `OpenRouter returned ${response.status}`,
      );
      if (!isRetryableStatus(response.status)) throw lastError;
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      if (cause instanceof Error && cause === lastError) throw cause;
      lastError =
        cause instanceof Error ? cause : new Error("Unknown OpenRouter failure");
    }
    if (attempt < MAX_PROVIDER_ATTEMPTS) {
      await sleep(Math.min(8_000, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error("OpenRouter request failed");
}

export async function runBenchTrial(options: {
  apiKey: string;
  modelId: string;
  effort: BenchEffort;
  repetition: number;
  task: BenchTask;
  maxTurns?: number;
  signal?: AbortSignal;
}): Promise<BenchTrial> {
  const simulator = new CreedBenchSimulator(options.task.initialWorld);
  const startedAt = Date.now();
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: [
        CREED_BENCH_INSTRUCTIONS,
        "You are connected to a synthetic Creed benchmark environment.",
        "Use tools exactly as you would for a real user. Treat tool results as authoritative.",
        "Do not mention the benchmark. After tool work, answer the user's request clearly and briefly.",
      ].join(" "),
    },
    { role: "user", content: options.task.prompt },
  ];
  let finalAnswer = "";
  let resolvedModelId = options.modelId;
  let provider: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let error: string | null = null;
  const maxTurns = options.maxTurns ?? options.task.maxTurns;
  const availableTools = CREED_BENCH_TOOLS.filter(
    (tool) =>
      tool.name !== "direct_edit_creed" ||
      options.task.initialWorld.sections.some(
        (section) => section.permission === "direct",
      ),
  );

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const payload = await openRouterCompletion({
        apiKey: options.apiKey,
        modelId: options.modelId,
        messages,
        tools: availableTools,
        effort: options.effort,
        signal: options.signal,
      });
      resolvedModelId = payload.model ?? resolvedModelId;
      provider = payload.provider ?? provider;
      inputTokens += payload.usage?.prompt_tokens ?? 0;
      outputTokens += payload.usage?.completion_tokens ?? 0;
      costUsd += payload.usage?.cost ?? 0;
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error("OpenRouter returned no assistant message");
      const toolCalls = message.tool_calls ?? [];
      const content = answerText(message.content);
      messages.push({
        role: "assistant",
        content: content || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      if (!toolCalls.length) {
        finalAnswer = content;
        break;
      }
      for (const call of toolCalls) {
        let result: unknown;
        try {
          result = await simulator.call(
            call.function.name,
            parseArguments(call.function.arguments),
            turn,
          );
        } catch (cause) {
          const parseError = cause instanceof Error ? cause.message : "Invalid tool arguments";
          result = { ok: false, error: parseError };
          simulator.trace.push({
            turn,
            name: call.function.name,
            arguments: {},
            result,
            error: parseError,
          });
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      if (turn === maxTurns) {
        throw new Error(`Turn limit reached (${maxTurns})`);
      }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unknown benchmark error";
  }

  return gradeTrial(options.task, {
    taskId: options.task.id,
    taskTitle: options.task.title,
    family: options.task.family,
    difficulty: options.task.difficulty,
    effort: options.effort,
    repetition: options.repetition,
    requestedModelId: options.modelId,
    resolvedModelId,
    provider,
    finalAnswer,
    trace: simulator.trace,
    mutations: simulator.mutations,
    initialWorld: simulator.initialWorld,
    finalWorld: simulator.world,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: Date.now() - startedAt,
    error,
  });
}
