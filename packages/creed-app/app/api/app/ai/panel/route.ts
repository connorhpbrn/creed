import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  resolveAiCredential,
  deductCredits,
  resolveSharedAiCredential,
  deductSharedCredits,
  cancelCreditReservation,
} from "@creed/edition/ai";
import { callOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import { resolveActiveCreed } from "@/lib/creed-context";
import { loadActiveCreedState } from "@/lib/creed-backend";
import {
  buildAskMessages,
  buildPanelResponseFormat,
  buildPanelSystemPrompt,
  buildPanelUserPrompt,
  validatePanelActions,
  resolvePanelAnswerReferences,
  type PanelMode,
  type PanelProposalSummary,
  type PanelResult,
  type PanelSectionSummary,
  type PanelTurn,
} from "@/lib/panel/actions";
import { permissionIsReadable, sectionBodyMarkdown } from "@creed/core/creed-data";
import { checkRateLimit } from "@/lib/rate-limit";

// Panel's Search + Ask resolve in a single fast call; a minute is generous
// headroom, not a target - the client aborts long before this.
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({
    scope: "ai-panel",
    identifier: auth.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many panel requests." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let reservationId: string | undefined;
  try {
    const body = (await request.json()) as {
      mode?: string;
      query?: string;
      page?: string;
      mentioned?: unknown;
      history?: unknown;
    };

    const mode: PanelMode = body.mode === "ask" ? "ask" : "search";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 1000) {
      return NextResponse.json({ error: "Missing or oversized query." }, { status: 400 });
    }
    const page = typeof body.page === "string" ? body.page : "/file";
    const history: PanelTurn[] = (Array.isArray(body.history) ? body.history : [])
      .slice(-4)
      .filter(
        (turn): turn is PanelTurn =>
          !!turn &&
          typeof turn === "object" &&
          (turn as PanelTurn).role !== undefined &&
          typeof (turn as PanelTurn).text === "string"
      )
      .map((turn) => ({ role: turn.role === "assistant" ? "assistant" : "user", text: turn.text }));

    // Never trust the client for section content or permissions: load the
    // authoritative state and build the prompt from it. The client only says
    // what to look at (query, mentions, history). Hidden and archived sections
    // are excluded here, so the confidentiality boundary holds regardless of
    // what the caller sends.
    // Load the active Creed (personal or shared). Shared state is
    // permission-filtered (Hidden sections already stripped) so the panel
    // respects the member's access, and AI meters on the shared's credits.
    const active = await resolveActiveCreed(auth.supabase, auth.user);
    const sharedCreedId =
      active && active.creeds.find((c) => c.id === active.creedId)?.type === "shared"
        ? active.creedId
        : null;
    const { state } = await loadActiveCreedState(auth.supabase, auth.user, active, {
      proposalLimit: 50,
      activityLimit: 1,
    });
    const sections: PanelSectionSummary[] = state.sections
      .filter((section) => !section.archived && permissionIsReadable(section.agentPermission))
      .map((section) => ({
        id: section.id,
        name: section.name,
        accent: section.accent,
        content: sectionBodyMarkdown(section),
      }));
    // Pending proposals let the navigator resolve "open the proposal about X".
    // Only metadata (never section content) reaches the model.
    const proposals: PanelProposalSummary[] = state.proposals
      .filter((proposal) => proposal.status === "pending")
      .slice(0, 100)
      .map((proposal) => ({
        id: proposal.id,
        sectionName: proposal.sectionName,
        agentName: proposal.agentName,
        reason: proposal.reason,
      }));

    const sectionIds = new Set(sections.map((section) => section.id));
    const mentioned = (Array.isArray(body.mentioned) ? body.mentioned : [])
      .filter((id): id is string => typeof id === "string" && sectionIds.has(id))
      .slice(0, 10);

    // Ask carries the prior turns as real chat messages (in-chat memory);
    // Search is a single self-contained request.
    const messages =
      mode === "ask"
        ? [
            { role: "system" as const, content: buildPanelSystemPrompt("ask") },
            ...buildAskMessages({ query, page, sections, proposals, mentioned, history }),
          ]
        : [
            { role: "system" as const, content: buildPanelSystemPrompt("search") },
            {
              role: "user" as const,
              content: buildPanelUserPrompt({ mode, query, page, sections, proposals, mentioned }),
            },
          ];

    const credential = sharedCreedId
      ? await resolveSharedAiCredential(sharedCreedId, "panel", auth.user.id)
      : await resolveAiCredential(auth.supabase, auth.user.id, "panel", active?.creedId);
    reservationId = credential.reservationId;
    const result = await callOpenRouter({
      apiKey: credential.apiKey,
      modelId: credential.modelId,
      maxTokens: mode === "ask" ? 1600 : 900,
      timeoutMs: 25000,
      responseFormat: buildPanelResponseFormat(),
      // Search and Ask are short interactive tasks. Disable reasoning so Luna
      // starts immediately, and keep routing on the fastest compliant endpoint.
      reasoning: { effort: "none", exclude: true },
      seed: 0,
      providerPreferences: {
        sort: "throughput",
        require_parameters: true,
        data_collection: "deny",
      },
      messages,
    });

    // Parse before billing, so a malformed reply never charges the user.
    let parsed: unknown;
    try {
      parsed = parseJsonObject(result.content);
    } catch {
      throw new Error("That didn't go through. Try again");
    }

    const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const modelOk = root.ok === true;
    const reason = typeof root.reason === "string" ? root.reason.trim() : "";
    const rawAnswer = typeof root.answer === "string" ? root.answer.trim() : "";
    const resolved =
      mode === "ask"
        ? resolvePanelAnswerReferences(rawAnswer, root.references, sections)
        : { answer: rawAnswer, references: [] };
    const { answer, references } = resolved;

    const actions = modelOk
      ? validatePanelActions(root.actions, {
          sectionIds,
          proposalIds: new Set(proposals.map((proposal) => proposal.id)),
        })
      : null;
    // Ask can answer with no actions (a pure answer); Search must produce a
    // plan. So Ask is ok if it has an answer OR valid actions; Search needs a
    // non-empty validated plan.
    const ok =
      modelOk &&
      (mode === "ask" ? Boolean(answer) || (actions?.length ?? 0) > 0 : (actions?.length ?? 0) > 0);

    let creditBalanceUsd: number | null = null;
    let chargedMicroUsd: number | null = null;
    if (credential.mode === "credits") {
      const debit = sharedCreedId
        ? await deductSharedCredits({
            creedId: sharedCreedId,
            spentBy: auth.user.id,
            costUsd: result.costUsd,
            feature: "panel",
            modelId: credential.modelId,
            reservationId: credential.reservationId,
          })
        : await deductCredits({
            userId: auth.user.id,
            costUsd: result.costUsd,
            feature: "panel",
            modelId: credential.modelId,
            reservationId: credential.reservationId,
          });
      if (debit) {
        creditBalanceUsd = debit.balanceUsd;
        chargedMicroUsd = debit.chargedMicroUsd;
      }
    }

    if (credential.mode === "byok" || creditBalanceUsd !== null) {
      try {
        await recordAiUsage({
          client: auth.supabase,
          userId: auth.user.id,
          creedId: sharedCreedId,
          feature: "panel",
          modelId: credential.modelId,
          modelQuality: result.modelQuality,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          chargedMicroUsd: chargedMicroUsd ?? Math.round(result.costUsd * 1_000_000),
          aiMode: credential.mode,
        });
      } catch {
        // Best-effort; a completed, charged call must not fail on a log hiccup.
      }
    }

    const payload: PanelResult = {
      ok,
      reason: ok
        ? ""
        : reason ||
          (mode === "ask"
            ? "I couldn't work that one out. Try rephrasing."
            : "Couldn't find anything for that."),
      answer: ok ? answer : "",
      references: ok ? references : [],
      actions: ok ? actions ?? [] : [],
    };
    return NextResponse.json(payload);
  } catch {
    await cancelCreditReservation(reservationId);
    return NextResponse.json(
      { error: "That didn't go through. Try again" },
      { status: 400 }
    );
  }
}
