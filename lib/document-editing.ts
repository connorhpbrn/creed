import "server-only";
import {
  recordDocumentActivity,
  resolveOpenCommentsForProposal,
  resolveOpenCommentsForProposals,
} from "@/lib/document-collaboration";
import {
  applyHunkChange,
  diffDocumentHunks,
  hunkChangeHasReviewableDiff,
  type DocumentHunkChange,
  type DocumentHunkConflictStatus,
  type DocumentHunkStatus,
} from "@/lib/document-hunk-diff";
import { appendDocumentVersion, readDocumentVersion, type DocumentVersion } from "@/lib/document-versions";
import { log } from "@/lib/observability";
import {
  readSharedDocumentById,
  updateSharedDocumentContent,
  type SharedDocument,
} from "@/lib/shared-documents";
import { policyForActor, type ActorType } from "@/lib/workspace-settings";
import { randomUUID } from "node:crypto";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Model S edit engine. Every document mutation flows through `routeDocumentEdit`,
// which reads the workspace policy for the actor type and either rejects it,
// records workspace-shared proposals, or applies it and appends a version.
//
// The editor and the MCP document tools both submit a full Markdown body. Under
// the "propose" policy that whole-content submission is split into one proposal
// per changed diff hunk (all sharing a `familyId`), so a reviewer can accept or
// reject each small change independently.

export type DocumentEditAuthor = {
  userId?: string | null;
  agentLabel?: string | null;
};

export type DocumentProposalKind = "document-hunk";

export type DocumentProposal = {
  id: string;
  documentId: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  kind: DocumentProposalKind;
  // Proposed body for this local change ("" for a removal).
  content: string;
  summary: string;
  baseRevision: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  // Groups the sibling hunk proposals produced by one edit.
  familyId: string;
  hunkKey: string;
  hunkIndex: number;
  hunkStatus: DocumentHunkStatus;
  hunkBefore: string;
  hunkAfter: string;
  hunkBeforeStart: number;
  hunkBeforeEnd: number;
  hunkAfterStart: number;
  hunkAfterEnd: number;
  hunkPrefix: string;
  hunkSuffix: string;
  classification: string;
  conflictStatus: DocumentHunkConflictStatus;
};

type DocumentProposalRow = {
  id: string;
  document_id: string;
  actor_type: string;
  author_user_id: string | null;
  author_agent_label: string | null;
  draft: unknown;
  family_id: string;
  hunk_index: number;
  classification: string | null;
  conflict_status: string | null;
  summary: string | null;
  base_revision: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type EditResult =
  | { ok: true; outcome: "proposed"; proposals: DocumentProposal[] }
  | { ok: true; outcome: "applied"; document: SharedDocument; version: DocumentVersion }
  | { ok: false; code: "invalid" | "not-found" | "conflict" | "forbidden"; error: string };

type ProposalResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "invalid" | "not-found" | "conflict" | "forbidden"; error: string };

type BulkProposalResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: "invalid" | "not-found" | "conflict" | "forbidden";
      error: string;
      settledProposalIds?: string[];
    };

const PROPOSAL_COLUMNS = [
  "id",
  "document_id",
  "actor_type",
  "author_user_id",
  "author_agent_label",
  "draft",
  "family_id",
  "hunk_index",
  "classification",
  "conflict_status",
  "summary",
  "base_revision",
  "status",
  "created_at",
  "resolved_at",
  "resolved_by",
].join(", ");

type HunkDraft = {
  kind: "document-hunk";
  hunk: DocumentHunkChange;
};

function isHunkDraft(draft: unknown): draft is HunkDraft {
  return (
    !!draft &&
    typeof draft === "object" &&
    (draft as { kind?: unknown }).kind === "document-hunk" &&
    typeof (draft as { hunk?: unknown }).hunk === "object" &&
    (draft as { hunk?: unknown }).hunk !== null
  );
}

function isHunkStatus(value: unknown): value is DocumentHunkStatus {
  return value === "added" || value === "removed" || value === "modified";
}

function isConflictStatus(value: unknown): value is DocumentHunkConflictStatus {
  return value === "clean" || value === "conflict" || value === "resolved";
}

function hunkFromDraft(draft: unknown): DocumentHunkChange | null {
  if (!isHunkDraft(draft)) return null;
  const hunk = draft.hunk as Partial<DocumentHunkChange>;
  if (typeof hunk.key !== "string") return null;
  const status = isHunkStatus(hunk.status) ? hunk.status : "modified";
  return {
    key: hunk.key,
    index: typeof hunk.index === "number" ? hunk.index : 0,
    status,
    before: typeof hunk.before === "string" ? hunk.before : "",
    after: typeof hunk.after === "string" ? hunk.after : "",
    beforeStart: typeof hunk.beforeStart === "number" ? hunk.beforeStart : 0,
    beforeEnd: typeof hunk.beforeEnd === "number" ? hunk.beforeEnd : 0,
    afterStart: typeof hunk.afterStart === "number" ? hunk.afterStart : 0,
    afterEnd: typeof hunk.afterEnd === "number" ? hunk.afterEnd : 0,
    prefix: typeof hunk.prefix === "string" ? hunk.prefix : "",
    suffix: typeof hunk.suffix === "string" ? hunk.suffix : "",
    classification: typeof hunk.classification === "string" ? hunk.classification : "",
    conflictStatus: isConflictStatus(hunk.conflictStatus) ? hunk.conflictStatus : "clean",
  };
}

function mapProposal(row: DocumentProposalRow): DocumentProposal {
  const hunk = hunkFromDraft(row.draft);
  if (!hunk) {
    throw new Error("Document proposal row is missing hunk data.");
  }
  const conflictStatus = isConflictStatus(row.conflict_status)
    ? row.conflict_status
    : hunk.conflictStatus;
  const classification = row.classification ?? hunk.classification;
  return {
    id: row.id,
    documentId: row.document_id,
    actorType: row.actor_type === "agent" ? "agent" : "human",
    authorUserId: row.author_user_id,
    authorAgentLabel: row.author_agent_label,
    kind: "document-hunk",
    content: hunk.after,
    summary: row.summary ?? "",
    baseRevision: row.base_revision,
    status: row.status === "accepted" ? "accepted" : row.status === "rejected" ? "rejected" : "pending",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    familyId: row.family_id,
    hunkKey: hunk.key,
    hunkIndex: row.hunk_index,
    hunkStatus: hunk.status,
    hunkBefore: hunk.before,
    hunkAfter: hunk.after,
    hunkBeforeStart: hunk.beforeStart,
    hunkBeforeEnd: hunk.beforeEnd,
    hunkAfterStart: hunk.afterStart,
    hunkAfterEnd: hunk.afterEnd,
    hunkPrefix: hunk.prefix,
    hunkSuffix: hunk.suffix,
    classification,
    conflictStatus,
  };
}

function compareProposalReviewOrder(a: DocumentProposal, b: DocumentProposal) {
  if (a.familyId === b.familyId) {
    const aIndex = a.hunkIndex;
    const bIndex = b.hunkIndex;
    if (aIndex !== bIndex) return aIndex - bIndex;
  }

  const created = a.createdAt.localeCompare(b.createdAt);
  if (created !== 0) return created;

  if (a.familyId !== b.familyId) return a.familyId.localeCompare(b.familyId);

  const aIndex = a.hunkIndex;
  const bIndex = b.hunkIndex;
  if (aIndex !== bIndex) return aIndex - bIndex;

  return a.id.localeCompare(b.id);
}

function sortProposalsForReview(proposals: DocumentProposal[]) {
  return [...proposals].sort(compareProposalReviewOrder);
}

// Apply a whole-content change to a document (guarded on `expectedRevision`),
// then append a version. Shared by direct edits and accepted proposals so the
// versioning + concurrency behaviour lives in one place.
async function applyDocumentContent(
  client: unknown,
  input: {
    documentId: string;
    content: string;
    expectedRevision: number;
    actorType: ActorType;
    author: DocumentEditAuthor;
    summary: string;
    sourceProposalId?: string | null;
    changeHunks?: DocumentHunkChange[];
  }
): Promise<
  | { ok: true; document: SharedDocument; version: DocumentVersion }
  | { ok: false; code: "invalid" | "not-found" | "conflict"; error: string }
> {
  const applied = await updateSharedDocumentContent(client, {
    id: input.documentId,
    content: input.content,
    expectedRevision: input.expectedRevision,
    actorUserId: input.author.userId ?? null,
    lastEditedVia: input.actorType === "agent" ? "mcp" : "creed",
  });

  if (!applied.ok) {
    return { ok: false, code: applied.code, error: applied.error };
  }

  const version = await appendDocumentVersion(client, {
    documentId: applied.value.id,
    revision: applied.value.revision,
    content: applied.value.content,
    actorType: input.actorType,
    authorUserId: input.author.userId ?? null,
    authorAgentLabel: input.author.agentLabel ?? null,
    summary: input.summary,
    sourceProposalId: input.sourceProposalId ?? null,
    changeHunks: input.changeHunks ?? [],
  });

  return { ok: true, document: applied.value, version };
}

// After a direct edit moves the source of truth, re-evaluate every OTHER pending
// proposal against the new content. Proposals are content-anchored (not fixed
// offsets), so this never creates a new proposal - it updates or removes the
// existing rows:
//   - still anchors and produces a change  -> keep it, mark `clean`;
//   - the edit already made the same change -> delete the now-redundant row;
//   - the edit changed the anchored span    -> keep it, mark `conflict` for re-review.
// Best-effort: the save already succeeded and versioned, so a failure here is
// logged but not surfaced to the caller.
async function reconcilePendingProposalsAfterEdit(
  client: unknown,
  input: {
    documentId: string;
    content: string;
    actorUserId: string | null;
    // The proposal being accepted (if any) is settled by its own flow; skip it.
    excludeProposalId?: string | null;
  }
): Promise<void> {
  const db = client as SupabaseLikeClient;

  let pending: DocumentProposal[];
  try {
    pending = await listDocumentProposals(client, input.documentId, { status: "pending" });
  } catch (error) {
    log.warn(
      "document.proposal.reconcile_list_failed",
      { documentId: input.documentId },
      error
    );
    return;
  }

  const deletedIds: string[] = [];
  const conflictedIds: string[] = [];

  for (const proposal of pending) {
    if (input.excludeProposalId && proposal.id === input.excludeProposalId) {
      continue;
    }

    const hunk: DocumentHunkChange = {
      key: proposal.hunkKey,
      index: proposal.hunkIndex,
      status: proposal.hunkStatus,
      before: proposal.hunkBefore,
      after: proposal.hunkAfter,
      beforeStart: proposal.hunkBeforeStart,
      beforeEnd: proposal.hunkBeforeEnd,
      afterStart: proposal.hunkAfterStart,
      afterEnd: proposal.hunkAfterEnd,
      prefix: proposal.hunkPrefix,
      suffix: proposal.hunkSuffix,
      classification: proposal.classification,
      conflictStatus: proposal.conflictStatus,
    };

    const merged = applyHunkChange(input.content, hunk);

    // Unanchorable against the new truth: flag for human re-review.
    if (!merged.ok) {
      if (proposal.conflictStatus !== "conflict") {
        await db
          .from("creed_document_proposals")
          .update({ conflict_status: "conflict" })
          .eq("id", proposal.id)
          .eq("status", "pending");
        conflictedIds.push(proposal.id);
      }
      continue;
    }

    // Applies but produces no change -> the edit already contains this change,
    // so the proposal is redundant. Delete it outright.
    if (merged.content === input.content) {
      await db
        .from("creed_document_proposals")
        .delete()
        .eq("id", proposal.id)
        .eq("status", "pending");
      deletedIds.push(proposal.id);
      continue;
    }

    // Still applies cleanly (possibly re-anchored). Clear any stale conflict.
    if (proposal.conflictStatus !== "clean") {
      await db
        .from("creed_document_proposals")
        .update({ conflict_status: "clean" })
        .eq("id", proposal.id)
        .eq("status", "pending");
    }
  }

  if (deletedIds.length === 0 && conflictedIds.length === 0) {
    return;
  }

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposals.reconciled",
    summary: "Reconciled pending proposals after a direct edit",
    metadata: {
      deletedProposalIds: deletedIds,
      conflictedProposalIds: conflictedIds,
    },
  });
}

// Split a whole-content submission into one proposal per changed hunk (all
// sharing a familyId) so each changed span can be reviewed on its own. Returns
// the created family in proposed document order.
export async function createDocumentProposal(
  client: unknown,
  input: {
    documentId: string;
    actorType: ActorType;
    author: DocumentEditAuthor;
    baseContent: string;
    content: string;
    summary: string;
    baseRevision: number;
  }
): Promise<ProposalResult<DocumentProposal[]>> {
  const db = client as SupabaseLikeClient;

  const changed = diffDocumentHunks(input.baseContent, input.content).filter(
    hunkChangeHasReviewableDiff
  );

  if (changed.length === 0) {
    return { ok: false, code: "invalid", error: "No changes to propose." };
  }

  const familyId = randomUUID();
  const now = new Date().toISOString();
  const rows = changed.map((hunk, hunkIndex) => ({
    document_id: input.documentId,
    actor_type: input.actorType,
    author_user_id: input.author.userId ?? null,
    author_agent_label: input.author.agentLabel ?? null,
    draft: { kind: "document-hunk", hunk: { ...hunk, index: hunkIndex } },
    family_id: familyId,
    hunk_index: hunkIndex,
    classification: hunk.classification,
    conflict_status: "clean",
    summary: input.summary,
    base_revision: input.baseRevision,
    status: "pending",
    resolving: false,
    created_at: now,
  }));

  const { data, error } = (await db
    .from("creed_document_proposals")
    .insert(rows)
    .select(PROPOSAL_COLUMNS)) as {
    data: DocumentProposalRow[] | null;
    error: { message: string } | null;
  };

  if (error || !data || data.length === 0) {
    return { ok: false, code: "invalid", error: error?.message || "Could not create proposals." };
  }

  // One activity event for the whole family keeps the audit trail readable even
  // when an edit touches many places.
  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.author.userId ?? null,
    action: "document.proposal_family.created",
    summary:
      input.summary ||
      `Proposed ${changed.length} ${changed.length === 1 ? "change" : "changes"}`,
    metadata: {
      familyId,
      proposalIds: data.map((row) => row.id),
      hunkCount: changed.length,
      actorType: input.actorType,
      agentLabel: input.author.agentLabel ?? null,
    },
  });

  return { ok: true, value: sortProposalsForReview(data.map(mapProposal)) };
}

export async function listDocumentProposals(
  client: unknown,
  documentId: string,
  options?: { status?: "pending" | "accepted" | "rejected" | "all" }
): Promise<DocumentProposal[]> {
  const db = client as SupabaseLikeClient;
  let query = db
    .from("creed_document_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("document_id", documentId);
  const status = options?.status ?? "pending";
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = (await query.order("created_at", { ascending: true })) as {
    data: DocumentProposalRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load proposals.");
  }

  const proposals = sortProposalsForReview((data ?? []).map(mapProposal));
  if (status !== "pending") {
    return proposals;
  }

  return proposals.filter((proposal) => {
    return hunkChangeHasReviewableDiff({
      status: proposal.hunkStatus,
      before: proposal.hunkBefore,
      after: proposal.hunkAfter,
    });
  });
}

// The single policy-gated entry point for a whole-content document edit.
export async function routeDocumentEdit(
  client: unknown,
  input: {
    documentId: string;
    actorType: ActorType;
    author: DocumentEditAuthor;
    content: string;
    expectedRevision: number;
    summary: string;
  }
): Promise<EditResult> {
  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  const changedHunks = diffDocumentHunks(document.content, input.content).filter(
    hunkChangeHasReviewableDiff
  );
  if (changedHunks.length === 0) {
    return {
      ok: false,
      code: "invalid",
      error: "No visible changes to apply.",
    };
  }

  const policy = await policyForActor(client, input.actorType);

  if (policy === "cant-edit") {
    return {
      ok: false,
      code: "forbidden",
      error:
        input.actorType === "agent"
          ? "Agent editing is turned off for this workspace."
          : "Editing is turned off for this workspace.",
    };
  }

  if (policy === "propose") {
    // Record the proposal(s) against the revision the caller actually read
    // (`expectedRevision`), not a fresh re-read. Otherwise a proposal authored
    // against an older revision would be stamped with the current revision.
    // Fall back to the current revision when the caller did not supply a real
    // read revision (e.g. an MCP agent that omitted expectedRevision).
    const created = await createDocumentProposal(client, {
      documentId: input.documentId,
      actorType: input.actorType,
      author: input.author,
      baseContent: document.content,
      content: input.content,
      summary: input.summary,
      baseRevision: input.expectedRevision > 0 ? input.expectedRevision : document.revision,
    });
    if (!created.ok) {
      return created;
    }
    return { ok: true, outcome: "proposed", proposals: created.value };
  }

  // direct
  const applied = await applyDocumentContent(client, {
    documentId: input.documentId,
    content: input.content,
    expectedRevision: input.expectedRevision,
    actorType: input.actorType,
    author: input.author,
    summary: input.summary,
    changeHunks: changedHunks,
  });
  if (!applied.ok) {
    return applied;
  }

  // The source of truth just moved. Re-anchor every other pending proposal
  // against the new content: drop the ones this edit already satisfied and
  // flag the ones it broke. Never creates a new proposal.
  try {
    await reconcilePendingProposalsAfterEdit(client, {
      documentId: input.documentId,
      content: applied.document.content,
      actorUserId: input.author.userId ?? null,
    });
  } catch (error) {
    log.warn(
      "document.proposal.reconcile_failed",
      { documentId: input.documentId },
      error
    );
  }

  return { ok: true, outcome: "applied", document: applied.document, version: applied.version };
}

// Atomically claim a pending proposal so concurrent accept/reject can't both win.
async function claimProposal(
  client: unknown,
  proposalId: string
): Promise<DocumentProposalRow | null> {
  const db = client as SupabaseLikeClient;
  const { data } = (await db
    .from("creed_document_proposals")
    .update({ resolving: true })
    .eq("id", proposalId)
    .eq("status", "pending")
    .eq("resolving", false)
    .select(PROPOSAL_COLUMNS)
    .maybeSingle()) as {
    data: DocumentProposalRow | null;
    error: { message: string } | null;
  };
  return data ?? null;
}

async function releaseProposalClaim(client: unknown, proposalId: string) {
  const db = client as SupabaseLikeClient;
  await db.from("creed_document_proposals").update({ resolving: false }).eq("id", proposalId);
}

async function markProposalConflict(client: unknown, proposalId: string) {
  const db = client as SupabaseLikeClient;
  await db
    .from("creed_document_proposals")
    .update({ resolving: false, conflict_status: "conflict" })
    .eq("id", proposalId);
}

export async function acceptDocumentProposal(
  client: unknown,
  input: {
    documentId: string;
    proposalId: string;
    actorUserId: string;
  }
): Promise<ProposalResult<{ document: SharedDocument; version: DocumentVersion }>> {
  const claimed = await claimProposal(client, input.proposalId);
  if (!claimed) {
    return {
      ok: false,
      code: "conflict",
      error: "This proposal is no longer pending or is already being acted on.",
    };
  }

  const proposal = mapProposal(claimed);
  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    await releaseProposalClaim(client, input.proposalId);
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  let acceptedProposalLabel: string | null = null;

  const hunk = hunkFromDraft(claimed.draft);
  if (!hunk) {
    await releaseProposalClaim(client, input.proposalId);
    return { ok: false, code: "invalid", error: "This change proposal is malformed." };
  }
  acceptedProposalLabel = proposal.classification || hunk.classification || "Change";

  const merged = applyHunkChange(document.content, hunk);
  if (!merged.ok) {
    await markProposalConflict(client, input.proposalId);
    return {
      ok: false,
      code: "conflict",
      error: merged.error,
    };
  }

  const applied = await applyDocumentContent(client, {
    documentId: input.documentId,
    content: merged.content,
    expectedRevision: document.revision,
    actorType: proposal.actorType,
    author: { userId: proposal.authorUserId, agentLabel: proposal.authorAgentLabel },
    summary: proposal.summary || acceptedProposalLabel,
    sourceProposalId: proposal.id,
    changeHunks: [hunk],
  });

  if (!applied.ok) {
    await releaseProposalClaim(client, input.proposalId);
    return applied;
  }

  const db = client as SupabaseLikeClient;
  await db
    .from("creed_document_proposals")
    .update({
      status: "accepted",
      resolving: false,
      conflict_status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: input.actorUserId,
    })
    .eq("id", input.proposalId);

  // The review conversation on this proposal is finished once it is accepted.
  await resolveOpenCommentsForProposal(client, {
    proposalId: input.proposalId,
    actorUserId: input.actorUserId,
  });

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposal.accepted",
    summary: acceptedProposalLabel
      ? `Accepted a proposal · ${acceptedProposalLabel}`
      : "Accepted a proposal",
    metadata: {
      proposalId: input.proposalId,
      revision: applied.version.revision,
      versionId: applied.version.id,
      familyId: proposal.familyId,
      hunkIndex: proposal.hunkIndex,
      ...(acceptedProposalLabel ? { changeName: acceptedProposalLabel } : {}),
    },
  });

  return { ok: true, value: { document: applied.document, version: applied.version } };
}

export async function rejectDocumentProposal(
  client: unknown,
  input: { documentId: string; proposalId: string; actorUserId: string }
): Promise<ProposalResult<DocumentProposal>> {
  const claimed = await claimProposal(client, input.proposalId);
  if (!claimed) {
    return {
      ok: false,
      code: "conflict",
      error: "This proposal is no longer pending or is already being acted on.",
    };
  }

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_proposals")
    .update({
      status: "rejected",
      resolving: false,
      conflict_status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: input.actorUserId,
    })
    .eq("id", input.proposalId)
    .select(PROPOSAL_COLUMNS)
    .single()) as {
    data: DocumentProposalRow | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    await releaseProposalClaim(client, input.proposalId);
    return { ok: false, code: "invalid", error: error?.message || "Could not reject proposal." };
  }

  // Rejecting also concludes the proposal's review conversation.
  await resolveOpenCommentsForProposal(client, {
    proposalId: input.proposalId,
    actorUserId: input.actorUserId,
  });

  const rejectedProposal = mapProposal(data);

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposal.rejected",
    summary: "Rejected a proposal",
    metadata: {
      proposalId: input.proposalId,
      familyId: rejectedProposal.familyId,
      hunkIndex: rejectedProposal.hunkIndex,
    },
  });

  return { ok: true, value: rejectedProposal };
}

function uniqueProposalIds(proposalIds: string[]) {
  return Array.from(new Set(proposalIds.map((id) => id.trim()).filter(Boolean)));
}

function proposalToHunk(proposal: DocumentProposal): DocumentHunkChange {
  return {
    key: proposal.hunkKey,
    index: proposal.hunkIndex,
    status: proposal.hunkStatus,
    before: proposal.hunkBefore,
    after: proposal.hunkAfter,
    beforeStart: proposal.hunkBeforeStart,
    beforeEnd: proposal.hunkBeforeEnd,
    afterStart: proposal.hunkAfterStart,
    afterEnd: proposal.hunkAfterEnd,
    prefix: proposal.hunkPrefix,
    suffix: proposal.hunkSuffix,
    classification: proposal.classification,
    conflictStatus: proposal.conflictStatus,
  };
}

async function claimProposals(
  client: unknown,
  input: { documentId: string; proposalIds: string[] }
): Promise<DocumentProposalRow[]> {
  const ids = uniqueProposalIds(input.proposalIds);
  if (ids.length === 0) return [];

  const db = client as SupabaseLikeClient;
  const { data } = (await db
    .from("creed_document_proposals")
    .update({ resolving: true })
    .eq("document_id", input.documentId)
    .in("id", ids)
    .eq("status", "pending")
    .eq("resolving", false)
    .select(PROPOSAL_COLUMNS)) as {
    data: DocumentProposalRow[] | null;
    error: { message: string } | null;
  };
  return data ?? [];
}

async function releaseProposalClaims(client: unknown, proposalIds: string[]) {
  const ids = uniqueProposalIds(proposalIds);
  if (ids.length === 0) return;
  const db = client as SupabaseLikeClient;
  await db.from("creed_document_proposals").update({ resolving: false }).in("id", ids);
}

async function markProposalConflicts(client: unknown, proposalIds: string[]) {
  const ids = uniqueProposalIds(proposalIds);
  if (ids.length === 0) return;
  const db = client as SupabaseLikeClient;
  await db
    .from("creed_document_proposals")
    .update({ resolving: false, conflict_status: "conflict" })
    .in("id", ids);
}

export async function acceptDocumentProposals(
  client: unknown,
  input: {
    documentId: string;
    proposalIds: string[];
    actorUserId: string;
  }
): Promise<BulkProposalResult<{ document: SharedDocument; version: DocumentVersion; proposals: DocumentProposal[] }>> {
  const ids = uniqueProposalIds(input.proposalIds);
  if (ids.length === 0) {
    return { ok: false, code: "invalid", error: "No proposals selected." };
  }

  const claimedRows = await claimProposals(client, {
    documentId: input.documentId,
    proposalIds: ids,
  });
  if (claimedRows.length !== ids.length) {
    const claimedIds = claimedRows.map((row) => row.id);
    await releaseProposalClaims(client, claimedIds);
    return {
      ok: false,
      code: "conflict",
      error: "One or more proposals are no longer pending.",
      settledProposalIds: claimedIds,
    };
  }

  const proposals = sortProposalsForReview(claimedRows.map(mapProposal));
  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    await releaseProposalClaims(client, ids);
    return { ok: false, code: "not-found", error: "Document not found.", settledProposalIds: ids };
  }

  let mergedContent = document.content;
  const acceptedHunks: DocumentHunkChange[] = [];
  const conflictedIds: string[] = [];

  for (const proposal of proposals) {
    const hunk = proposalToHunk(proposal);
    const merged = applyHunkChange(mergedContent, hunk);
    if (!merged.ok) {
      conflictedIds.push(proposal.id);
      continue;
    }
    mergedContent = merged.content;
    acceptedHunks.push(hunk);
  }

  if (conflictedIds.length > 0) {
    await markProposalConflicts(client, conflictedIds);
    await releaseProposalClaims(client, ids.filter((id) => !conflictedIds.includes(id)));
    return {
      ok: false,
      code: "conflict",
      error: "One or more proposals no longer match the document. Re-review them before accepting.",
      settledProposalIds: ids,
    };
  }

  if (mergedContent === document.content) {
    await releaseProposalClaims(client, ids);
    return {
      ok: false,
      code: "invalid",
      error: "Selected proposals do not change the document.",
      settledProposalIds: ids,
    };
  }

  const summary =
    proposals.length === 1
      ? proposals[0].summary || proposals[0].classification || "Accepted proposal"
      : `Accepted ${proposals.length} proposals`;
  const applied = await applyDocumentContent(client, {
    documentId: input.documentId,
    content: mergedContent,
    expectedRevision: document.revision,
    actorType: proposals[0]?.actorType ?? "human",
    author: {
      userId: proposals[0]?.authorUserId ?? null,
      agentLabel: proposals[0]?.authorAgentLabel ?? null,
    },
    summary,
    sourceProposalId: proposals.length === 1 ? proposals[0]?.id ?? null : null,
    changeHunks: acceptedHunks,
  });

  if (!applied.ok) {
    await releaseProposalClaims(client, ids);
    return { ...applied, settledProposalIds: ids };
  }

  const now = new Date().toISOString();
  const db = client as SupabaseLikeClient;
  await db
    .from("creed_document_proposals")
    .update({
      status: "accepted",
      resolving: false,
      conflict_status: "resolved",
      resolved_at: now,
      resolved_by: input.actorUserId,
    })
    .in("id", ids);

  await resolveOpenCommentsForProposals(client, {
    proposalIds: ids,
    actorUserId: input.actorUserId,
  });

  await reconcilePendingProposalsAfterEdit(client, {
    documentId: input.documentId,
    content: applied.document.content,
    actorUserId: input.actorUserId,
  });

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposals.accepted",
    summary: proposals.length === 1 ? "Accepted a proposal" : `Accepted ${proposals.length} proposals`,
    metadata: {
      proposalIds: ids,
      revision: applied.version.revision,
      versionId: applied.version.id,
      hunkCount: acceptedHunks.length,
    },
  });

  return {
    ok: true,
    value: { document: applied.document, version: applied.version, proposals },
  };
}

export async function rejectDocumentProposals(
  client: unknown,
  input: { documentId: string; proposalIds: string[]; actorUserId: string }
): Promise<BulkProposalResult<{ proposals: DocumentProposal[] }>> {
  const ids = uniqueProposalIds(input.proposalIds);
  if (ids.length === 0) {
    return { ok: false, code: "invalid", error: "No proposals selected." };
  }

  const claimedRows = await claimProposals(client, {
    documentId: input.documentId,
    proposalIds: ids,
  });
  if (claimedRows.length !== ids.length) {
    const claimedIds = claimedRows.map((row) => row.id);
    await releaseProposalClaims(client, claimedIds);
    return {
      ok: false,
      code: "conflict",
      error: "One or more proposals are no longer pending.",
      settledProposalIds: claimedIds,
    };
  }

  const proposals = sortProposalsForReview(claimedRows.map(mapProposal));
  const now = new Date().toISOString();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_proposals")
    .update({
      status: "rejected",
      resolving: false,
      conflict_status: "resolved",
      resolved_at: now,
      resolved_by: input.actorUserId,
    })
    .eq("document_id", input.documentId)
    .in("id", ids)
    .select(PROPOSAL_COLUMNS)) as {
    data: DocumentProposalRow[] | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    await releaseProposalClaims(client, ids);
    return {
      ok: false,
      code: "invalid",
      error: error?.message || "Could not reject proposals.",
      settledProposalIds: ids,
    };
  }

  await resolveOpenCommentsForProposals(client, {
    proposalIds: ids,
    actorUserId: input.actorUserId,
  });

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposals.rejected",
    summary: proposals.length === 1 ? "Rejected a proposal" : `Rejected ${proposals.length} proposals`,
    metadata: {
      proposalIds: ids,
      hunkCount: proposals.length,
    },
  });

  return { ok: true, value: { proposals: sortProposalsForReview(data.map(mapProposal)) } };
}

// Revert re-applies an old version's content through the policy-gated route, so
// it appends a new version and never deletes later ones.
export async function revertDocumentToVersion(
  client: unknown,
  input: {
    documentId: string;
    versionId: string;
    actorType: ActorType;
    author: DocumentEditAuthor;
    expectedRevision: number;
  }
): Promise<EditResult> {
  const version = await readDocumentVersion(client, {
    documentId: input.documentId,
    versionId: input.versionId,
  });
  if (!version) {
    return { ok: false, code: "not-found", error: "Version not found." };
  }

  return routeDocumentEdit(client, {
    documentId: input.documentId,
    actorType: input.actorType,
    author: input.author,
    content: version.content,
    expectedRevision: input.expectedRevision,
    summary: `Reverted to the version from ${new Date(version.createdAt).toISOString()}`,
  });
}
