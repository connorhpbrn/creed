import "server-only";
import {
  recordDocumentActivity,
  resolveOpenCommentsForProposal,
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
