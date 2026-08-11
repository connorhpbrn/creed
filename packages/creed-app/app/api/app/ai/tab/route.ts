import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  resolveAiCredential,
  deductCredits,
  resolveSharedAiCredential,
  deductSharedCredits,
  cancelCreditReservation,
} from "@creed/edition/ai";
import { streamOpenRouter } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import {
  buildTabContext,
  buildTabSystemPrompt,
  buildTabUserPrompt,
  TAB_MAX_AFTER_CHARS,
  TAB_MAX_BEFORE_CHARS,
  type TabMode,
} from "@/lib/ai/tab";
import { loadActiveCreedSections } from "@/lib/creed-backend";
import { resolveActiveCreed } from "@/lib/creed-context";
import { sectionBodyMarkdown } from "@creed/core/creed-data";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/observability";

// Tab autocomplete: one explicit press, one streamed suggestion. The route
// streams raw completion text (text/plain) so the ghost renders from the first
// token; billing happens after the stream resolves, tagged feature "tab".
// Approve / reject / keep typing never reach this route, so only the press
// itself is metered.

export const maxDuration = 60;

// Generous interactive ceiling: a fast typist chaining suggestions, not a bot.
const TAB_RATE_LIMIT = 30;
const TAB_RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const verdict = await checkRateLimit({
    scope: "ai-tab",
    identifier: auth.user.id,
    limit: TAB_RATE_LIMIT,
    windowMs: TAB_RATE_WINDOW_MS,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Slow down a moment, then try Tab again." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  const activeCreed = await resolveActiveCreed(auth.supabase, auth.user);
  const sharedEntry = activeCreed?.creeds.find(
    (c) => c.id === activeCreed.creedId && c.type === "shared",
  );
  const sharedCreedId = sharedEntry ? activeCreed!.creedId : undefined;

  if (sharedCreedId) {
  }

  let payload: {
    messages: Array<{ role: "system" | "user"; content: string }>;
    apiKey: string;
    modelId: string;
    mode: "credits" | "byok";
    maxTokens: number;
    reservationId?: string;
  };
  try {
    const body = (await request.json()) as {
      sectionId?: unknown;
      before?: unknown;
      after?: unknown;
      mode?: unknown;
    };
    const sectionId = typeof body.sectionId === "string" ? body.sectionId.trim() : "";
    const before = typeof body.before === "string" ? body.before : "";
    const after = typeof body.after === "string" ? body.after : "";
    const mode: TabMode = body.mode === "draft" ? "draft" : "complete";
    if (
      !sectionId ||
      sectionId.length > 128 ||
      before.length > TAB_MAX_BEFORE_CHARS * 2 ||
      after.length > TAB_MAX_AFTER_CHARS * 2
    ) {
      return NextResponse.json({ error: "Missing or oversized request." }, { status: 400 });
    }

    const sections = await loadActiveCreedSections(auth.supabase, auth.user.id, activeCreed);
    const target = sections.find(
      (section) => section.id === sectionId && !section.archived,
    );
    if (!target) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }

    const context = buildTabContext(
      sections
        .filter((section) => !section.archived)
        .map((section) => ({
          id: section.id,
          name: section.name,
          content: sectionBodyMarkdown(section),
        })),
      sectionId,
    );

    const credential = sharedCreedId
      ? await resolveSharedAiCredential(sharedCreedId, "tab", auth.user.id)
      : await resolveAiCredential(auth.supabase, auth.user.id, "tab");

    payload = {
      messages: [
        { role: "system", content: buildTabSystemPrompt() },
        {
          role: "user",
          content: buildTabUserPrompt({
            context,
            sectionName: target.name,
            currentSectionMarkdown: sectionBodyMarkdown(target),
            sectionReferenceCatalog: sections
              .filter((section) => !section.archived)
              .map((section) => `${section.name}: #${section.id}`)
              .join("\n"),
            before,
            after,
            mode,
          }),
        },
      ],
      apiKey: credential.apiKey,
      modelId: credential.modelId,
      mode: credential.mode,
      reservationId: credential.reservationId,
      // Tab should finish one thought, not draft a passage. A small ceiling
      // reduces generation time and prevents an over-eager completion from
      // continuing after the useful suggestion.
      maxTokens: mode === "draft" ? 240 : 160,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "That didn't go through. Try again";
    const status = message === "Out of credits" ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const p = payload;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await streamOpenRouter({
          apiKey: p.apiKey,
          modelId: p.modelId,
          maxTokens: p.maxTokens,
          timeoutMs: 12000,
          // Let OpenRouter select the fastest compliant endpoint while
          // preserving fallback availability and the product's privacy rule.
          providerPreferences: {
            allow_fallbacks: true,
            sort: "throughput",
            require_parameters: true,
            data_collection: "deny",
          },
          // Inline completion is prediction, not deliberation. Disable hidden
          // reasoning so the first visible token arrives immediately.
          reasoning: { effort: "none", exclude: true },
          seed: 0,
          signal: request.signal,
          messages: p.messages,
          onDelta: (chunk) => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              // Client already dismissed the ghost; keep reading so billing
              // still sees the true usage.
            }
          },
        });

        // Bill the real spend once the suggestion exists. Dismissed ghosts
        // were still generated, so they still cost.
        let creditBalanceUsd: number | null = null;
        let chargedMicroUsd: number | null = null;
        if (p.mode === "credits") {
          const debit = sharedCreedId
            ? await deductSharedCredits({
                creedId: sharedCreedId,
                spentBy: auth.user.id,
                costUsd: result.costUsd,
                feature: "tab",
                modelId: p.modelId,
                reservationId: p.reservationId,
              })
            : await deductCredits({
                userId: auth.user.id,
                costUsd: result.costUsd,
                feature: "tab",
                modelId: p.modelId,
                reservationId: p.reservationId,
              });
          if (debit) {
            creditBalanceUsd = debit.balanceUsd;
            chargedMicroUsd = debit.chargedMicroUsd;
          }
        }
        if (p.mode === "byok" || creditBalanceUsd !== null) {
          try {
            await recordAiUsage({
              client: auth.supabase,
              userId: auth.user.id,
              creedId: sharedCreedId,
              feature: "tab",
              modelId: p.modelId,
              modelQuality: result.modelQuality,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              chargedMicroUsd:
                chargedMicroUsd ?? Math.round(result.costUsd * 1_000_000),
              aiMode: p.mode,
            });
          } catch {
            // Best-effort.
          }
        }
      } catch (error) {
        await cancelCreditReservation(p.reservationId);
        // An empty or failed stream simply yields no ghost: the client treats
        // an empty body as "no suggestion" and returns to idle silently. A
        // user-initiated abort is expected, not an error.
        if (!request.signal.aborted) {
          const message = error instanceof Error ? error.message : "unknown";
          if (message === "OpenRouter returned no content") {
            log.warn("ai_tab_empty_completion", {
              userId: auth.user.id,
              modelId: p.modelId,
            });
          } else {
            log.error("ai_tab_stream_failed", { userId: auth.user.id, message });
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
