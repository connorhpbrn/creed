import "server-only";
import type { DocumentHunkChange, DocumentHunkConflictStatus, DocumentHunkStatus } from "@/lib/document-hunk-diff";
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
  changeHunks: DocumentHunkChange[];
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
  change_hunks?: unknown;
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
  "change_hunks",
  "actor_type",
  "author_user_id",
  "author_agent_label",
  "summary",
  "source_proposal_id",
  "created_at",
].join(", ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function numberField(record: Record<string, unknown>, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hunkStatus(value: unknown): DocumentHunkStatus {
  return value === "added" || value === "removed" || value === "modified" ? value : "modified";
}

function conflictStatus(value: unknown): DocumentHunkConflictStatus {
  return value === "clean" || value === "conflict" || value === "resolved" ? value : "clean";
}

function mapStoredHunk(value: unknown, index: number): DocumentHunkChange | null {
  if (!isRecord(value)) return null;
  return {
    key: stringField(value, "key", `version-hunk:${index}`),
    index: numberField(value, "index", index),
    status: hunkStatus(value.status),
    before: stringField(value, "before"),
    after: stringField(value, "after"),
    beforeStart: numberField(value, "beforeStart"),
    beforeEnd: numberField(value, "beforeEnd"),
    afterStart: numberField(value, "afterStart"),
    afterEnd: numberField(value, "afterEnd"),
    prefix: stringField(value, "prefix"),
    suffix: stringField(value, "suffix"),
    classification: stringField(value, "classification"),
    conflictStatus: conflictStatus(value.conflictStatus),
  };
}

function mapStoredHunks(value: unknown): DocumentHunkChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const hunk = mapStoredHunk(item, index);
    return hunk ? [hunk] : [];
  });
}

function mapVersion(row: DocumentVersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    revision: row.revision,
    content: row.content ?? "",
    changeHunks: mapStoredHunks(row.change_hunks),
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
    changeHunks?: DocumentHunkChange[];
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
      change_hunks: input.changeHunks ?? [],
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
