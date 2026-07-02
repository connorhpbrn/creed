import "server-only";
import {
  recordDocumentActivity,
  resolveOpenCommentsForProposal,
} from "@/lib/document-collaboration";
import {
  applySectionChange,
  diffMarkdownSections,
  sectionChangeLabel,
  type SectionChange,
  type SectionChangeStatus,
} from "@/lib/document-section-diff";
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
// per changed Markdown section (all sharing a `batchId`), so a reviewer can
// accept or reject each section independently. Each section proposal stores its
// own before/after so acceptance applies just that section, merge-guarded so
// siblings can land in any order. Legacy whole-content proposals (draft.kind =
// 'document-content') are still understood on the accept path.

export type DocumentEditAuthor = {
  userId?: string | null;
  agentLabel?: string | null;
};

export type DocumentProposalKind = "document-content" | "document-section";

export type DocumentProposal = {
  id: string;
  documentId: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  kind: DocumentProposalKind;
  // Whole-content proposals: the full proposed body. Section proposals: the
  // section's proposed body ("" for a removed section).
  content: string;
  summary: string;
  baseRevision: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  // Groups the sibling section proposals produced by one edit. Null for a
  // legacy whole-content proposal (which reviews as a group of one).
  batchId: string | null;
  // Section-scoped fields; all null for a whole-content proposal.
  sectionKey: string | null;
  sectionHeading: string | null;
  sectionLevel: number | null;
  sectionStatus: SectionChangeStatus | null;
  sectionBefore: string | null;
  sectionAfter: string | null;
  sectionProposedIndex: number | null;
  sectionPreviousKey: string | null;
  sectionNextKey: string | null;
};

type DocumentProposalRow = {
  id: string;
  document_id: string;
  actor_type: string;
  author_user_id: string | null;
  author_agent_label: string | null;
  draft: unknown;
  section_id: string | null;
  batch_id: string | null;
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
  "section_id",
  "batch_id",
  "summary",
  "base_revision",
  "status",
  "created_at",
  "resolved_at",
  "resolved_by",
].join(", ");

// A section-scoped draft carries the whole SectionChange so acceptance can
// merge-guard on the author-time `before` and splice in `after`.
type SectionDraft = {
  kind: "document-section";
  section: SectionChange;
};

function isSectionDraft(draft: unknown): draft is SectionDraft {
  return (
    !!draft &&
    typeof draft === "object" &&
    (draft as { kind?: unknown }).kind === "document-section" &&
    typeof (draft as { section?: unknown }).section === "object" &&
    (draft as { section?: unknown }).section !== null
  );
}

function draftContent(draft: unknown): string {
  if (draft && typeof draft === "object" && "content" in draft) {
    const value = (draft as { content?: unknown }).content;
    if (typeof value === "string") return value;
  }
  return "";
}

// Rebuild the SectionChange stored on a section proposal, tolerating partially
// shaped drafts.
function sectionFromDraft(draft: unknown): SectionChange | null {
  if (!isSectionDraft(draft)) return null;
  const section = draft.section as Partial<SectionChange>;
  if (typeof section.key !== "string") return null;
  return {
    key: section.key,
    heading: typeof section.heading === "string" ? section.heading : "",
    level: typeof section.level === "number" ? section.level : 0,
    status: (section.status as SectionChangeStatus) ?? "modified",
    before: typeof section.before === "string" ? section.before : "",
    after: typeof section.after === "string" ? section.after : "",
    proposedIndex: typeof section.proposedIndex === "number" ? section.proposedIndex : null,
    previousKey: typeof section.previousKey === "string" ? section.previousKey : null,
    nextKey: typeof section.nextKey === "string" ? section.nextKey : null,
  };
}

function mapProposal(row: DocumentProposalRow): DocumentProposal {
  const section = sectionFromDraft(row.draft);
  const kind: DocumentProposalKind = section ? "document-section" : "document-content";
  return {
    id: row.id,
    documentId: row.document_id,
    actorType: row.actor_type === "agent" ? "agent" : "human",
    authorUserId: row.author_user_id,
    authorAgentLabel: row.author_agent_label,
    kind,
    content: section ? section.after : draftContent(row.draft),
    summary: row.summary ?? "",
    baseRevision: row.base_revision,
    status: row.status === "accepted" ? "accepted" : row.status === "rejected" ? "rejected" : "pending",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    batchId: row.batch_id,
    sectionKey: section ? section.key : row.section_id,
    sectionHeading: section ? section.heading : null,
    sectionLevel: section ? section.level : null,
    sectionStatus: section ? section.status : null,
    sectionBefore: section ? section.before : null,
    sectionAfter: section ? section.after : null,
    sectionProposedIndex: section ? section.proposedIndex : null,
    sectionPreviousKey: section ? section.previousKey : null,
    sectionNextKey: section ? section.nextKey : null,
  };
}

function compareProposalReviewOrder(a: DocumentProposal, b: DocumentProposal) {
  if (a.batchId && b.batchId && a.batchId === b.batchId) {
    const aIndex = a.sectionProposedIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.sectionProposedIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
  }

  const created = a.createdAt.localeCompare(b.createdAt);
  if (created !== 0) return created;

  const aGroup = a.batchId ?? a.id;
  const bGroup = b.batchId ?? b.id;
  if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);

  const aIndex = a.sectionProposedIndex ?? Number.MAX_SAFE_INTEGER;
  const bIndex = b.sectionProposedIndex ?? Number.MAX_SAFE_INTEGER;
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
  });

  return { ok: true, document: applied.value, version };
}

// Split a whole-content submission into one proposal per changed Markdown
// section (all sharing a batchId) so each section can be reviewed on its own.
// Returns the created batch in proposed document order. When nothing changed,
// returns an empty batch (the caller treats that as "no proposal to record").
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

  const changed = diffMarkdownSections(input.baseContent, input.content).filter(
    (change) => change.status !== "unchanged"
  );

  if (changed.length === 0) {
    return { ok: false, code: "invalid", error: "No changes to propose." };
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const rows = changed.map((section) => ({
    document_id: input.documentId,
    actor_type: input.actorType,
    author_user_id: input.author.userId ?? null,
    author_agent_label: input.author.agentLabel ?? null,
    draft: { kind: "document-section", section },
    section_id: section.key,
    batch_id: batchId,
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

  // One activity event for the whole batch keeps the audit trail readable even
  // when an edit touches many sections.
  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.author.userId ?? null,
    action: "document.proposal.created",
    summary:
      input.summary ||
      `Proposed changes to ${changed.length} ${changed.length === 1 ? "section" : "sections"}`,
    metadata: {
      batchId,
      proposalIds: data.map((row) => row.id),
      sectionCount: changed.length,
      actorType: input.actorType,
      agentLabel: input.author.agentLabel ?? null,
    },
  });

  return { ok: true, value: sortProposalsForReview(data.map(mapProposal)) };
}

export async function listDocumentProposals(
  client: unknown,
  documentId: string,
  options?: { status?: "pending" | "accepted" | "rejected" }
): Promise<DocumentProposal[]> {
  const db = client as SupabaseLikeClient;
  let query = db
    .from("creed_document_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("document_id", documentId);
  query = query.eq("status", options?.status ?? "pending");

  const { data, error } = (await query.order("created_at", { ascending: true })) as {
    data: DocumentProposalRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load proposals.");
  }

  return sortProposalsForReview((data ?? []).map(mapProposal));
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

export async function acceptDocumentProposal(
  client: unknown,
  input: { documentId: string; proposalId: string; actorUserId: string }
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

  let applied:
    | { ok: true; document: SharedDocument; version: DocumentVersion }
    | { ok: false; code: "invalid" | "not-found" | "conflict"; error: string };

  let acceptedSectionLabel: string | null = null;

  if (proposal.kind === "document-section") {
    const section = sectionFromDraft(claimed.draft);
    if (!section) {
      await releaseProposalClaim(client, input.proposalId);
      return { ok: false, code: "invalid", error: "This section proposal is malformed." };
    }
    acceptedSectionLabel = sectionChangeLabel(section);

    // Merge-guarded apply: the section must still match what the author saw, so
    // sibling section proposals from the same edit can be accepted in any order
    // even though each acceptance advances the document revision.
    const merged = applySectionChange(document.content, section);
    if (!merged.ok) {
      await releaseProposalClaim(client, input.proposalId);
      return {
        ok: false,
        code: "conflict",
        error:
          "This section changed since the proposal was created. Re-review it before accepting.",
      };
    }

    applied = await applyDocumentContent(client, {
      documentId: input.documentId,
      content: merged.content,
      expectedRevision: document.revision,
      actorType: proposal.actorType,
      author: { userId: proposal.authorUserId, agentLabel: proposal.authorAgentLabel },
      summary: proposal.summary || `Accepted a change to ${sectionChangeLabel(section)}`,
      sourceProposalId: proposal.id,
    });
  } else {
    // Legacy whole-content proposal: apply against the revision it was authored
    // on, or accepting would clobber newer content.
    if (proposal.baseRevision !== document.revision) {
      await releaseProposalClaim(client, input.proposalId);
      return {
        ok: false,
        code: "conflict",
        error: "The document changed since this proposal was created. Re-review it before accepting.",
      };
    }

    applied = await applyDocumentContent(client, {
      documentId: input.documentId,
      content: proposal.content,
      expectedRevision: document.revision,
      actorType: proposal.actorType,
      author: { userId: proposal.authorUserId, agentLabel: proposal.authorAgentLabel },
      summary: proposal.summary || "Accepted proposal",
      sourceProposalId: proposal.id,
    });
  }

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
    summary: acceptedSectionLabel
      ? `Accepted a proposal · ${acceptedSectionLabel}`
      : "Accepted a proposal",
    metadata: {
      proposalId: input.proposalId,
      revision: applied.version.revision,
      versionId: applied.version.id,
      ...(acceptedSectionLabel ? { sectionName: acceptedSectionLabel } : {}),
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

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposal.rejected",
    summary: "Rejected a proposal",
    metadata: { proposalId: input.proposalId },
  });

  return { ok: true, value: mapProposal(data) };
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
