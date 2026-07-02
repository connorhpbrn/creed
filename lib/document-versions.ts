import "server-only";
import type { ActorType } from "@/lib/workspace-settings";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Append-only version history for shared documents. Every applied change
// (accepted proposal or direct edit) records one immutable version. This is the
// version-control layer that replaces the removed GitHub sync.

export type DocumentVersion = {
  id: string;
  documentId: string;
  revision: number;
  content: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
  sourceProposalId: string | null;
  createdAt: string;
};

export type DocumentVersionSummary = Omit<DocumentVersion, "content"> & {
  content?: string;
};

type DocumentVersionRow = {
  id: string;
  document_id: string;
  revision: number;
  content: string | null;
  actor_type: string;
  author_user_id: string | null;
  author_agent_label: string | null;
  summary: string | null;
  source_proposal_id: string | null;
  created_at: string;
};

const VERSION_COLUMNS = [
  "id",
  "document_id",
  "revision",
  "content",
  "actor_type",
  "author_user_id",
  "author_agent_label",
  "summary",
  "source_proposal_id",
  "created_at",
].join(", ");

function mapVersion(row: DocumentVersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    revision: row.revision,
    content: row.content ?? "",
    actorType: row.actor_type === "agent" ? "agent" : "human",
    authorUserId: row.author_user_id,
    authorAgentLabel: row.author_agent_label,
    summary: row.summary ?? "",
    sourceProposalId: row.source_proposal_id,
    createdAt: row.created_at,
  };
}

export async function appendDocumentVersion(
  client: unknown,
  input: {
    documentId: string;
    revision: number;
    content: string;
    actorType: ActorType;
    authorUserId?: string | null;
    authorAgentLabel?: string | null;
    summary?: string;
    sourceProposalId?: string | null;
  }
): Promise<DocumentVersion> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_versions")
    .insert({
      document_id: input.documentId,
      revision: input.revision,
      content: input.content,
      actor_type: input.actorType,
      author_user_id: input.authorUserId ?? null,
      author_agent_label: input.authorAgentLabel ?? null,
      summary: input.summary ?? "",
      source_proposal_id: input.sourceProposalId ?? null,
    })
    .select(VERSION_COLUMNS)
    .single()) as {
    data: DocumentVersionRow | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    throw new Error(error?.message || "Could not record document version.");
  }

  return mapVersion(data);
}

export async function listDocumentVersions(
  client: unknown,
  documentId: string,
  options: { includeContent?: boolean; limit?: number } = {}
): Promise<DocumentVersionSummary[]> {
  const db = client as SupabaseLikeClient;
  const columns = options.includeContent
    ? VERSION_COLUMNS
    : VERSION_COLUMNS.split(", ")
        .filter((column) => column !== "content")
        .join(", ");

  let query = db
    .from("creed_document_versions")
    .select(columns)
    .eq("document_id", documentId)
    .order("revision", { ascending: false });

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = (await query) as {
    data: Array<Partial<DocumentVersionRow> & Omit<DocumentVersionRow, "content">> | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document versions.");
  }

  return (data ?? []).map((row) => {
    const version = mapVersion({ ...row, content: row.content ?? "" });
    if (options.includeContent) return version;
    const { content: _content, ...summary } = version;
    return summary;
  });
}

export async function readDocumentVersion(
  client: unknown,
  input: { documentId: string; versionId: string }
): Promise<DocumentVersion | null> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_versions")
    .select(VERSION_COLUMNS)
    .eq("id", input.versionId)
    .eq("document_id", input.documentId)
    .maybeSingle()) as {
    data: DocumentVersionRow | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document version.");
  }

  return data ? mapVersion(data) : null;
}
