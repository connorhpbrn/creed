import { NextResponse } from "next/server";
import {
  ACCENT_KEYS,
  getMetaProposalDiffText,
  getProposalPreviewText,
  isAccentKey,
  normalizeLegacyAccent,
  normalizeLegacyProposalDraft,
  normalizeLegacySectionId,
  normalizeProposalForSection,
  type Proposal,
} from "@/lib/creed-data";
import { findUserIdByProposalToken, loadCreedState, recordConnectionUsage } from "@/lib/creed-backend";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

type ProposalSubmission = Omit<Proposal, "timeLabel" | "status" | "accent"> & {
  accent?: Proposal["accent"];
  integration?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin configuration is missing." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const proposalToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!proposalToken) {
    return NextResponse.json(
      { error: "Missing proposal token. Send via Authorization: Bearer <token>." },
      { status: 401 }
    );
  }

  const verdict = checkRateLimit({
    scope: "creed-proposals",
    identifier: proposalToken,
    limit: 60,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const admin = getSupabaseAdminClient();
  const userId = await findUserIdByProposalToken(admin as never, proposalToken);

  if (!userId) {
    return NextResponse.json({ error: "Invalid proposal token." }, { status: 401 });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ error: userError?.message ?? "Could not load token owner." }, { status: 500 });
  }

  // Proposals route only validates against sections + tokens. Skip pulling
  // 500 historical proposals / activity rows that nothing here looks at.
  const { state } = await loadCreedState(admin as never, userData.user, {
    proposalLimit: 1,
    activityLimit: 1,
  });

  const submittedBody = (await request.json()) as ProposalSubmission;
  const normalizedDraft = submittedBody.draft
    ? normalizeLegacyProposalDraft(submittedBody.draft)
    : submittedBody.draft;
  const draftKind = normalizedDraft?.kind;

  // Categorisation defaults — applied to every draft kind, not just meta
  // operations. `changeType` / `impact` / `confidence` are bookkeeping
  // fields that drive the activity sidebar's labelling; agents that omit
  // them shouldn't be forced into a 400. The per-kind table below picks
  // sensible defaults that match what well-behaved agents have been
  // sending anyway. Reason text is similarly defaulted per kind so the
  // activity row always has something to display.
  const KIND_DEFAULTS: Record<
    string,
    { changeType: string; impact: string; confidence: string; reason: string }
  > = {
    "rich-text": {
      changeType: "refines-existing",
      impact: "future-responses",
      confidence: "repeated",
      reason: "Captured durable context worth remembering.",
    },
    "new-section": {
      changeType: "new-memory",
      impact: "future-responses",
      confidence: "durable",
      reason: "Captured useful context that didn't fit an existing section.",
    },
    "delete-section": {
      changeType: "refines-existing",
      impact: "future-responses",
      confidence: "durable",
      reason: "Section is no longer useful.",
    },
    "rename-section": {
      changeType: "refines-existing",
      impact: "future-responses",
      confidence: "durable",
      reason: "Clearer name.",
    },
    "recolor-section": {
      changeType: "refines-existing",
      impact: "future-responses",
      confidence: "durable",
      reason: "Better-matching accent.",
    },
    "reorder-section": {
      changeType: "refines-existing",
      impact: "future-responses",
      confidence: "durable",
      reason: "Better-flowing section order.",
    },
  };
  const fallback = (draftKind && KIND_DEFAULTS[draftKind]) || KIND_DEFAULTS["rich-text"];

  const body = {
    ...submittedBody,
    sectionId: submittedBody.sectionId ? normalizeLegacySectionId(submittedBody.sectionId) : submittedBody.sectionId,
    sectionName: submittedBody.sectionId === "conventions" ? "Operating Principles" : submittedBody.sectionName,
    accent: submittedBody.accent ? normalizeLegacyAccent(submittedBody.accent) : submittedBody.accent,
    draft: normalizedDraft,
    changeType: submittedBody.changeType || fallback.changeType,
    impact: submittedBody.impact || fallback.impact,
    confidence: submittedBody.confidence || fallback.confidence,
    reason: submittedBody.reason || fallback.reason,
  };
  if (
    !body.id ||
    !body.sectionId ||
    !body.sectionName ||
    !body.agentName ||
    !body.draft
  ) {
    return NextResponse.json({ error: "Malformed proposal." }, { status: 400 });
  }

  // Under the unified model: every existing section accepts rich-text proposals,
  // and "new-section" creates a brand new section. The draft kind tells us which
  // path to take; no per-section-id kind matching needed any more.
  const targetSection = state.sections.find((section) => section.id === body.sectionId);
  const isNewSectionProposal = body.sectionId === "new-section";

  if (!isNewSectionProposal && !targetSection) {
    return NextResponse.json(
      {
        error: `Unknown section target ${body.sectionId}. Existing sections: ${state.sections.map((section) => section.id).join(", ") || "none"}.`,
      },
      { status: 400 }
    );
  }

  if (isNewSectionProposal && body.draft.kind !== "new-section") {
    return NextResponse.json(
      { error: "Proposal targeting new-section requires draft.kind = \"new-section\"." },
      { status: 400 }
    );
  }

  // Existing sections accept rich-text content updates plus four meta
  // operations: delete-section, rename-section, recolor-section, reorder-section.
  // Anything else is rejected with a clear error.
  const acceptedExistingKinds = new Set([
    "rich-text",
    "delete-section",
    "rename-section",
    "recolor-section",
    "reorder-section",
  ]);
  if (!isNewSectionProposal && !acceptedExistingKinds.has(body.draft.kind)) {
    return NextResponse.json(
      {
        error:
          'Proposals against existing sections require draft.kind to be one of: "rich-text", "delete-section", "rename-section", "recolor-section", "reorder-section".',
      },
      { status: 400 }
    );
  }

  // Validate the new meta-operation drafts.
  if (body.draft.kind === "rename-section") {
    const next = (body.draft as { name?: unknown }).name;
    if (typeof next !== "string" || !next.trim()) {
      return NextResponse.json(
        { error: "rename-section proposals require a non-empty draft.name." },
        { status: 400 }
      );
    }
  }
  if (body.draft.kind === "recolor-section") {
    const accent = (body.draft as { accent?: unknown }).accent;
    if (!isAccentKey(accent)) {
      return NextResponse.json(
        {
          error: `recolor-section proposals require draft.accent to be one of: ${ACCENT_KEYS.join(", ")}.`,
        },
        { status: 400 }
      );
    }
  }
  if (body.draft.kind === "new-section") {
    const newAccent = (body.draft as { accent?: unknown }).accent;
    if (newAccent !== undefined && !isAccentKey(newAccent)) {
      return NextResponse.json(
        {
          error: `new-section proposals with an accent require one of: ${ACCENT_KEYS.join(", ")}.`,
        },
        { status: 400 }
      );
    }
  }
  if (body.draft.kind === "reorder-section") {
    const reorderDraft = body.draft as {
      afterSectionId?: unknown;
      position?: unknown;
    };
    const hasAfter =
      typeof reorderDraft.afterSectionId === "string" && reorderDraft.afterSectionId.trim();
    const hasPosition =
      reorderDraft.position === "first" || reorderDraft.position === "last";
    if (!hasAfter && !hasPosition) {
      return NextResponse.json(
        {
          error:
            'reorder-section proposals require either draft.afterSectionId or draft.position ("first" | "last").',
        },
        { status: 400 }
      );
    }
    if (hasAfter && hasPosition) {
      return NextResponse.json(
        {
          error:
            "reorder-section proposals require exactly one of draft.afterSectionId or draft.position, not both.",
        },
        { status: 400 }
      );
    }
    if (hasAfter) {
      const targetId = reorderDraft.afterSectionId as string;
      if (targetId === body.sectionId) {
        return NextResponse.json(
          { error: "reorder-section.afterSectionId cannot be the section being moved." },
          { status: 400 }
        );
      }
      const found = state.sections.some((section) => section.id === targetId);
      if (!found) {
        return NextResponse.json(
          {
            error: `reorder-section.afterSectionId "${targetId}" doesn't exist. Available: ${state.sections.map((s) => s.id).join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }
  }

  if (!isNewSectionProposal && targetSection && !targetSection.agentWritable) {
    return NextResponse.json(
      { error: `Section ${targetSection.id} is not agent-writable.` },
      { status: 403 }
    );
  }

  const normalizedProposal = normalizeProposalForSection(
    {
      ...body,
      accent: body.accent ?? "custom",
      status: "pending",
      timeLabel: "just now",
    },
    targetSection
  );

  const now = new Date().toISOString();
  const baseRevision = body.sectionId === "new-section" ? null : (state.sectionRevisions[body.sectionId] ?? null);
  const proposalRow = {
    id: body.id,
    user_id: userId,
    section_id: body.sectionId,
    section_name: body.sectionName,
    accent: normalizedProposal.accent,
    agent_name: body.agentName,
    change_type: body.changeType,
    reason: body.reason,
    impact: body.impact,
    confidence: body.confidence,
    draft: normalizedProposal.draft,
    status: "pending",
    base_revision: baseRevision,
    created_at: now,
    updated_at: now,
  };

  // For meta proposals (delete / rename / recolor), the activity diff
  // should compare like-for-like labels — not the section's entire content
  // against a one-line summary, which renders as if everything was deleted.
  const metaDiff = getMetaProposalDiffText(normalizedProposal.draft, targetSection);
  const summaryByMetaKind: Record<string, string> = {
    "delete-section": `Suggested deleting ${body.sectionName.toLowerCase()}`,
    "rename-section": `Suggested renaming ${body.sectionName.toLowerCase()}`,
    "recolor-section": `Suggested recolouring ${body.sectionName.toLowerCase()}`,
    "reorder-section": `Suggested moving ${body.sectionName.toLowerCase()}`,
  };

  const activityRow = {
    id: `activity-${body.id}`,
    user_id: userId,
    proposal_id: body.id,
    section_id: body.sectionId,
    section_name: body.sectionName,
    accent: normalizedProposal.accent,
    actor: body.agentName,
    actor_type: "agent",
    summary:
      summaryByMetaKind[normalizedProposal.draft.kind] ??
      `Suggested ${body.sectionName.toLowerCase()} update`,
    status: "pending",
    change_type: body.changeType,
    reason: body.reason,
    impact: body.impact,
    confidence: body.confidence,
    // Snapshot the existing section content so the activity sidebar can
    // render the same red/green diff the inline accept-all card shows. Meta
    // drafts get short labels on both sides so the diff stays proportional.
    before_text: metaDiff
      ? metaDiff.before
      : !isNewSectionProposal
        ? targetSection?.content ?? null
        : null,
    after_text: metaDiff ? metaDiff.after : getProposalPreviewText(normalizedProposal.draft),
    created_at: now,
  };

  const proposalTable = admin.from("creed_proposals") as unknown as {
    upsert: (
      values: typeof proposalRow,
      options: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error: proposalError } = await proposalTable.upsert(proposalRow, {
    onConflict: "id",
  });
  if (proposalError) {
    return NextResponse.json({ error: proposalError.message }, { status: 500 });
  }

  const activityTable = admin.from("creed_activity") as unknown as {
    upsert: (
      values: typeof activityRow,
      options: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error: activityError } = await activityTable.upsert(activityRow, {
    onConflict: "id",
  });
  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  await recordConnectionUsage(admin as never, userId, body.integration, body.agentName, "proposal");
  return NextResponse.json({ ok: true });
}
