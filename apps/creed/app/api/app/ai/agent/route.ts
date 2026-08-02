import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  resolveAiCredential,
  deductCredits,
  resolveCompanyAiCredential,
  deductCompanyCredits,
  cancelCreditReservation,
} from "@/lib/ai/credits";
import { callOpenRouter, streamOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { getAgentModelId } from "@/lib/ai/model-catalog";
import { recordAiUsage } from "@/lib/ai/persistence";
import {
  buildAgentResponseFormat,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  validateAgentActions,
  type AgentPermissionValue,
  type AgentResult,
  type AgentStreamEvent,
} from "@/lib/panel/agent";
import { executeAgentActions, executeCompanyAgentActions } from "@/lib/panel/agent-execute";
import { loadActiveCreedState } from "@/lib/creed-backend";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getCompanyAccessState } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sectionBodyMarkdown } from "@/lib/creed-data";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({
    scope: "ai-agent",
    identifier: auth.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many agent requests." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  // The in-app "Creed" agent works on personal AND company Creeds. On a company
  // Creed it behaves identically, attributed to the acting member as "[member]'s
  // Creed", and every edit is enforced per section by companyMcpWrite (Direct
  // applies immediately, otherwise a proposal) - see executeCompanyAgentActions.
  const activeCreed = await resolveActiveCreed(auth.supabase, auth.user);
  const companyEntry = activeCreed?.creeds.find(
    (c) => c.id === activeCreed.creedId && c.type === "company"
  );
  const companyId = companyEntry ? activeCreed!.creedId : undefined;

  // A frozen company is read-only; refuse before spending on a model call.
  if (companyId) {
    const admin = getSupabaseAdminClient();
    if ((await getCompanyAccessState(admin, companyId)) === "frozen") {
      return NextResponse.json(
        { error: "This company Creed is read-only until billing is fixed." },
        { status: 403 }
      );
    }
  }

  // Setup (auth, parse, state, credential) happens before the stream so a
  // setup failure returns a normal JSON error the client can read.
  let payloadForStream: {
    query: string;
    mentioned: string[];
    sections: Array<{ id: string; name: string; content: string; agentPermission: AgentPermissionValue }>;
    archived: Array<{ id: string; name: string }>;
    state: Awaited<ReturnType<typeof loadActiveCreedState>>["state"];
    apiKey: string;
    modelId: string;
    mode: "credits" | "byok";
    reservationId?: string;
    sectionIds: Set<string>;
    archivedIds: Set<string>;
    companyId?: string;
  };
  try {
    const body = (await request.json()) as { query?: unknown; mentioned?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 1000) {
      return NextResponse.json({ error: "Missing or oversized request." }, { status: 400 });
    }

    const { state } = await loadActiveCreedState(auth.supabase, auth.user, activeCreed, {
      proposalLimit: 50,
      activityLimit: 1,
    });
    // The in-app agent is the user's own tool, so it works over every live
    // section it can see (personal: all, including hidden; company: the member's
    // visible sections). How each edit lands (direct vs proposal) is decided
    // per-section in the executor.
    const visible = state.sections.filter((section) => !section.archived);
    const sections = visible.map((section) => ({
      id: section.id,
      name: section.name,
      content: sectionBodyMarkdown(section),
      agentPermission: section.agentPermission as AgentPermissionValue,
    }));
    const archived = state.sections
      .filter((section) => section.archived)
      .map((section) => ({ id: section.id, name: section.name }));
    const sectionIds = new Set(sections.map((section) => section.id));
    const archivedIds = new Set(archived.map((section) => section.id));
    const mentioned = (Array.isArray(body.mentioned) ? body.mentioned : [])
      .filter((id): id is string => typeof id === "string" && sectionIds.has(id))
      .slice(0, 10);

    const credential = companyId
      ? await resolveCompanyAiCredential(companyId, "panel")
      : await resolveAiCredential(auth.supabase, auth.user.id, "panel");
    payloadForStream = {
      query,
      mentioned,
      sections,
      archived,
      state,
      apiKey: credential.apiKey,
      modelId: getAgentModelId(),
      mode: credential.mode,
      reservationId: credential.reservationId,
      sectionIds,
      archivedIds,
      companyId,
    };
  } catch {
    return NextResponse.json(
      { error: "That didn't go through. Try again" },
      { status: 400 }
    );
  }

  const p = payloadForStream;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Stream already closed (client disconnected); ignore.
        }
      };

      try {
        send({ type: "stage", stage: "reading" });
        send({ type: "stage", stage: "planning" });

        const messages = [
          { role: "system" as const, content: buildAgentSystemPrompt() },
          {
            role: "user" as const,
            content: buildAgentUserPrompt({
              query: p.query,
              sections: p.sections,
              archived: p.archived,
              mentioned: p.mentioned,
            }),
          },
        ];
        const responseFormat = buildAgentResponseFormat();

        // Try streaming (live token progress). If the routed provider can't
        // stream structured output - some can't, and it surfaces as an empty
        // stream - fall back to a normal buffered call so the run still
        // completes instead of showing nothing. A user Stop is never retried.
        let tokenCount = 0;
        let lastEmit = 0;
        let startedWriting = false;
        let modelResult;
        try {
          modelResult = await streamOpenRouter({
            apiKey: p.apiKey,
            modelId: p.modelId,
            maxTokens: 16000,
            temperature: 0,
            timeoutMs: 240000,
            responseFormat,
            // Land on the fastest provider (Groq / Cerebras) instead of
            // OpenRouter's cheapest-first default, so edits stream in fast.
            providerPreferences: { sort: "throughput" },
            signal: request.signal,
            messages,
            onDelta: () => {
              tokenCount += 1;
              if (!startedWriting) {
                startedWriting = true;
                send({ type: "stage", stage: "writing" });
              }
              const now = Date.now();
              if (now - lastEmit > 120) {
                lastEmit = now;
                send({ type: "tokens", count: tokenCount });
              }
            },
          });
        } catch (streamError) {
          // Only fall back for the "provider can't stream structured output"
          // case, which surfaces as an empty stream (no tokens). If tokens were
          // already flowing, a failure is a real timeout/network error - retrying
          // the whole call would just run the clock down past maxDuration and
          // fail again, so surface it instead.
          if (request.signal.aborted || tokenCount > 0) throw streamError;
          send({ type: "stage", stage: "writing" });
          modelResult = await callOpenRouter({
            apiKey: p.apiKey,
            modelId: p.modelId,
            maxTokens: 16000,
            temperature: 0,
            timeoutMs: 110000,
            responseFormat,
            providerPreferences: { sort: "throughput" },
            messages,
          });
        }

        // Bill for the spend regardless of what the plan turns out to be.
        let creditBalanceUsd: number | null = null;
        let chargedMicroUsd: number | null = null;
        if (p.mode === "credits") {
          const debit = p.companyId
            ? await deductCompanyCredits({
                creedId: p.companyId,
                spentBy: auth.user.id,
                costUsd: modelResult.costUsd,
                feature: "panel",
                modelId: p.modelId,
                reservationId: p.reservationId,
              })
            : await deductCredits({
                userId: auth.user.id,
                costUsd: modelResult.costUsd,
                feature: "panel",
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
              creedId: p.companyId,
              feature: "panel",
              modelId: p.modelId,
              modelQuality: modelResult.modelQuality,
              inputTokens: modelResult.inputTokens,
              outputTokens: modelResult.outputTokens,
              costUsd: modelResult.costUsd,
              chargedMicroUsd: chargedMicroUsd ?? Math.round(modelResult.costUsd * 1_000_000),
              aiMode: p.mode,
            });
          } catch {
            // Best-effort.
          }
        }

        let parsed: unknown;
        try {
          parsed = parseJsonObject(modelResult.content);
        } catch {
          send({ type: "result", result: { ok: false, reason: "That didn't go through. Try again", summary: "", results: [] } });
          return;
        }
        const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        const modelOk = root.ok === true;
        const reason = typeof root.reason === "string" ? root.reason.trim() : "";
        const summary = typeof root.summary === "string" ? root.summary.trim() : "";
        const actions = modelOk
          ? validateAgentActions(root.actions, { sectionIds: p.sectionIds, archivedIds: p.archivedIds })
          : null;

        if (!modelOk || !actions) {
          const result: AgentResult = { ok: false, reason: reason || "I couldn't do that from here.", summary: "", results: [] };
          send({ type: "result", result });
          return;
        }

        // The user stopped between the model reply and here: don't apply or
        // persist edits they cancelled. Billing already happened (the spend is
        // real), but nothing touches the creed.
        if (request.signal.aborted) return;

        send({ type: "stage", stage: "filing" });
        const execution = p.companyId
          ? await executeCompanyAgentActions({
              user: auth.user,
              creedId: p.companyId,
              actions,
              sections: p.state.sections,
            })
          : await executeAgentActions({ user: auth.user, actions, state: p.state });
        send({ type: "stage", stage: "done" });
        const result: AgentResult = {
          ok: execution.ok,
          reason: execution.reason,
          summary: execution.ok ? summary : "",
          results: execution.results,
        };
        send({ type: "result", result });
      } catch (error) {
        await cancelCreditReservation(p.reservationId);
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Stopped."
            : "That didn't go through. Try again";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
