import "server-only";
import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";
import { getCompanyBilling } from "@/lib/company-billing";
import {
  resolveSectionPermission,
  deriveCompanyAccessState,
  canApproveProposal,
  canManageSectionsLifecycle,
  minPermission,
  type CreedRole,
} from "@/lib/creed-permissions";
import {
  normalizeLegacyProposalDraft,
  type AgentPermission,
  type ProposalDraft,
} from "@/lib/creed-data";
import { actorLabel } from "@/lib/creed-attribution";
import { getDisplayName } from "@/lib/user-name";
import {
  normalizeRichTextInput,
  removeSectionReferences,
  richTextContentEquivalent,
} from "@/lib/rich-text";

// Write path for company Creeds.
//
// Company section writes never go through the personal full-state PUT. They go
// through these functions (called by /api/app/sections/* for humans in the app,
// and by /app/mcp for connected agents), which run on the service-role admin
// client AFTER an app-level permission check:
//   - membership + effective section permission (owner/admin = direct; member =
//     their override or direct; an agent is capped again by the member's own
//     per-section agent ceiling),
//   - the billing freeze gate (frozen company = read-only),
//   - baseRevision optimistic concurrency for human edits (409 on mismatch),
// and record a version row (creed_section_versions) + an activity row on every
// change. A caller who lacks Direct edit on a section files a proposal instead.
//
// The permission lattice, the direct-vs-proposal routing, and the draft
// vocabulary are identical to the personal Creed, so an agent connected to a
// company Creed sees exactly the same tools and behaviour as on a personal one.
// Every action is attributed via lib/creed-attribution: a human logs their name,
// an agent logs "[member]'s [agent]".

const MAX_VERSIONS_PER_SECTION = 200;

export type SectionWriteError = {
  ok: false;
  code:
    | "forbidden"
    | "frozen"
    | "conflict"
    | "not_found"
    | "exists"
    | "failed"
    | "stale";
  error: string;
  currentRevision?: number;
};
export type SectionWriteOk = {
  ok: true;
  revision: number;
  filedProposal?: boolean;
  // Set when a proposal was filed, so callers (e.g. the panel agent) can link
  // the result card to the pending proposal.
  proposalId?: string;
  // Set by proposal accepts so the client can reconcile the affected section
  // from the response instead of refetching the whole Creed state.
  sectionId?: string;
  sectionName?: string;
  accent?: string;
  contentHtml?: string;
};
export type SectionWriteResult = SectionWriteOk | SectionWriteError;

/** Result of creating a section: the resolved id + metadata on success. */
export type SectionCreateResult =
  | { ok: true; sectionId: string; revision: number; name: string; accent: string }
  | SectionWriteError;

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

async function companyAccess(
  creedId: string,
): Promise<"active" | "past_due" | "frozen"> {
  const billing = await getCompanyBilling(creedId);
  return deriveCompanyAccessState(billing?.status);
}

function memberName(user: User): string {
  return getDisplayName(user, "Someone");
}

type ActorType = "user" | "agent";
type WriteCause =
  | "manual"
  | "mcp"
  | "proposal"
  | "import"
  | "onboarding"
  | "restore";

type Actor = {
  userId: string;
  actorType: ActorType;
  // The connected agent's name for agent actions, null for human actions.
  agentName: string | null;
  // The rendered attribution: "Fergus" (human) or "Fergus's Claude Code" (agent).
  label: string;
};

/**
 * Resolve the attribution for a write. A non-null `agentName` marks an agent
 * action; otherwise it is a human action. Mirrors lib/creed-attribution so the
 * activity drawer, version rows, and proposal list all agree.
 */
function describeActor(user: User, agentName: string | null): Actor {
  const name = agentName?.trim() || null;
  const isAgent = Boolean(name);
  return {
    userId: user.id,
    actorType: isAgent ? "agent" : "user",
    agentName: isAgent ? name : null,
    label: actorLabel({
      actorType: isAgent ? "agent" : "user",
      userName: memberName(user),
      agentName: name,
    }),
  };
}

/**
 * The caller's effective permission on a section. Owner/admin resolve to Direct;
 * a member gets their per-section override (or Direct by default). When acting
 * as an agent, the result is capped again by the member's own per-section agent
 * ceiling (creed_member_agent_permissions; no row = "propose"). That table is
 * stored unclamped, so the min here is what actually holds - an agent can never
 * exceed its member (non-negotiable #9).
 */
async function effectivePermission(
  creedId: string,
  userId: string,
  sectionId: string,
  role: CreedRole,
  asAgent: boolean,
): Promise<AgentPermission> {
  const db = admin();
  const memberPermissionPromise = role === "owner" || role === "admin"
    ? Promise.resolve({ data: null })
    : db
      .from("creed_member_section_permissions")
      .select("permission")
      .eq("creed_id", creedId)
      .eq("user_id", userId)
      .eq("section_id", sectionId)
      .maybeSingle();
  const agentPermissionPromise = asAgent
    ? db
        .from("creed_member_agent_permissions")
        .select("permission")
        .eq("creed_id", creedId)
        .eq("user_id", userId)
        .eq("section_id", sectionId)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const [{ data: memberRow }, { data: agentRow }] = await Promise.all([
    memberPermissionPromise,
    agentPermissionPromise,
  ]) as [
    { data: { permission: AgentPermission } | null },
    { data: { permission: AgentPermission } | null },
  ];
  const ceiling = resolveSectionPermission(role, memberRow?.permission);
  if (!asAgent) return ceiling;
  return minPermission(ceiling, agentRow?.permission ?? "propose");
}

async function writeVersion(params: {
  creedId: string;
  sectionId: string;
  revision: number;
  name: string;
  accent: string;
  content: string;
  actorUserId: string;
  actorType: ActorType;
  agentName: string | null;
  cause: WriteCause;
}): Promise<void> {
  const db = admin();
  const { error } = await db.from("creed_section_versions").insert({
    creed_id: params.creedId,
    section_id: params.sectionId,
    revision: params.revision,
    name: params.name,
    accent: params.accent,
    content: params.content,
    actor_user_id: params.actorUserId,
    actor_type: params.actorType,
    agent_name: params.agentName,
    cause: params.cause,
  });
  if (error) {
    throw new Error(error.message);
  }
  // Lazy prune every 20 revisions: keep the latest MAX_VERSIONS_PER_SECTION. Fetch the newest
  // MAX+1 ids; if a (MAX+1)th exists, delete it and everything older (<= its id),
  // leaving exactly the newest MAX. Avoids offset/range (not on the query shim).
  if (params.revision % 20 !== 0) return;
  const { data: recent } = (await db
    .from("creed_section_versions")
    .select("id")
    .eq("creed_id", params.creedId)
    .eq("section_id", params.sectionId)
    .order("id", { ascending: false })
    .limit(MAX_VERSIONS_PER_SECTION + 1)) as {
    data: Array<{ id: number }> | null;
  };
  if (recent && recent.length > MAX_VERSIONS_PER_SECTION) {
    const cutoff = recent[MAX_VERSIONS_PER_SECTION].id;
    await db
      .from("creed_section_versions")
      .delete()
      .eq("creed_id", params.creedId)
      .eq("section_id", params.sectionId)
      .lte("id", cutoff);
  }
}

async function writeActivity(params: {
  creedId: string;
  sectionId: string | null;
  sectionName: string | null;
  accent: string | null;
  actorUserId: string;
  actorType: ActorType;
  actorName: string;
  summary: string;
  status: string;
  eventKind: string;
  // Links the activity row to a live proposal so the sidebar renders it as the
  // pending proposal (pending rows without a link are filtered out).
  proposalId?: string | null;
  beforeText?: string | null;
  afterText?: string | null;
}): Promise<void> {
  const db = admin();
  const { error } = await db.from("creed_activity").insert({
    id: randomBytes(16).toString("hex"),
    creed_id: params.creedId,
    user_id: params.actorUserId,
    actor_user_id: params.actorUserId,
    proposal_id: params.proposalId ?? null,
    section_id: params.sectionId,
    section_name: params.sectionName,
    accent: params.accent,
    actor: params.actorName,
    actor_type: params.actorType,
    summary: params.summary,
    status: params.status,
    event_kind: params.eventKind,
    after_text: params.afterText ?? null,
    before_text: params.beforeText ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

type SectionRow = {
  section_id: string;
  kind: string;
  name: string;
  accent: string;
  payload: { content?: string } & Record<string, unknown>;
  revision: number;
};

// ---------------------------------------------------------------------------
// Draft vocabulary + application. A change to a company Creed - whether applied
// directly or via an accepted proposal - is one of these four drafts, stored
// verbatim in creed_proposals.draft (jsonb). rich-text carries any of content /
// name / accent so a content edit, rename, and recolour share one path.
// ---------------------------------------------------------------------------

export type CompanyDraft =
  | { kind: "rich-text"; contentHtml?: string; name?: string; accent?: string }
  | {
      kind: "new-section";
      name: string;
      contentHtml: string;
      accent?: string;
      insertAfterSectionId?: string | null;
    }
  | { kind: "delete-section" }
  | {
      kind: "reorder-section";
      afterSectionId?: string | null;
      position?: "first" | "last";
    };

type ApplyResult =
  | {
      ok: true;
      sectionId: string;
      sectionName: string;
      accent: string;
      revision: number;
      before: string;
      after: string;
      noop?: boolean;
    }
  | { ok: false; code: "not_found" | "failed"; error: string };

/** The visible section ids in display order (used to renumber on create/move). */
async function orderedSectionIds(creedId: string): Promise<string[]> {
  const db = admin();
  const { data } = (await db
    .from("creed_sections")
    .select("section_id, position")
    .eq("creed_id", creedId)
    .is("deleted_at", null)
    .order("position", { ascending: true })) as {
    data: Array<{ section_id: string }> | null;
  };
  return (data ?? []).map((row) => row.section_id);
}

/** Rewrite every listed section's position to its index (0..N-1). */
async function renumberSections(
  creedId: string,
  orderedIds: string[],
  now: string,
): Promise<void> {
  const db = admin();
  const { error } = await db.rpc("update_creed_section_positions", {
    p_creed_id: creedId,
    p_section_ids: orderedIds,
    p_updated_at: now,
  });
  if (error) throw new Error(error.message);
}

async function deleteSectionRows(
  creedId: string,
  sectionId: string,
  targetName: string,
  actor: Actor,
  cause: WriteCause,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = admin();
  const now = new Date().toISOString();
  const { data: rows, error: loadError } = (await db
    .from("creed_sections")
    .select("section_id, kind, name, accent, payload, revision")
    .eq("creed_id", creedId)
    .is("deleted_at", null)) as {
    data: SectionRow[] | null;
    error?: { message: string } | null;
  };
  if (loadError) return { ok: false, error: loadError.message };

  for (const row of rows ?? []) {
    if (row.section_id === sectionId) continue;
    const before = row.payload.content ?? "";
    const content = removeSectionReferences(before, {
      id: sectionId,
      name: targetName,
    });
    if (content === before) continue;

    const revision = row.revision + 1;
    const { error } = await db
      .from("creed_sections")
      .update({
        payload: { ...row.payload, content },
        revision,
        last_edited_by: actor.label,
        last_edited_type: actor.actorType,
        last_edited_at: now,
        updated_at: now,
      })
      .eq("creed_id", creedId)
      .eq("section_id", row.section_id);
    if (error) return { ok: false, error: error.message };

    try {
      await writeVersion({
        creedId,
        sectionId: row.section_id,
        revision,
        name: row.name,
        accent: row.accent,
        content,
        actorUserId: actor.userId,
        actorType: actor.actorType,
        agentName: actor.agentName,
        cause,
      });
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not version section-reference cleanup.",
      };
    }
  }

  const cleanupTargets = [
    "creed_section_versions",
    "creed_member_section_permissions",
    "creed_proposals",
    "creed_activity",
  ];

  const cleanupResults = await Promise.all(
    cleanupTargets.map((table) =>
      db
        .from(table)
        .delete()
        .eq("creed_id", creedId)
        .eq("section_id", sectionId),
    ),
  );
  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) return { ok: false, error: cleanupError.message };

  const { error } = await db
    .from("creed_sections")
    .delete()
    .eq("creed_id", creedId)
    .eq("section_id", sectionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Move `target` within `ids` to just after `afterId`, or to first/last. */
function moveInOrder(
  ids: string[],
  target: string,
  afterId: string | null | undefined,
  position: "first" | "last" | undefined,
): string[] {
  const without = ids.filter((id) => id !== target);
  if (position === "first") return [target, ...without];
  if (position === "last") return [...without, target];
  const anchorIndex = afterId ? without.indexOf(afterId) : -1;
  if (anchorIndex === -1) return [...without, target];
  const out = [...without];
  out.splice(anchorIndex + 1, 0, target);
  return out;
}

/**
 * Apply a draft to the canonical section rows and record a version. Shared by
 * the direct-write path (companyMcpWrite / updateCompanySection) and proposal
 * acceptance (reviewCompanyProposal), so both mutate the file identically. It
 * does NOT write the activity row: the summary/status differ between a direct
 * edit ("edited X") and an accept ("accepted an edit to X"), so each caller logs
 * its own, using the metadata returned here.
 */
async function applyDraft(params: {
  creedId: string;
  // The target section, or null for a new-section draft (id is generated).
  sectionId: string | null;
  draft: CompanyDraft;
  actor: Actor;
  cause: WriteCause;
}): Promise<ApplyResult> {
  const { creedId, draft, actor, cause } = params;
  const db = admin();
  const now = new Date().toISOString();

  if (draft.kind === "new-section") {
    // Honour a caller-supplied id (the in-app create passes the optimistic row's
    // id so client and server agree); otherwise generate one. Callers that pass
    // an id must have already checked it is free - the upsert below is ON
    // CONFLICT and would otherwise overwrite a live section.
    const sectionId = params.sectionId ?? `section-${randomBytes(8).toString("hex")}`;
    const name = draft.name.trim();
    const accent = draft.accent ?? "custom";
    const content = draft.contentHtml ?? "";
    const { error } = await db.from("creed_sections").upsert(
      {
        creed_id: creedId,
        user_id: actor.userId,
        section_id: sectionId,
        kind: "rich-text",
        name,
        accent,
        payload: { content },
        revision: 1,
        // Ignored for company Creeds (per-member ceilings live in their own
        // tables), but the column is NOT NULL, so seed the writable default.
        agent_permission: "propose",
        position: 0,
        last_edited_by: actor.label,
        last_edited_type: actor.actorType,
        last_edited_at: now,
        updated_at: now,
      },
      { onConflict: "creed_id,section_id" },
    );
    if (error) return { ok: false, code: "failed", error: "Could not create the section." };

    // Place the new section after the requested anchor (or at the end), then
    // renumber so positions stay dense.
    const existing = (await orderedSectionIds(creedId)).filter((id) => id !== sectionId);
    const anchorIndex = draft.insertAfterSectionId
      ? existing.indexOf(draft.insertAfterSectionId)
      : -1;
    const order =
      anchorIndex === -1
        ? [...existing, sectionId]
        : [
            ...existing.slice(0, anchorIndex + 1),
            sectionId,
            ...existing.slice(anchorIndex + 1),
          ];
    await renumberSections(creedId, order, now);

    await writeVersion({
      creedId,
      sectionId,
      revision: 1,
      name,
      accent,
      content,
      actorUserId: actor.userId,
      actorType: actor.actorType,
      agentName: actor.agentName,
      cause,
    });
    return {
      ok: true,
      sectionId,
      sectionName: name,
      accent,
      revision: 1,
      before: "",
      after: content,
    };
  }

  const sectionId = params.sectionId ?? "";
  const { data: current } = (await db
    .from("creed_sections")
    .select("section_id, kind, name, accent, payload, revision")
    .eq("creed_id", creedId)
    .eq("section_id", sectionId)
    .maybeSingle()) as { data: SectionRow | null };
  if (!current) return { ok: false, code: "not_found", error: "Section not found." };

  if (draft.kind === "delete-section") {
    const deleted = await deleteSectionRows(
      creedId,
      sectionId,
      current.name,
      actor,
      cause,
    );
    if (!deleted.ok) return { ok: false, code: "failed", error: "Could not delete the section." };
    return {
      ok: true,
      sectionId,
      sectionName: current.name,
      accent: current.accent,
      revision: current.revision,
      before: current.payload.content ?? "",
      after: "",
    };
  }

  if (draft.kind === "reorder-section") {
    const ids = await orderedSectionIds(creedId);
    const order = moveInOrder(ids, sectionId, draft.afterSectionId, draft.position);
    await renumberSections(creedId, order, now);
    const destination =
      draft.position === "first"
        ? "top of file"
        : draft.position === "last"
          ? "bottom of file"
          : draft.afterSectionId
            ? `after ${draft.afterSectionId}`
            : "bottom of file";
    return {
      ok: true,
      sectionId,
      sectionName: current.name,
      accent: current.accent,
      revision: current.revision,
      before: `Keep ${current.name} in place`,
      after: `Move ${current.name} to ${destination}`,
    };
  }

  // rich-text: any of content / name / accent.
  const nextContent = draft.contentHtml ?? current.payload.content ?? "";
  const nextName = draft.name?.trim() || current.name;
  const nextAccent = draft.accent ?? current.accent;
  const unchanged =
    richTextContentEquivalent(nextContent, current.payload.content ?? "") &&
    nextName === current.name &&
    nextAccent === current.accent;
  if (unchanged) {
    return {
      ok: true,
      sectionId,
      sectionName: current.name,
      accent: current.accent,
      revision: current.revision,
      before: current.payload.content ?? "",
      after: current.payload.content ?? "",
      noop: true,
    };
  }

  const nextRevision = current.revision + 1;
  const { error } = await db.from("creed_sections").upsert(
    {
      creed_id: creedId,
      user_id: actor.userId,
      section_id: sectionId,
      kind: current.kind,
      name: nextName,
      accent: nextAccent,
      payload: { ...current.payload, content: nextContent },
      revision: nextRevision,
      last_edited_by: actor.label,
      last_edited_type: actor.actorType,
      last_edited_at: now,
      updated_at: now,
    },
    { onConflict: "creed_id,section_id" },
  );
  if (error) return { ok: false, code: "failed", error: "Could not save the section." };

  await writeVersion({
    creedId,
    sectionId,
    revision: nextRevision,
    name: nextName,
    accent: nextAccent,
    content: nextContent,
    actorUserId: actor.userId,
    actorType: actor.actorType,
    agentName: actor.agentName,
    cause,
  });
  return {
    ok: true,
    sectionId,
    sectionName: nextName,
    accent: nextAccent,
    revision: nextRevision,
    before: current.payload.content ?? "",
    after: nextContent,
  };
}

// Bookkeeping defaults for a proposal, per draft kind (mirrors the personal
// proposals route). These drive the activity sidebar's labelling only.
const PROPOSAL_DEFAULTS: Record<
  CompanyDraft["kind"],
  { changeType: string; impact: string; confidence: string }
> = {
  "rich-text": { changeType: "refines-existing", impact: "future-responses", confidence: "repeated" },
  "new-section": { changeType: "new-memory", impact: "future-responses", confidence: "durable" },
  "delete-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
  "reorder-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
};

/**
 * File a proposal for a change the caller may not (or chose not to) apply
 * directly, plus a linked pending activity row. Owner/Admin (or a member with
 * Direct edit on the section) later accept it via reviewCompanyProposal.
 */
async function fileCompanyProposal(params: {
  creedId: string;
  user: User;
  agentName: string | null;
  // The target section id, or "new-section" for a new-section draft.
  sectionId: string;
  sectionName: string;
  accent: string;
  draft: CompanyDraft;
  reason: string;
}): Promise<string> {
  const db = admin();
  const actor = describeActor(params.user, params.agentName);
  const proposalId = randomBytes(16).toString("hex");
  const isNew = params.sectionId === "new-section";

  // Pull the current section (existing-section proposals) so the activity diff
  // is proportional and base_revision pins the point the change was drafted at.
  let baseRevision: number | null = null;
  let currentContent = "";
  let currentName = params.sectionName;
  let currentAccent = params.accent;
  if (!isNew) {
    const { data } = (await db
      .from("creed_sections")
      .select("name, accent, payload, revision")
      .eq("creed_id", params.creedId)
      .eq("section_id", params.sectionId)
      .maybeSingle()) as {
      data: { name: string; accent: string; payload: { content?: string }; revision: number } | null;
    };
    if (data) {
      baseRevision = data.revision;
      currentContent = data.payload.content ?? "";
      currentName = data.name;
      currentAccent = data.accent;
    }
  }

  const { before, after, summary } = describeProposal(params.draft, actor.label, {
    sectionName: params.sectionName,
    content: currentContent,
    name: currentName,
    accent: currentAccent,
  });
  const defaults = PROPOSAL_DEFAULTS[params.draft.kind];

  const { error: proposalInsertError } = await db.from("creed_proposals").insert({
    id: proposalId,
    creed_id: params.creedId,
    user_id: params.user.id,
    // author_user_id marks a human proposal (the UI shows the person's avatar and
    // lets them edit/withdraw it). An agent proposal leaves it null and carries
    // the full "[member]'s [agent]" attribution in agent_name, so it renders as
    // an agent proposal - exactly like the personal Creed.
    author_user_id: actor.actorType === "agent" ? null : params.user.id,
    section_id: params.sectionId,
    section_name: params.sectionName,
    accent: params.accent,
    agent_name: actor.label,
    change_type: defaults.changeType,
    reason: params.reason,
    impact: defaults.impact,
    confidence: defaults.confidence,
    draft: params.draft,
    status: "pending",
    base_revision: baseRevision,
  });
  // Fail loud: writeActivity below references this proposal, so a swallowed
  // insert error would leave a dangling activity row and report success.
  if (proposalInsertError) {
    throw new Error(proposalInsertError.message);
  }
  await writeActivity({
    creedId: params.creedId,
    proposalId,
    sectionId: isNew ? null : params.sectionId,
    sectionName: params.sectionName,
    accent: params.accent,
    actorUserId: params.user.id,
    actorType: actor.actorType,
    actorName: actor.label,
    summary,
    status: "pending",
    eventKind: "proposal",
    beforeText: before,
    afterText: after,
  });
  return proposalId;
}

/** Proportional diff labels + a summary line for a proposed change. */
function describeProposal(
  draft: CompanyDraft,
  actorLabelText: string,
  current: { sectionName: string; content: string; name: string; accent: string },
): { before: string; after: string; summary: string } {
  const target = current.sectionName;
  if (draft.kind === "new-section") {
    return {
      before: "",
      after: draft.contentHtml,
      summary: `${actorLabelText} proposed a new section: ${draft.name}`,
    };
  }
  if (draft.kind === "delete-section") {
    return {
      before: current.content,
      after: "",
      summary: `${actorLabelText} proposed deleting ${target}`,
    };
  }
  if (draft.kind === "reorder-section") {
    return {
      before: `Keep ${target} in place`,
      after: `Move ${target}`,
      summary: `${actorLabelText} proposed moving ${target}`,
    };
  }
  // rich-text: content, rename, or recolour.
  if (draft.contentHtml === undefined && draft.name) {
    return {
      before: `Name: ${current.name}`,
      after: `Name: ${draft.name}`,
      summary: `${actorLabelText} proposed renaming ${target}`,
    };
  }
  if (draft.contentHtml === undefined && draft.accent) {
    return {
      before: `Accent: ${current.accent}`,
      after: `Accent: ${draft.accent}`,
      summary: `${actorLabelText} proposed recolouring ${target}`,
    };
  }
  return {
    before: current.content,
    after: draft.contentHtml ?? current.content,
    summary: `${actorLabelText} proposed an edit to ${target}`,
  };
}

// ---------------------------------------------------------------------------
// Public write functions.
// ---------------------------------------------------------------------------

/**
 * Create a section on a company Creed from the app (human). Creating a section
 * is a structural change reserved to owner/admin, mirroring the MCP create
 * governance and the in-app affordance gate (canCreateSections). Accepts an
 * optional client-generated id so the provider's optimistic row and the server
 * row share an id; rejects a taken id so the new-section upsert can never
 * clobber an existing section.
 */
export async function createCompanySection(params: {
  creedId: string;
  user: User;
  name: string;
  contentHtml?: string;
  accent?: string;
  insertAfterSectionId?: string | null;
  sectionId?: string;
}): Promise<SectionCreateResult> {
  const { creedId, user } = params;
  const db = admin();

  const role = await getCreedRole(db, user.id, creedId);
  if (!role)
    return { ok: false, code: "forbidden", error: "You are not a member of this Creed." };
  if (role !== "owner" && role !== "admin") {
    return { ok: false, code: "forbidden", error: "Only an owner or admin can add sections." };
  }
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  const name = params.name.trim();
  if (!name) return { ok: false, code: "failed", error: "A section needs a name." };

  let sectionId: string | null = null;
  if (params.sectionId !== undefined) {
    if (!/^section-[0-9a-f]{16}$/.test(params.sectionId)) {
      return { ok: false, code: "failed", error: "Invalid section id." };
    }
    const { data: clash } = (await db
      .from("creed_sections")
      .select("section_id")
      .eq("creed_id", creedId)
      .eq("section_id", params.sectionId)
      .maybeSingle()) as { data: { section_id: string } | null };
    if (clash) return { ok: false, code: "exists", error: "That section already exists." };
    sectionId = params.sectionId;
  }

  const actor = describeActor(user, null);
  const draft: CompanyDraft = {
    kind: "new-section",
    name,
    contentHtml: params.contentHtml ?? "",
    accent: params.accent,
    insertAfterSectionId: params.insertAfterSectionId ?? null,
  };
  const applied = await applyDraft({ creedId, sectionId, draft, actor, cause: "manual" });
  if (!applied.ok) return applied;

  await writeActivity({
    creedId,
    sectionId: applied.sectionId,
    sectionName: applied.sectionName,
    accent: applied.accent,
    actorUserId: user.id,
    actorType: actor.actorType,
    actorName: actor.label,
    summary: `${actor.label} added ${applied.sectionName}`,
    status: "direct",
    eventKind: "edit",
    beforeText: applied.before,
    afterText: applied.after,
  });
  return {
    ok: true,
    sectionId: applied.sectionId,
    revision: applied.revision,
    name: applied.sectionName,
    accent: applied.accent,
  };
}

/**
 * Update a company section's content / name / accent from the app (human edit).
 * Owner/admin and members with Direct edit write immediately; members with
 * Proposal-only file a proposal instead. baseRevision guards a concurrent write
 * (409). Agent edits go through companyMcpWrite, not this.
 */
export async function updateCompanySection(params: {
  creedId: string;
  user: User;
  sectionId: string;
  baseRevision: number;
  content?: string;
  name?: string;
  accent?: string;
}): Promise<SectionWriteResult> {
  const { creedId, user, sectionId } = params;
  const db = admin();

  const [role, access, currentResult] = await Promise.all([
    getCreedRole(db, user.id, creedId),
    companyAccess(creedId),
    db
      .from("creed_sections")
      .select("section_id, name, accent, payload, revision")
      .eq("creed_id", creedId)
      .eq("section_id", sectionId)
      .maybeSingle(),
  ]);
  if (!role)
    return { ok: false, code: "forbidden", error: "You are not a member of this Creed." };
  if (access === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  const permission = await effectivePermission(creedId, user.id, sectionId, role, false);
  if (permission === "hidden" || permission === "read-only") {
    return { ok: false, code: "forbidden", error: "You cannot edit this section." };
  }

  const current = currentResult.data as {
    section_id: string;
    name: string;
    accent: string;
    payload: { content?: string };
    revision: number;
  } | null;
  if (!current) return { ok: false, code: "not_found", error: "Section not found." };

  if (params.baseRevision !== current.revision) {
    return {
      ok: false,
      code: "conflict",
      error: "This section changed while you were editing.",
      currentRevision: current.revision,
    };
  }

  // Only carry the fields that actually changed into the draft, so a rename /
  // recolour reads as such. Content is compared whitespace-insensitively, so a
  // save that added nothing but a stray space (or an &nbsp;) doesn't count as a
  // content change - it must never land an edit, version, proposal, or activity
  // row that says someone edited the section when they didn't.
  const contentChanged =
    params.content !== undefined &&
    !richTextContentEquivalent(params.content, current.payload.content ?? "");
  const nameChanged = params.name !== undefined && params.name !== current.name;
  const accentChanged = params.accent !== undefined && params.accent !== current.accent;

  if (!contentChanged && !nameChanged && !accentChanged) {
    return { ok: true, revision: current.revision };
  }

  const draft: CompanyDraft = {
    kind: "rich-text",
    ...(contentChanged ? { contentHtml: params.content } : {}),
    ...(nameChanged ? { name: params.name } : {}),
    ...(accentChanged ? { accent: params.accent } : {}),
  };

  if (permission === "propose") {
    const proposalId = await fileCompanyProposal({
      creedId,
      user,
      agentName: null,
      sectionId,
      sectionName: params.name ?? current.name,
      accent: params.accent ?? current.accent,
      draft,
      reason: "Suggested edit.",
    });
    return { ok: true, revision: current.revision, filedProposal: true, proposalId };
  }

  const actor = describeActor(user, null);
  const applied = await applyDraft({ creedId, sectionId, draft, actor, cause: "manual" });
  if (!applied.ok) return applied;
  if (applied.noop) return { ok: true, revision: applied.revision };

  // Name the operation so a rename/recolour doesn't read as a contentless edit.
  const verb =
    !contentChanged && nameChanged && !accentChanged
      ? "renamed"
      : !contentChanged && accentChanged && !nameChanged
        ? "recoloured"
        : "edited";
  await writeActivity({
    creedId,
    sectionId,
    sectionName: applied.sectionName,
    accent: applied.accent,
    actorUserId: user.id,
    actorType: actor.actorType,
    actorName: actor.label,
    summary: `${actor.label} ${verb} ${applied.sectionName}`,
    status: "direct",
    eventKind: "edit",
    beforeText: applied.before,
    afterText: applied.after,
  });
  return { ok: true, revision: applied.revision };
}

export type CompanyMcpOp =
  | { kind: "update"; sectionId: string; contentHtml: string }
  | { kind: "append"; sectionId: string; contentHtml: string }
  | { kind: "rename"; sectionId: string; name: string }
  | { kind: "recolor"; sectionId: string; accent: string }
  | { kind: "delete"; sectionId: string }
  | { kind: "reorder"; sectionId: string; afterSectionId?: string; position?: "first" | "last" }
  | {
      kind: "create";
      name: string;
      contentHtml: string;
      accent?: string;
      insertAfterSectionId?: string;
    };

/**
 * The single write entry for a connected agent on a company Creed. Enforces the
 * effective agent permission per section (Direct applies immediately, Proposal
 * files a proposal, Read-only / Hidden are rejected) with agent attribution.
 * Creating a section is structural, so owner/admin create directly while members
 * propose - there is no existing section whose permission would gate it.
 */
export async function companyMcpWrite(params: {
  creedId: string;
  user: User;
  agentName: string;
  op: CompanyMcpOp;
}): Promise<SectionWriteResult> {
  const { creedId, user, op } = params;
  const db = admin();

  const sectionId = op.kind === "create" ? null : op.sectionId;
  const [role, access, currentResult] = await Promise.all([
    getCreedRole(db, user.id, creedId),
    companyAccess(creedId),
    sectionId
      ? db
          .from("creed_sections")
          .select("section_id, name, accent, payload, revision")
          .eq("creed_id", creedId)
          .eq("section_id", sectionId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (!role)
    return { ok: false, code: "forbidden", error: "You are not a member of this Creed." };
  if (access === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  const actor = describeActor(user, params.agentName);

  if (op.kind === "create") {
    const draft: CompanyDraft = {
      kind: "new-section",
      name: op.name,
      contentHtml: op.contentHtml,
      accent: op.accent,
      insertAfterSectionId: op.insertAfterSectionId ?? null,
    };
    if (role === "owner" || role === "admin") {
      const applied = await applyDraft({ creedId, sectionId: null, draft, actor, cause: "mcp" });
      if (!applied.ok) return applied;
      await writeActivity({
        creedId,
        sectionId: applied.sectionId,
        sectionName: applied.sectionName,
        accent: applied.accent,
        actorUserId: user.id,
        actorType: actor.actorType,
        actorName: actor.label,
        summary: `${actor.label} created ${applied.sectionName}`,
        status: "direct",
        eventKind: "edit",
        beforeText: applied.before,
        afterText: applied.after,
      });
      return { ok: true, revision: applied.revision };
    }
    const proposalId = await fileCompanyProposal({
      creedId,
      user,
      agentName: actor.agentName,
      sectionId: "new-section",
      sectionName: op.name,
      accent: op.accent ?? "custom",
      draft,
      reason: "Captured useful context that didn't fit an existing section.",
    });
    return { ok: true, revision: 0, filedProposal: true, proposalId };
  }

  const current = currentResult.data as {
    section_id: string;
    name: string;
    accent: string;
    payload: { content?: string };
    revision: number;
  } | null;
  if (!sectionId) return { ok: false, code: "not_found", error: "Section not found." };
  if (!current) return { ok: false, code: "not_found", error: "Section not found." };

  // Deleting or reordering a section is a structural change reserved to owner/
  // admin (mirrors the in-app lifecycle and the spec's "members don't delete
  // sections in V1"). A member's agent can't do it, and there is no delete/
  // reorder approval path, so it's rejected outright rather than filed.
  const isLifecycle = op.kind === "delete" || op.kind === "reorder";
  if (isLifecycle && !canManageSectionsLifecycle(role)) {
    return {
      ok: false,
      code: "forbidden",
      error: `Only an owner or admin can ${op.kind} sections.`,
    };
  }

  const permission = await effectivePermission(creedId, user.id, sectionId, role, true);
  if (permission === "hidden" || permission === "read-only") {
    return {
      ok: false,
      code: "forbidden",
      error: `Section ${sectionId} is read-only - the user hasn't granted agent edits to it.`,
    };
  }

  const draft = draftForOp(op, current.payload.content ?? "");

  // No-op guard: a content edit/append/rename/recolour that changes nothing
  // substantive (e.g. only whitespace) must not file a proposal or land an
  // edit. Structural ops (delete/reorder) always do something.
  if (draft.kind === "rich-text") {
    const contentSame =
      draft.contentHtml === undefined ||
      richTextContentEquivalent(draft.contentHtml, current.payload.content ?? "");
    const nameSame = draft.name === undefined || draft.name === current.name;
    const accentSame = draft.accent === undefined || draft.accent === current.accent;
    if (contentSame && nameSame && accentSame) {
      return { ok: true, revision: current.revision };
    }
  }

  if (permission === "direct") {
    const applied = await applyDraft({ creedId, sectionId, draft, actor, cause: "mcp" });
    if (!applied.ok) return applied;
    if (applied.noop) return { ok: true, revision: applied.revision };
    await writeActivity({
      creedId,
      sectionId,
      sectionName: applied.sectionName,
      accent: applied.accent,
      actorUserId: user.id,
      actorType: actor.actorType,
      actorName: actor.label,
      summary: directSummary(op, actor.label, applied.sectionName),
      status: "direct",
      eventKind: "edit",
      beforeText: applied.before,
      afterText: applied.after,
    });
    return { ok: true, revision: applied.revision };
  }

  // Reaching here means the effective permission is Proposal-only. Lifecycle ops
  // (owner/admin who limited their own agent below Direct on this section) have
  // no proposal path, so reject; everything else files a proposal.
  if (isLifecycle) {
    return {
      ok: false,
      code: "forbidden",
      error: `Your agent is limited to proposing on this section, so it can't ${op.kind} it.`,
    };
  }

  const proposalId = await fileCompanyProposal({
    creedId,
    user,
    agentName: actor.agentName,
    sectionId,
    sectionName: current.name,
    accent: current.accent,
    draft,
    reason: reasonForOp(op),
  });
  return { ok: true, revision: current.revision, filedProposal: true, proposalId };
}

/** Translate an agent op into a stored draft. append merges into current body. */
function draftForOp(op: CompanyMcpOp, currentContent: string): CompanyDraft {
  switch (op.kind) {
    case "update":
      return { kind: "rich-text", contentHtml: op.contentHtml };
    case "append": {
      const existing = currentContent.trim();
      const separator = existing ? `<hr class="creed-hr" />` : "";
      return { kind: "rich-text", contentHtml: `${existing}${separator}${op.contentHtml}` };
    }
    case "rename":
      return { kind: "rich-text", name: op.name };
    case "recolor":
      return { kind: "rich-text", accent: op.accent };
    case "delete":
      return { kind: "delete-section" };
    case "reorder":
      return { kind: "reorder-section", afterSectionId: op.afterSectionId ?? null, position: op.position };
    case "create":
      return {
        kind: "new-section",
        name: op.name,
        contentHtml: op.contentHtml,
        accent: op.accent,
        insertAfterSectionId: op.insertAfterSectionId ?? null,
      };
  }
}

function directSummary(op: CompanyMcpOp, label: string, name: string): string {
  switch (op.kind) {
    case "delete":
      return `${label} deleted ${name}`;
    case "reorder":
      return `${label} moved ${name}`;
    case "rename":
      return `${label} renamed a section to ${name}`;
    case "recolor":
      return `${label} recoloured ${name}`;
    default:
      return `${label} edited ${name}`;
  }
}

function reasonForOp(op: CompanyMcpOp): string {
  switch (op.kind) {
    case "delete":
      return "Section is no longer useful.";
    case "reorder":
      return "Better-flowing section order.";
    case "rename":
      return "Clearer name.";
    case "recolor":
      return "Better-matching accent.";
    case "append":
      return "Captured new context that adds to the existing section.";
    default:
      return "Captured durable context worth remembering.";
  }
}

/**
 * Archive or restore a company section (owner/admin). Metadata-only, mirroring
 * the personal semantics exactly: archived_at set once (preserved on re-archive)
 * or cleared, no revision bump, no version row.
 */
export async function setCompanySectionArchived(params: {
  creedId: string;
  user: User;
  sectionId: string;
  archived: boolean;
}): Promise<SectionWriteResult> {
  const { creedId, user, sectionId } = params;
  const db = admin();

  const role = await getCreedRole(db, user.id, creedId);
  if (!role)
    return { ok: false, code: "forbidden", error: "You are not a member of this Creed." };
  if (!canManageSectionsLifecycle(role)) {
    return {
      ok: false,
      code: "forbidden",
      error: "Only the owner or an admin can archive sections.",
    };
  }
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  const { data: current } = (await db
    .from("creed_sections")
    .select("section_id, name, accent, revision, archived_at")
    .eq("creed_id", creedId)
    .eq("section_id", sectionId)
    .maybeSingle()) as {
    data: {
      section_id: string;
      name: string;
      accent: string;
      revision: number;
      archived_at: string | null;
    } | null;
  };
  if (!current) return { ok: false, code: "not_found", error: "Section not found." };

  const now = new Date().toISOString();
  const { error } = await db
    .from("creed_sections")
    .update({
      archived_at: params.archived ? (current.archived_at ?? now) : null,
      updated_at: now,
    })
    .eq("creed_id", creedId)
    .eq("section_id", sectionId);
  if (error)
    return { ok: false, code: "failed", error: "Could not update the section." };

  const actorName = memberName(user);
  await writeActivity({
    creedId,
    sectionId,
    sectionName: current.name,
    accent: current.accent,
    actorUserId: user.id,
    actorType: "user",
    actorName,
    summary: `${actorName} ${params.archived ? "archived" : "restored"} ${current.name}`,
    status: "direct",
    eventKind: "edit",
  });

  return { ok: true, revision: current.revision };
}

/**
 * Accept or reject a proposal (owner/admin, or a member with Direct edit), or
 * "withdraw" - the proposal's own author deleting their pending proposal. On
 * accept the draft is applied to the section rows via the shared applyDraft, so
 * every draft kind (content, rename, recolour, new, delete, reorder) takes
 * effect - not just content.
 */
export async function reviewCompanyProposal(params: {
  creedId: string;
  user: User;
  proposalId: string;
  decision: "accept" | "reject" | "withdraw";
}): Promise<SectionWriteResult> {
  const { creedId, user, proposalId } = params;
  const db = admin();
  const role = await getCreedRole(db, user.id, creedId);
  if (!role)
    return { ok: false, code: "forbidden", error: "You are not a member of this Creed." };
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  const { data: proposal } = (await db
    .from("creed_proposals")
    .select(
      "id, section_id, section_name, accent, draft, status, author_user_id, base_revision",
    )
    .eq("creed_id", creedId)
    .eq("id", proposalId)
    .maybeSingle()) as {
    data: {
      id: string;
      section_id: string;
      section_name: string;
      accent: string;
      draft: CompanyDraft;
      status: string;
      author_user_id: string | null;
      base_revision: number | null;
    } | null;
  };
  if (!proposal)
    return { ok: false, code: "not_found", error: "Proposal not found." };

  const isWithdraw = params.decision === "withdraw";
  if (isWithdraw) {
    // Only the author may withdraw their own proposal (no approval power needed).
    if (proposal.author_user_id !== user.id) {
      return {
        ok: false,
        code: "forbidden",
        error: "You can only delete your own proposal.",
      };
    }
  } else if (proposal.section_id === "new-section") {
    // A new-section proposal has no existing section to hold a permission on, so
    // effectivePermission would default a member to "direct" and wrongly let them
    // approve. Creating a section is structural: owner/admin only.
    if (role !== "owner" && role !== "admin") {
      return {
        ok: false,
        code: "forbidden",
        error: "Only an owner or admin can approve a new section.",
      };
    }
  } else {
    const permission = await effectivePermission(
      creedId,
      user.id,
      proposal.section_id,
      role,
      false,
    );
    if (!canApproveProposal(role, permission)) {
      return {
        ok: false,
        code: "forbidden",
        error: "You cannot review proposals on this section.",
      };
    }
  }
  // Only pending proposals are reviewable: a double-accept (or an accept racing
  // a reject) must not re-apply the draft and double-bump the revision.
  if (proposal.status !== "pending") {
    return {
      ok: false,
      code: "conflict",
      error: "This proposal was already reviewed.",
    };
  }

  const actorName = memberName(user);
  if (params.decision === "reject" || isWithdraw) {
    await db
      .from("creed_proposals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", proposalId)
      .eq("creed_id", creedId)
      .eq("status", "pending");
    await writeActivity({
      creedId,
      sectionId: proposal.section_id === "new-section" ? null : proposal.section_id,
      sectionName: proposal.section_name,
      accent: proposal.accent,
      actorUserId: user.id,
      actorType: "user",
      actorName,
      summary: isWithdraw
        ? `${actorName} deleted a proposed edit to ${proposal.section_name}`
        : `${actorName} rejected a proposed edit to ${proposal.section_name}`,
      status: "rejected",
      eventKind: "proposal",
    });
    return { ok: true, revision: 0 };
  }

  // Optimistic concurrency for accepts: the proposal was drafted against a
  // specific section revision. If the section has moved on since (a direct
  // edit, another accepted proposal), applying the draft would silently
  // clobber the newer content - the same hazard the direct-edit path guards
  // with baseRevision. Mark the proposal stale (kept for the audit trail,
  // like accepted/rejected) and tell the caller.
  if (
    proposal.draft.kind === "rich-text" &&
    proposal.base_revision != null
  ) {
    const { data: section } = (await db
      .from("creed_sections")
      .select("revision")
      .eq("creed_id", creedId)
      .eq("section_id", proposal.section_id)
      .maybeSingle()) as { data: { revision: number } | null };
    if (section && section.revision !== proposal.base_revision) {
      await db
        .from("creed_proposals")
        .update({ status: "stale", updated_at: new Date().toISOString() })
        .eq("id", proposalId)
        .eq("creed_id", creedId)
        .eq("status", "pending");
      await writeActivity({
        creedId,
        sectionId: proposal.section_id,
        sectionName: proposal.section_name,
        accent: proposal.accent,
        actorUserId: user.id,
        actorType: "user",
        actorName,
        summary: `A proposed edit to ${proposal.section_name} went stale (the section changed after it was proposed)`,
        status: "stale",
        eventKind: "proposal",
      });
      return {
        ok: false,
        code: "stale",
        error: "The section changed since this was proposed.",
      };
    }
  }

  // Accept: apply the draft to the section rows, resolve the proposal, log it.
  const applied = await applyDraft({
    creedId,
    sectionId: proposal.draft.kind === "new-section" ? null : proposal.section_id,
    draft: proposal.draft,
    actor: describeActor(user, null),
    cause: "proposal",
  });
  if (!applied.ok) return applied;

  await db
    .from("creed_proposals")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("creed_id", creedId)
    .eq("status", "pending");
  const acceptResult: SectionWriteOk = {
    ok: true,
    revision: applied.revision,
    sectionId: applied.sectionId,
    sectionName: applied.sectionName,
    accent: applied.accent,
    contentHtml: applied.after,
  };
  if (applied.noop) {
    return acceptResult;
  }
  await writeActivity({
    creedId,
    sectionId: applied.sectionId,
    sectionName: applied.sectionName,
    accent: applied.accent,
    actorUserId: user.id,
    actorType: "user",
    actorName,
    summary: `${actorName} accepted a proposed edit to ${applied.sectionName}`,
    status: "accepted",
    eventKind: "proposal",
    beforeText: applied.before,
    afterText: applied.after,
  });
  return acceptResult;
}

// Personal-Creed proposal review: the durable, server-authoritative half of a
// personal accept/reject. The client applies the draft to its local state
// instantly (and its autosave later persists sections/activity as usual); this
// makes the RESOLUTION itself durable at click time, so a browser refresh can
// never resurrect an already-reviewed proposal (the old failure mode: accept ->
// refresh inside the autosave window -> the proposal is back, and now stale).
//
// Scope, deliberately:
// - reject: delete the proposal row. Personal proposals don't keep an audit
//   row (the activity entry the client persists is the record).
// - accept, content drafts (rich-text / rename / recolor): apply server-side
//   via the shared applyDraft, then delete the row. No base-revision re-check:
//   the client already ran the staleness guard against the same revisions, and
//   a personal Creed has a single writer.
// - accept, structural drafts (new/delete/reorder-section): delete the row
//   only. The client applies the structure locally and its full-state PUT
//   persists it - applying server-side too would race that PUT (e.g. the
//   client and server would mint different ids for a new section).
// - no activity writes: the client's activity entry persists through the
//   normal full-state path; writing one here would duplicate the sidebar row.
export async function reviewPersonalProposal(params: {
  creedId: string;
  user: User;
  proposalId: string;
  decision: "accept" | "reject";
}): Promise<SectionWriteResult> {
  const { creedId, user, proposalId } = params;
  const db = admin();

  const { data: proposal } = (await db
    .from("creed_proposals")
    .select("id, section_id, draft, status")
    .eq("creed_id", creedId)
    .eq("id", proposalId)
    .maybeSingle()) as {
    data: {
      id: string;
      section_id: string;
      draft: ProposalDraft;
      status: string;
    } | null;
  };
  if (!proposal) {
    return { ok: false, code: "not_found", error: "Proposal not found." };
  }
  if (proposal.status !== "pending") {
    return {
      ok: false,
      code: "conflict",
      error: "This proposal was already reviewed.",
    };
  }

  const removeRow = async () => {
    await db
      .from("creed_proposals")
      .delete()
      .eq("id", proposalId)
      .eq("creed_id", creedId);
  };

  if (params.decision === "reject") {
    await removeRow();
    return { ok: true, revision: 0 };
  }

  const draft = translatePersonalDraft(proposal.draft);
  if (!draft) {
    // Structural drafts: resolve the proposal now, let the client's full-state
    // persist land the structure.
    await removeRow();
    return { ok: true, revision: 0 };
  }

  const applied = await applyDraft({
    creedId,
    sectionId: proposal.section_id,
    draft,
    actor: describeActor(user, null),
    cause: "proposal",
  });
  if (!applied.ok) {
    // Even when the apply fails (section vanished mid-flight), the review
    // decision stands - resolve the proposal rather than leave it pending.
    await removeRow();
    return applied;
  }
  await removeRow();
  return {
    ok: true,
    revision: applied.revision,
    sectionId: applied.sectionId,
    sectionName: applied.sectionName,
    accent: applied.accent,
    contentHtml: applied.after,
  };
}

// Personal proposals carry a wider draft vocabulary than company ones
// (rename-section / recolor-section are their own kinds). Raw jsonb is first
// coerced through normalizeLegacyProposalDraft - the same helper the state
// loader uses - so legacy draft shapes can't slip past the kind switch.
// Content-shaped drafts translate onto the shared applyDraft's rich-text
// branch; structural drafts return null (handled client-side, see
// reviewPersonalProposal).
function translatePersonalDraft(raw: ProposalDraft): CompanyDraft | null {
  const draft = normalizeLegacyProposalDraft(raw);
  if (draft.kind === "rich-text") {
    const contentHtml = normalizeRichTextInput(draft);
    // An empty string here means "no usable content", not "clear the
    // section": applyDraft treats undefined as keep-current but "" as an
    // explicit wipe, so a blank/malformed draft must not reach it as "".
    if (!contentHtml) return null;
    return { kind: "rich-text", contentHtml };
  }
  if (draft.kind === "rename-section") {
    return { kind: "rich-text", name: draft.name };
  }
  if (draft.kind === "recolor-section") {
    return { kind: "rich-text", accent: draft.accent };
  }
  return null;
}

export type SectionVersionEntry = {
  id: number;
  revision: number;
  name: string;
  cause: string;
  actorType: string;
  agentName: string | null;
  createdAt: string;
};

/** List a section's stored versions, newest first (owner/admin only). */
export async function listSectionVersions(params: {
  creedId: string;
  user: User;
  sectionId: string;
}): Promise<
  { ok: true; versions: SectionVersionEntry[] } | SectionWriteError
> {
  const db = admin();
  const role = await getCreedRole(db, params.user.id, params.creedId);
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      code: "forbidden",
      error: "Only an owner or admin can view section history.",
    };
  }
  const { data } = (await db
    .from("creed_section_versions")
    .select("id, revision, name, cause, actor_type, agent_name, created_at")
    .eq("creed_id", params.creedId)
    .eq("section_id", params.sectionId)
    .order("id", { ascending: false })
    .limit(100)) as {
    data: Array<{
      id: number;
      revision: number;
      name: string;
      cause: string;
      actor_type: string;
      agent_name: string | null;
      created_at: string;
    }> | null;
  };
  return {
    ok: true,
    versions: (data ?? []).map((row) => ({
      id: row.id,
      revision: row.revision,
      name: row.name,
      cause: row.cause,
      actorType: row.actor_type,
      agentName: row.agent_name,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Restore a stored version by writing its content/name/accent as a NEW
 * revision via the shared applyDraft (cause "restore") - history is never
 * destroyed, so a restore can itself be undone. Owner/admin only.
 */
export async function restoreSectionVersion(params: {
  creedId: string;
  user: User;
  sectionId: string;
  versionId: number;
}): Promise<SectionWriteResult> {
  const { creedId, user, sectionId, versionId } = params;
  const db = admin();
  const role = await getCreedRole(db, user.id, creedId);
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      code: "forbidden",
      error: "Only an owner or admin can restore a version.",
    };
  }
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }
  const { data: version } = (await db
    .from("creed_section_versions")
    .select("content, name, accent")
    .eq("creed_id", creedId)
    .eq("section_id", sectionId)
    .eq("id", versionId)
    .maybeSingle()) as {
    data: { content: string; name: string; accent: string } | null;
  };
  if (!version) {
    return { ok: false, code: "not_found", error: "Version not found." };
  }
  const applied = await applyDraft({
    creedId,
    sectionId,
    draft: {
      kind: "rich-text",
      contentHtml: version.content,
      name: version.name,
      accent: version.accent,
    },
    actor: describeActor(user, null),
    cause: "restore",
  });
  if (!applied.ok) return applied;
  if (!applied.noop) {
    const actorName = memberName(user);
    await writeActivity({
      creedId,
      sectionId: applied.sectionId,
      sectionName: applied.sectionName,
      accent: applied.accent,
      actorUserId: user.id,
      actorType: "user",
      actorName,
      summary: `${actorName} restored an earlier version of ${applied.sectionName}`,
      status: "accepted",
      eventKind: "edit",
      beforeText: applied.before,
      afterText: applied.after,
    });
  }
  return { ok: true, revision: applied.revision };
}

/** Permanently delete a section (owner/admin, from the app). */
export async function deleteCompanySection(params: {
  creedId: string;
  user: User;
  sectionId: string;
}): Promise<SectionWriteResult> {
  const { creedId, user, sectionId } = params;
  const db = admin();
  const role = await getCreedRole(db, user.id, creedId);
  if (!role || !canManageSectionsLifecycle(role)) {
    return {
      ok: false,
      code: "forbidden",
      error: "Only an owner or admin can delete sections.",
    };
  }
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }
  const { data: current } = (await db
    .from("creed_sections")
    .select("section_id, name, accent")
    .eq("creed_id", creedId)
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: { section_id: string; name: string; accent: string } | null;
  };
  if (!current) {
    return { ok: false, code: "not_found", error: "Section not found." };
  }

  const deleted = await deleteSectionRows(
    creedId,
    sectionId,
    current.name,
    describeActor(user, null),
    "manual",
  );
  if (!deleted.ok)
    return { ok: false, code: "failed", error: "Could not delete the section." };
  await writeActivity({
    creedId,
    sectionId: current.section_id,
    sectionName: current.name,
    accent: current.accent,
    actorUserId: user.id,
    actorType: "user",
    actorName: memberName(user),
    summary: `${memberName(user)} deleted ${current.name}`,
    status: "direct",
    eventKind: "edit",
  });
  return { ok: true, revision: 0 };
}

/**
 * Reorder a company Creed's sections (owner/admin only). Writes each visible
 * section's new position (0..N-1) so every member sees the new order on their
 * next sync. Members can't reach this (the UI hides drag; this re-checks).
 */
export async function reorderCompanySections(params: {
  creedId: string;
  user: User;
  sectionIds: string[];
}): Promise<{
  ok: boolean;
  code?: "forbidden" | "frozen" | "failed";
  error?: string;
}> {
  const { creedId, user, sectionIds } = params;
  const db = admin();

  const role = await getCreedRole(db, user.id, creedId);
  if (!role)
    return {
      ok: false,
      code: "forbidden",
      error: "You are not a member of this Creed.",
    };
  if (!canManageSectionsLifecycle(role)) {
    return {
      ok: false,
      code: "forbidden",
      error: "Only an owner or admin can reorder sections.",
    };
  }
  if ((await companyAccess(creedId)) === "frozen") {
    return {
      ok: false,
      code: "frozen",
      error: "This company is read-only until billing is fixed.",
    };
  }

  try {
    await renumberSections(creedId, sectionIds, new Date().toISOString());
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "Could not save the new order.",
    };
  }
  return { ok: true };
}
