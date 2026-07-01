import "server-only";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { appendDocumentVersion, readDocumentVersion, type DocumentVersion } from "@/lib/document-versions";
import {
  readSharedDocumentById,
  updateSharedDocumentContent,
  type SharedDocument,
} from "@/lib/shared-documents";
import { policyForActor, type ActorType } from "@/lib/workspace-settings";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Model S edit engine. Every document mutation flows through `routeDocumentEdit`,
// which reads the workspace policy for the actor type and either rejects it,
// records a workspace-shared proposal, or applies it and appends a version.
// Shared documents are edited as whole-content changes (the editor and the MCP
// document tools both submit full Markdown), so a proposal stores the full
// proposed content; the UI diffs it section-by-section for review.

export type DocumentEditAuthor = {
  userId?: string | null;
  agentLabel?: string | null;
};

export type DocumentProposal = {
  id: string;
  documentId: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  content: string;
  summary: string;
  baseRevision: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

type DocumentProposalRow = {
  id: string;
  document_id: string;
  actor_type: string;
  author_user_id: string | null;
  author_agent_label: string | null;
  draft: unknown;
  summary: string | null;
  base_revision: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type EditResult =
  | { ok: true; outcome: "proposed"; proposal: DocumentProposal }
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
  "summary",
  "base_revision",
  "status",
  "created_at",
  "resolved_at",
  "resolved_by",
].join(", ");

function draftContent(draft: unknown): string {
  if (draft && typeof draft === "object" && "content" in draft) {
    const value = (draft as { content?: unknown }).content;
    if (typeof value === "string") return value;
  }
  return "";
}

function mapProposal(row: DocumentProposalRow): DocumentProposal {
  return {
    id: row.id,
    documentId: row.document_id,
    actorType: row.actor_type === "agent" ? "agent" : "human",
    authorUserId: row.author_user_id,
    authorAgentLabel: row.author_agent_label,
    content: draftContent(row.draft),
    summary: row.summary ?? "",
    baseRevision: row.base_revision,
    status: row.status === "accepted" ? "accepted" : row.status === "rejected" ? "rejected" : "pending",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
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

export async function createDocumentProposal(
  client: unknown,
  input: {
    documentId: string;
    actorType: ActorType;
    author: DocumentEditAuthor;
    content: string;
    summary: string;
    baseRevision: number;
  }
): Promise<ProposalResult<DocumentProposal>> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_proposals")
    .insert({
      document_id: input.documentId,
      actor_type: input.actorType,
      author_user_id: input.author.userId ?? null,
      author_agent_label: input.author.agentLabel ?? null,
      draft: { kind: "document-content", content: input.content },
      summary: input.summary,
      base_revision: input.baseRevision,
      status: "pending",
      resolving: false,
    })
    .select(PROPOSAL_COLUMNS)
    .single()) as {
    data: DocumentProposalRow | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return { ok: false, code: "invalid", error: error?.message || "Could not create proposal." };
  }

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.author.userId ?? null,
    action: "document.proposal.created",
    summary: input.summary || "Proposed a change",
    metadata: {
      proposalId: data.id,
      actorType: input.actorType,
      agentLabel: input.author.agentLabel ?? null,
    },
  });

  return { ok: true, value: mapProposal(data) };
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

  return (data ?? []).map(mapProposal);
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
    // Record the proposal against the revision the caller actually read
    // (`expectedRevision`), not a fresh re-read. Otherwise a proposal authored
    // against an older revision would be stamped with the current revision, and
    // the accept-time guard (`baseRevision === document.revision`) would let it
    // silently clobber intervening edits the author never saw. Fall back to the
    // current revision when the caller did not supply a real read revision
    // (e.g. an MCP agent that omitted expectedRevision), preserving the prior
    // best-effort behaviour rather than forcing a guaranteed conflict.
    const created = await createDocumentProposal(client, {
      documentId: input.documentId,
      actorType: input.actorType,
      author: input.author,
      content: input.content,
      summary: input.summary,
      baseRevision: input.expectedRevision > 0 ? input.expectedRevision : document.revision,
    });
    if (!created.ok) {
      return created;
    }
    return { ok: true, outcome: "proposed", proposal: created.value };
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

  // Whole-content proposals must apply against the revision they were authored
  // on; if the document moved on, accepting would clobber the newer content.
  if (proposal.baseRevision !== document.revision) {
    await releaseProposalClaim(client, input.proposalId);
    return {
      ok: false,
      code: "conflict",
      error: "The document changed since this proposal was created. Re-review it before accepting.",
    };
  }

  const applied = await applyDocumentContent(client, {
    documentId: input.documentId,
    content: proposal.content,
    expectedRevision: document.revision,
    actorType: proposal.actorType,
    author: { userId: proposal.authorUserId, agentLabel: proposal.authorAgentLabel },
    summary: proposal.summary || "Accepted proposal",
    sourceProposalId: proposal.id,
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
      resolved_at: new Date().toISOString(),
      resolved_by: input.actorUserId,
    })
    .eq("id", input.proposalId);

  await recordDocumentActivity(client, {
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: "document.proposal.accepted",
    summary: "Accepted a proposal",
    metadata: { proposalId: input.proposalId, revision: applied.version.revision },
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
