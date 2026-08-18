import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  resolveAiCredential,
  deductCredits,
  resolveSharedAiCredential,
  deductSharedCredits,
  cancelCreditReservation,
} from "@creed/edition/ai";
import { callOpenRouter, streamOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import {
  agentRequestUsesAnalysis,
  buildAgentPlanningPrompt,
  buildAgentPlanResponseFormat,
  buildAgentRepairPrompt,
  buildAgentResponseFormat,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  explainInvalidAgentActions,
  validateAgentPlan,
  validateAgentSemantics,
  validateAgentActions,
  type AgentAnalysisContext,
  type AgentPermissionValue,
  type AgentResult,
  type AgentStreamEvent,
} from "@/lib/panel/agent";
import { readQualityBaseline } from "@/lib/ai/quality";
import type { OpenRouterCallResult } from "@/lib/ai/openrouter";
import { executeAgentActions, executeSharedAgentActions } from "@/lib/panel/agent-execute";
import { loadActiveCreedState } from "@/lib/creed-backend";
import { resolveActiveCreed } from "@/lib/creed-context";
import { sectionBodyMarkdown } from "@creed/core/creed-data";
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

  // The in-app "Creed" agent works on personal AND shared Creeds. On a shared
  // Creed it behaves identically, attributed to the acting member as "[member]'s
  // Creed", and every edit is enforced per section by sharedMcpWrite (Direct
  // applies immediately, otherwise a proposal) - see executeSharedAgentActions.
  const activeCreed = await resolveActiveCreed(auth.supabase, auth.user);
  const sharedEntry = activeCreed?.creeds.find(
    (c) => c.id === activeCreed.creedId && c.type === "shared"
  );
  const sharedCreedId = sharedEntry ? activeCreed!.creedId : undefined;

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
    sharedCreedId?: string;
    analysis: AgentAnalysisContext[];
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
    // section it can see (personal: all, including hidden; shared: the member's
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

    const credential = sharedCreedId
      ? await resolveSharedAiCredential(sharedCreedId, "panel", auth.user.id)
      : await resolveAiCredential(auth.supabase, auth.user.id, "panel", activeCreed?.creedId);
    let analysis: AgentAnalysisContext[] = [];
    if (agentRequestUsesAnalysis(query)) {
      try {
        const baseline = await readQualityBaseline({
          client: auth.supabase,
          userId: auth.user.id,
          creedId: activeCreed!.creedId,
          sections: visible,
          sharedRead: Boolean(sharedCreedId),
        });
        if (baseline.report) {
          analysis = baseline.report.sections.flatMap((item) => {
            const fresh = baseline.sectionHashes[item.sectionId] === baseline.storedSectionHashes[item.sectionId];
            if (!fresh || (!item.gap && !item.guidance)) return [];
            return [{
              sectionId: item.sectionId,
              score: item.score,
              gap: item.gap ? `${item.gap.title}: ${item.gap.detail}` : "",
              guidance: item.guidance ? `${item.guidance.title}: ${item.guidance.detail}` : "",
            }];
          });
        }
      } catch {
        // Analysis is optional context. A stale or unavailable report must not
        // prevent the Agent from completing the user's request.
      }
    }
    payloadForStream = {
      query,
      mentioned,
      sections,
      archived,
      state,
      apiKey: credential.apiKey,
      modelId: credential.modelId,
      mode: credential.mode,
      reservationId: credential.reservationId,
      sectionIds,
      archivedIds,
      sharedCreedId,
      analysis,
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

        const commonCall = {
          apiKey: p.apiKey,
          modelId: p.modelId,
          reasoning: { effort: "medium", exclude: true },
          seed: 0,
          providerPreferences: {
            sort: "throughput",
            require_parameters: true,
            data_collection: "deny",
          },
        } as const;
        const spend: OpenRouterCallResult[] = [];
        const planningMessages = [
          { role: "system" as const, content: buildAgentSystemPrompt() },
          {
            role: "user" as const,
            content: buildAgentPlanningPrompt({
              query: p.query,
              sections: p.sections,
              archived: p.archived,
              mentioned: p.mentioned,
            }),
          },
        ];
        const planningResult = await callOpenRouter({
          ...commonCall,
          maxTokens: 2400,
          timeoutMs: 90000,
          responseFormat: buildAgentPlanResponseFormat(),
          messages: planningMessages,
        });
        spend.push(planningResult);
        let planningParsed: unknown;
        try {
          planningParsed = parseJsonObject(planningResult.content);
        } catch {
          planningParsed = null;
        }
        let plan = validateAgentPlan(planningParsed, { sectionIds: p.sectionIds, archivedIds: p.archivedIds });
        if (!plan) {
          const repairedPlan = await callOpenRouter({
            ...commonCall,
            maxTokens: 2400,
            timeoutMs: 90000,
            responseFormat: buildAgentPlanResponseFormat(),
            messages: [
              ...planningMessages,
              { role: "assistant" as const, content: planningResult.content },
              { role: "user" as const, content: buildAgentRepairPrompt({ content: planningResult.content, error: "target plan did not match the required schema or referenced an unknown section" }) },
            ],
          });
          spend.push(repairedPlan);
          try {
            plan = validateAgentPlan(parseJsonObject(repairedPlan.content), { sectionIds: p.sectionIds, archivedIds: p.archivedIds });
          } catch {
            plan = null;
          }
        }
        if (!plan?.ok) {
          send({ type: "result", result: { ok: false, reason: plan?.reason || "I couldn't plan that safely.", summary: "", results: [] } });
          return;
        }
        const messages = [
          { role: "system" as const, content: buildAgentSystemPrompt() },
          { role: "user" as const, content: buildAgentUserPrompt({
            query: p.query,
            sections: p.sections,
            archived: p.archived,
            mentioned: p.mentioned,
            plan,
            analysis: p.analysis.filter((item) => plan.targetSectionIds.includes(item.sectionId)),
          }) },
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
            ...commonCall,
            maxTokens: 16000,
            timeoutMs: 240000,
            responseFormat,
            // Stream the full drafting pass after the smaller target plan.
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
            ...commonCall,
            maxTokens: 16000,
            timeoutMs: 110000,
            responseFormat,
            messages,
          });
        }
        spend.push(modelResult);

        const parseActions = (content: string) => {
          let parsed: unknown;
          try { parsed = parseJsonObject(content); } catch { return { root: {}, actions: null, error: "response was not valid JSON", repairable: true }; }
          const root = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
          if (root.ok !== true) return { root, actions: null, error: typeof root.reason === "string" ? root.reason : "model declined the request", repairable: false };
          const actions = validateAgentActions(root.actions, { sectionIds: p.sectionIds, archivedIds: p.archivedIds });
          const error = actions
            ? validateAgentSemantics(actions, p.sections, p.query)
            : explainInvalidAgentActions(root.actions, { sectionIds: p.sectionIds, archivedIds: p.archivedIds });
          return { root, actions: error ? null : actions, error: error ?? "", repairable: Boolean(error) };
        };
        let checked = parseActions(modelResult.content);
        if (!checked.actions && checked.repairable) {
          const repairResult = await callOpenRouter({
            ...commonCall,
            maxTokens: 16000,
            timeoutMs: 110000,
            responseFormat,
            messages: [...messages, { role: "assistant" as const, content: modelResult.content }, { role: "user" as const, content: buildAgentRepairPrompt({ content: modelResult.content, error: checked.error }) }],
          });
          spend.push(repairResult);
          modelResult = repairResult;
          checked = parseActions(repairResult.content);
        }

        const totals = spend.reduce((sum, item) => ({
          inputTokens: sum.inputTokens + item.inputTokens,
          outputTokens: sum.outputTokens + item.outputTokens,
          costUsd: sum.costUsd + item.costUsd,
        }), { inputTokens: 0, outputTokens: 0, costUsd: 0 });

        // Bill for the spend regardless of what the plan turns out to be.
        let creditBalanceUsd: number | null = null;
        let chargedMicroUsd: number | null = null;
        if (p.mode === "credits") {
          const debit = p.sharedCreedId
            ? await deductSharedCredits({
                creedId: p.sharedCreedId,
                spentBy: auth.user.id,
                costUsd: totals.costUsd,
                feature: "panel",
                modelId: p.modelId,
                reservationId: p.reservationId,
              })
            : await deductCredits({
                userId: auth.user.id,
                costUsd: totals.costUsd,
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
              creedId: p.sharedCreedId,
              feature: "panel",
              modelId: p.modelId,
              modelQuality: modelResult.modelQuality,
              inputTokens: totals.inputTokens,
              outputTokens: totals.outputTokens,
              costUsd: totals.costUsd,
              chargedMicroUsd: chargedMicroUsd ?? Math.round(totals.costUsd * 1_000_000),
              aiMode: p.mode,
            });
          } catch {
            // Best-effort.
          }
        }

        const root = checked.root;
        const modelOk = root.ok === true;
        const reason = typeof root.reason === "string" ? root.reason.trim() : "";
        const summary = typeof root.summary === "string" ? root.summary.trim() : "";
        const actions = modelOk ? checked.actions : null;

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
        const execution = p.sharedCreedId
          ? await executeSharedAgentActions({
              user: auth.user,
              creedId: p.sharedCreedId,
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
