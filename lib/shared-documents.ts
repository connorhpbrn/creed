import "server-only";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES,
  DEFAULT_VISIBLE_DOCUMENT_PROPERTIES,
  defaultLifecycleForStage,
  lifecycleStage,
  type DocumentDashboardPreferences,
  type DocumentLifecycle,
  type DocumentMetadataPatch,
  type DocumentPriority,
  type DocumentPropertyKey,
  type DocumentSize,
  type DocumentStage,
  type DocumentStatus,
  type DocumentType,
  isDocumentGroupKey,
  isDocumentLifecycle,
  isDocumentPriority,
  isDocumentPropertyKey,
  isDocumentSize,
  isDocumentSortDirection,
  isDocumentSortKey,
  isDocumentStage,
  isDocumentStatus,
  isDocumentType,
  isDocumentViewMode,
} from "@/lib/document-properties";
import { parseDocumentFile } from "@/lib/document-markdown";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

export type SharedDocumentFolder = {
  id: string;
  slug: string;
  name: string;
  path: string;
  parentId: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type SharedDocumentSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  path: string;
  folderId: string | null;
  githubRepoOwner: string | null;
  githubRepoName: string | null;
  githubBranch: string;
  githubPath: string;
  lastRemoteSha: string | null;
  lastSyncedContentHash: string | null;
  lastSyncedRevision: number | null;
  syncStatus: string;
  revision: number;
  documentType: DocumentType | null;
  stage: DocumentStage | null;
  lifecycle: DocumentLifecycle | null;
  status: DocumentStatus | null;
  priority: DocumentPriority | null;
  size: DocumentSize | null;
  archivedAt: string | null;
  publicShareId: string | null;
  publicShareEnabled: boolean;
  publicSharedAt: string | null;
  updatedAt: string;
};

export type SharedDocument = SharedDocumentSummary & {
  content: string;
};

type SharedDocumentFolderRow = {
  id: string;
  slug: string;
  name: string;
  path: string;
  parent_id: string | null;
  archived_at: string | null;
  updated_at: string;
};

type SharedDocumentRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content?: string | null;
  path: string | null;
  folder_id: string | null;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  github_branch: string | null;
  github_path: string | null;
  last_remote_sha: string | null;
  last_synced_content_hash: string | null;
  last_synced_revision: number | null;
  sync_status: string | null;
  revision: number | null;
  document_type: string | null;
  stage: string | null;
  lifecycle: string | null;
  status: string | null;
  priority: string | null;
  size: string | null;
  archived_at: string | null;
  public_share_id: string | null;
  public_share_enabled: boolean | null;
  public_shared_at: string | null;
  updated_at: string;
};

type DashboardPreferenceRow = {
  view_mode: string | null;
  group_by: string | null;
  sort_by: string | null;
  sort_dir: string | null;
  visible_properties: unknown;
};

type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: "conflict" | "invalid" | "not-found" };

const DOCUMENT_COLUMNS = [
  "id",
  "slug",
  "title",
  "description",
  "content",
  "path",
  "folder_id",
  "github_repo_owner",
  "github_repo_name",
  "github_branch",
  "github_path",
  "last_remote_sha",
  "last_synced_content_hash",
  "last_synced_revision",
  "sync_status",
  "revision",
  "document_type",
  "stage",
  "lifecycle",
  "status",
  "priority",
  "size",
  "archived_at",
  "public_share_id",
  "public_share_enabled",
  "public_shared_at",
  "updated_at",
].join(", ");

function assertNoError(error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(error.message || message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newPublicShareId() {
  return randomBytes(18).toString("base64url");
}

function slugifyDocumentPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureMarkdownPath(value: string) {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

function documentSlugFromPath(path: string) {
  return path.replace(/\.md$/i, "").replace(/\//g, "-");
}

function folderSlugFromPath(path: string) {
  return path.replace(/\//g, "-");
}

function documentGithubDefault(name: "OWNER" | "REPO" | "BRANCH") {
  return process.env[`CREED_DOCUMENTS_GITHUB_${name}`]?.trim() || null;
}

function normalizeVisibleProperties(value: unknown): DocumentPropertyKey[] {
  if (!Array.isArray(value)) {
    return DEFAULT_VISIBLE_DOCUMENT_PROPERTIES;
  }

  const properties = value.filter(isDocumentPropertyKey);
  return properties.length ? properties : DEFAULT_VISIBLE_DOCUMENT_PROPERTIES;
}

function mapDashboardPreferences(
  row: DashboardPreferenceRow | null | undefined
): DocumentDashboardPreferences {
  if (!row) {
    return DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES;
  }

  return {
    viewMode: isDocumentViewMode(row.view_mode) ? row.view_mode : DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES.viewMode,
    groupBy: isDocumentGroupKey(row.group_by) ? row.group_by : DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES.groupBy,
    sortBy: isDocumentSortKey(row.sort_by) ? row.sort_by : DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES.sortBy,
    sortDir: isDocumentSortDirection(row.sort_dir) ? row.sort_dir : DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES.sortDir,
    visibleProperties: normalizeVisibleProperties(row.visible_properties),
  };
}

function cleanMetadataPatch(input: DocumentMetadataPatch) {
  const patch: Record<string, string | null> = {};

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      return { ok: false as const, error: "Document title is required." };
    }
    patch.title = title;
  }
  if (typeof input.description === "string") {
    patch.description = input.description.trim();
  }
  if (input.folderId !== undefined) {
    patch.folder_id = input.folderId;
  }
  if (input.documentType !== undefined) {
    if (input.documentType === null) {
      patch.document_type = null;
    } else {
      if (!isDocumentType(input.documentType)) {
        return { ok: false as const, error: "Invalid document type." };
      }
      patch.document_type = input.documentType;
    }
  }
  if (input.stage !== undefined) {
    if (input.stage === null) {
      patch.stage = null;
      if (input.lifecycle === undefined) {
        patch.lifecycle = null;
      }
    } else {
      if (!isDocumentStage(input.stage)) {
        return { ok: false as const, error: "Invalid stage." };
      }
      patch.stage = input.stage;
      if (input.lifecycle === undefined) {
        patch.lifecycle = defaultLifecycleForStage(input.stage);
      }
    }
  }
  if (input.lifecycle !== undefined) {
    if (input.lifecycle === null) {
      patch.lifecycle = null;
      if (input.stage === undefined) {
        patch.stage = null;
      }
    } else {
      if (!isDocumentLifecycle(input.lifecycle)) {
        return { ok: false as const, error: "Invalid lifecycle." };
      }
      patch.lifecycle = input.lifecycle;
      patch.stage = lifecycleStage(input.lifecycle);
    }
  }
  if (input.status !== undefined) {
    if (input.status === null) {
      patch.status = null;
    } else {
      if (!isDocumentStatus(input.status)) {
        return { ok: false as const, error: "Invalid status." };
      }
      patch.status = input.status;
    }
  }
  if (input.priority !== undefined) {
    if (input.priority === null) {
      patch.priority = null;
    } else {
      if (!isDocumentPriority(input.priority)) {
        return { ok: false as const, error: "Invalid priority." };
      }
      patch.priority = input.priority;
    }
  }
  if (input.size !== undefined) {
    if (input.size === null) {
      patch.size = null;
    } else {
      if (!isDocumentSize(input.size)) {
        return { ok: false as const, error: "Invalid size." };
      }
      patch.size = input.size;
    }
  }

  return { ok: true as const, patch };
}

function mapFolder(row: SharedDocumentFolderRow): SharedDocumentFolder {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    path: row.path,
    parentId: row.parent_id,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  };
}

function mapDocumentSummary(row: SharedDocumentRow): SharedDocumentSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    path: row.path ?? `${row.slug}.md`,
    folderId: row.folder_id,
    githubRepoOwner: row.github_repo_owner,
    githubRepoName: row.github_repo_name,
    githubBranch: row.github_branch ?? "main",
    githubPath: row.github_path ?? row.path ?? `${row.slug}.md`,
    lastRemoteSha: row.last_remote_sha,
    lastSyncedContentHash: row.last_synced_content_hash,
    lastSyncedRevision: row.last_synced_revision,
    syncStatus: row.sync_status ?? "not-configured",
    revision: row.revision ?? 1,
    documentType: isDocumentType(row.document_type) ? row.document_type : null,
    stage: isDocumentStage(row.stage) ? row.stage : null,
    lifecycle: isDocumentLifecycle(row.lifecycle) ? row.lifecycle : null,
    status: isDocumentStatus(row.status) ? row.status : null,
    priority: isDocumentPriority(row.priority) ? row.priority : null,
    size: isDocumentSize(row.size) ? row.size : null,
    archivedAt: row.archived_at,
    publicShareId: row.public_share_id,
    publicShareEnabled: row.public_share_enabled === true,
    publicSharedAt: row.public_shared_at,
    updatedAt: row.updated_at,
  };
}

async function readFolderById(client: unknown, folderId?: string | null) {
  if (!folderId) return null;
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_folders")
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .eq("id", folderId)
    .is("archived_at", null)
    .maybeSingle()) as {
    data: SharedDocumentFolderRow | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load folder.");
  return data ? mapFolder(data) : null;
}

export async function listSharedDocumentFolders(client: unknown) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_folders")
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .is("archived_at", null)
    .order("path", { ascending: true })) as {
    data: SharedDocumentFolderRow[] | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load folders.");
  return (data ?? []).map(mapFolder);
}

export async function listSharedDocuments(client: unknown) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .select(DOCUMENT_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })) as {
    data: SharedDocumentRow[] | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load documents.");
  return (data ?? []).map(mapDocumentSummary);
}

export type SharedDocumentFolderDetail = SharedDocumentFolder & {
  childFolders: SharedDocumentFolder[];
  documents: SharedDocumentSummary[];
};

// Resolve a single folder by id or slug and return it along with the folders
// and documents it directly contains. This is the folder analogue of
// readSharedDocument / readSharedDocumentById.
export async function readSharedDocumentFolder(
  client: unknown,
  identifier: { folderId?: string | null; slug?: string | null }
): Promise<SharedDocumentFolderDetail | null> {
  const db = client as SupabaseLikeClient;
  const folderId = identifier.folderId?.trim();
  const slug = identifier.slug?.trim();
  if (!folderId && !slug) return null;

  const folderQuery = db
    .from("creed_document_folders")
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .is("archived_at", null);
  const { data: folderRow, error: folderError } = (await (folderId
    ? folderQuery.eq("id", folderId)
    : folderQuery.eq("slug", slug)
  ).maybeSingle()) as {
    data: SharedDocumentFolderRow | null;
    error: { message: string } | null;
  };

  assertNoError(folderError, "Could not load folder.");
  if (!folderRow) return null;

  const folder = mapFolder(folderRow);

  const [childFoldersResult, documentsResult] = (await Promise.all([
    db
      .from("creed_document_folders")
      .select("id, slug, name, path, parent_id, archived_at, updated_at")
      .eq("parent_id", folder.id)
      .is("archived_at", null)
      .order("path", { ascending: true }),
    db
      .from("creed_documents")
      .select(DOCUMENT_COLUMNS)
      .eq("folder_id", folder.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
  ])) as [
    { data: SharedDocumentFolderRow[] | null; error: { message: string } | null },
    { data: SharedDocumentRow[] | null; error: { message: string } | null },
  ];

  assertNoError(childFoldersResult.error, "Could not load child folders.");
  assertNoError(documentsResult.error, "Could not load folder documents.");

  return {
    ...folder,
    childFolders: (childFoldersResult.data ?? []).map(mapFolder),
    documents: (documentsResult.data ?? []).map(mapDocumentSummary),
  };
}

export async function readSharedDocument(client: unknown, slug: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load document.");
  if (!data) {
    return null;
  }

  return {
    ...mapDocumentSummary(data),
    content: data.content ?? "",
  } satisfies SharedDocument;
}

export async function readSharedDocumentById(client: unknown, id: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load document.");
  if (!data) return null;

  return {
    ...mapDocumentSummary(data),
    content: data.content ?? "",
  } satisfies SharedDocument;
}

export async function readPublicSharedDocument(client: unknown, publicShareId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("public_share_id", publicShareId.trim())
    .eq("public_share_enabled", true)
    .is("archived_at", null)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load shared document.");
  if (!data) return null;

  return {
    ...mapDocumentSummary(data),
    content: data.content ?? "",
  } satisfies SharedDocument;
}

export async function ensurePublicDocumentShare(
  client: unknown,
  input: {
    id: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  const current = await readSharedDocumentById(client, input.id);
  if (!current) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  if (current.publicShareEnabled && current.publicShareId) {
    return { ok: true, value: current };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      public_share_id: current.publicShareId ?? newPublicShareId(),
      public_share_enabled: true,
      public_shared_at: current.publicSharedAt ?? now,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.id)
    .is("archived_at", null)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "conflict", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  return {
    ok: true,
    value: {
      ...mapDocumentSummary(data),
      content: data.content ?? "",
    },
  };
}

export async function createSharedDocumentFolder(
  client: unknown,
  input: {
    name: string;
    parentFolderId?: string | null;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocumentFolder>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, code: "invalid", error: "Folder name is required." };
  }

  const parent = await readFolderById(client, input.parentFolderId);
  if (input.parentFolderId && !parent) {
    return { ok: false, code: "not-found", error: "Parent folder was not found." };
  }

  const slugBase = slugifyDocumentPart(name);
  if (!slugBase) {
    return { ok: false, code: "invalid", error: "Folder name must include letters or numbers." };
  }

  const path = parent ? `${parent.path}/${slugBase}` : slugBase;
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_folders")
    .insert({
      slug: folderSlugFromPath(path),
      name,
      path,
      parent_id: parent?.id ?? null,
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .single()) as {
    data: SharedDocumentFolderRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "conflict", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "invalid", error: "Folder was not created." };
  }

  return { ok: true, value: mapFolder(data) };
}

export async function createSharedDocument(
  client: unknown,
  input: {
    title: string;
    description?: string;
    content?: string;
    folderId?: string | null;
    actorUserId?: string | null;
    githubRepoOwner?: string | null;
    githubRepoName?: string | null;
    githubBranch?: string | null;
    githubPath?: string | null;
    lastEditedVia?: string | null;
    documentType?: DocumentType | null;
    stage?: DocumentStage | null;
    lifecycle?: DocumentLifecycle | null;
    status?: DocumentStatus | null;
    priority?: DocumentPriority | null;
    size?: DocumentSize | null;
  }
): Promise<MutationResult<SharedDocument>> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, code: "invalid", error: "Document title is required." };
  }

  const folder = await readFolderById(client, input.folderId);
  if (input.folderId && !folder) {
    return { ok: false, code: "not-found", error: "Folder was not found." };
  }

  const titleSlug = slugifyDocumentPart(title);
  if (!titleSlug) {
    return { ok: false, code: "invalid", error: "Document title must include letters or numbers." };
  }

  const path = folder ? `${folder.path}/${titleSlug}.md` : `${titleSlug}.md`;
  const slug = documentSlugFromPath(path);
  const githubPath = ensureMarkdownPath(input.githubPath?.trim() || path);
  const githubRepoOwner = input.githubRepoOwner?.trim() || documentGithubDefault("OWNER");
  const githubRepoName = input.githubRepoName?.trim() || documentGithubDefault("REPO");
  const githubBranch = input.githubBranch?.trim() || documentGithubDefault("BRANCH") || "main";
  // Incoming content may carry property frontmatter (e.g. from an agent that
  // read the serialized file). Split it so `content` stays body-only and the
  // frontmatter seeds properties. Explicit structured args take precedence.
  const parsed = parseDocumentFile(input.content ?? "");
  const content = input.content !== undefined ? parsed.body : "";
  const metadata = cleanMetadataPatch({
    documentType: input.documentType !== undefined ? input.documentType : parsed.metadata.documentType,
    stage: input.stage !== undefined ? input.stage : parsed.metadata.stage,
    lifecycle: input.lifecycle !== undefined ? input.lifecycle : parsed.metadata.lifecycle,
    status: input.status !== undefined ? input.status : parsed.metadata.status,
    priority: input.priority !== undefined ? input.priority : parsed.metadata.priority,
    size: input.size !== undefined ? input.size : parsed.metadata.size,
  });
  if (!metadata.ok) {
    return { ok: false, code: "invalid", error: metadata.error };
  }
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .insert({
      slug,
      title,
      description: input.description?.trim() ?? "",
      content,
      folder_id: folder?.id ?? null,
      path,
      github_repo_owner: githubRepoOwner,
      github_repo_name: githubRepoName,
      github_branch: githubBranch,
      github_path: githubPath,
      sync_status: "local-ahead",
      revision: 1,
      document_type: metadata.patch.document_type ?? null,
      stage: metadata.patch.stage ?? null,
      lifecycle: metadata.patch.lifecycle ?? null,
      status: metadata.patch.status ?? null,
      priority: metadata.patch.priority ?? null,
      size: metadata.patch.size ?? null,
      last_synced_content_hash: null,
      last_synced_revision: null,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: input.lastEditedVia?.trim() || "creed",
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(DOCUMENT_COLUMNS)
    .single()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "conflict", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "invalid", error: "Document was not created." };
  }

  return { ok: true, value: { ...mapDocumentSummary(data), content: data.content ?? "" } };
}

export async function updateSharedDocumentContent(
  client: unknown,
  input: {
    id: string;
    content: string;
    expectedRevision: number;
    actorUserId?: string | null;
    lastEditedVia?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Document id is required." };
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    return { ok: false, code: "invalid", error: "A valid expectedRevision is required." };
  }

  // Content arrives from the editor (body only) or from an agent/API caller
  // that may include YAML frontmatter. Parse it out so property columns stay
  // authoritative and the `content` column always holds body-only Markdown.
  const { metadata, body } = parseDocumentFile(input.content);
  const cleaned = cleanMetadataPatch(metadata);
  if (!cleaned.ok) {
    return { ok: false, code: "invalid", error: cleaned.error };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      content: body,
      ...cleaned.patch,
      revision: input.expectedRevision + 1,
      sync_status: "local-ahead",
      last_synced_content_hash: null,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: input.lastEditedVia?.trim() || "creed",
    })
    .eq("id", input.id)
    .eq("revision", input.expectedRevision)
    .is("archived_at", null)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      code: "conflict",
      error:
        "Document changed since it was read. Re-read the document and retry with the current revision.",
    };
  }

  return {
    ok: true,
    value: {
      ...mapDocumentSummary(data),
      content: data.content ?? "",
    },
  };
}

export async function updateSharedDocumentMetadata(
  client: unknown,
  input: {
    id: string;
    patch: DocumentMetadataPatch;
    expectedRevision?: number | null;
    actorUserId?: string | null;
    lastEditedVia?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Document id is required." };
  }

  const metadata = cleanMetadataPatch(input.patch);
  if (!metadata.ok) {
    return { ok: false, code: "invalid", error: metadata.error };
  }
  if (Object.keys(metadata.patch).length === 0) {
    return { ok: false, code: "invalid", error: "No document properties were provided." };
  }

  const current = await readSharedDocumentById(client, input.id);
  if (!current) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== null &&
    input.expectedRevision !== current.revision
  ) {
    return {
      ok: false,
      code: "conflict",
      error:
        "Document changed since it was read. Re-read the document and retry with the current revision.",
    };
  }

  const targetFolderId =
    input.patch.folderId !== undefined ? input.patch.folderId : current.folderId;
  const targetFolder = await readFolderById(client, targetFolderId);
  if (targetFolderId && !targetFolder) {
    return { ok: false, code: "not-found", error: "Folder was not found." };
  }

  const title = typeof input.patch.title === "string" ? input.patch.title.trim() : current.title;
  const titleSlug = slugifyDocumentPart(title);
  if (!titleSlug) {
    return { ok: false, code: "invalid", error: "Document title must include letters or numbers." };
  }
  const path = targetFolder ? `${targetFolder.path}/${titleSlug}.md` : `${titleSlug}.md`;
  const pathPatch: { slug?: string; path?: string; github_path?: string } =
    input.patch.title !== undefined || input.patch.folderId !== undefined
      ? {
          slug: documentSlugFromPath(path),
          path,
          github_path: path,
        }
      : {};

  const now = nowIso();
  const db = client as SupabaseLikeClient;

  if (pathPatch.path && pathPatch.slug) {
    const [pathConflictResult, slugConflictResult] = (await Promise.all([
      db
        .from("creed_documents")
        .select("id")
        .eq("path", pathPatch.path)
        .is("archived_at", null)
        .maybeSingle(),
      db
        .from("creed_documents")
        .select("id")
        .eq("slug", pathPatch.slug)
        .is("archived_at", null)
        .maybeSingle(),
    ])) as [
      { data: { id: string } | null; error: { message: string } | null },
      { data: { id: string } | null; error: { message: string } | null },
    ];
    assertNoError(pathConflictResult.error, "Could not check document path.");
    assertNoError(slugConflictResult.error, "Could not check document slug.");
    if (pathConflictResult.data && pathConflictResult.data.id !== input.id) {
      return { ok: false, code: "conflict", error: "A document with that path already exists." };
    }
    if (slugConflictResult.data && slugConflictResult.data.id !== input.id) {
      return { ok: false, code: "conflict", error: "A document with that name already exists." };
    }
  }

  const { data, error } = (await db
    .from("creed_documents")
    .update({
      ...metadata.patch,
      ...pathPatch,
      revision: current.revision + 1,
      sync_status: "local-ahead",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: input.lastEditedVia?.trim() || "creed",
    })
    .eq("id", input.id)
    .eq("revision", current.revision)
    .is("archived_at", null)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      code: "conflict",
      error:
        "Document changed since it was read. Re-read the document and retry with the current revision.",
    };
  }

  return {
    ok: true,
    value: {
      ...mapDocumentSummary(data),
      content: data.content ?? "",
    },
  };
}

export async function archiveSharedDocument(
  client: unknown,
  input: {
    id: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  const current = await readSharedDocumentById(client, input.id);
  if (!current) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      archived_at: now,
      revision: current.revision + 1,
      sync_status: "local-ahead",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: "creed",
    })
    .eq("id", input.id)
    .eq("revision", current.revision)
    .is("archived_at", null)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "conflict", error: "Document changed before it could be archived." };
  }

  return { ok: true, value: { ...mapDocumentSummary(data), content: data.content ?? "" } };
}

export async function updateSharedDocumentFolder(
  client: unknown,
  input: {
    id: string;
    name: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocumentFolder>> {
  const current = await readFolderById(client, input.id);
  if (!current) {
    return { ok: false, code: "not-found", error: "Folder not found." };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, code: "invalid", error: "Folder name is required." };
  }

  const slugBase = slugifyDocumentPart(name);
  if (!slugBase) {
    return { ok: false, code: "invalid", error: "Folder name must include letters or numbers." };
  }

  const parent = await readFolderById(client, current.parentId);
  const oldPath = current.path;
  const nextPath = parent ? `${parent.path}/${slugBase}` : slugBase;
  const now = nowIso();
  const db = client as SupabaseLikeClient;

  const [foldersResult, documentsResult] = (await Promise.all([
    db
      .from("creed_document_folders")
      .select("id, slug, name, path, parent_id, archived_at, updated_at"),
    db
      .from("creed_documents")
      .select("id, slug, path, archived_at"),
  ])) as [
    { data: SharedDocumentFolderRow[] | null; error: { message: string } | null },
    {
      data: Array<{ id: string; slug: string; path: string | null; archived_at: string | null }> | null;
      error: { message: string } | null;
    },
  ];
  assertNoError(foldersResult.error, "Could not load folders.");
  assertNoError(documentsResult.error, "Could not load documents.");

  const allFolders = foldersResult.data ?? [];
  const allDocuments = documentsResult.data ?? [];
  const activeFolders = allFolders.filter((folder) => folder.archived_at === null);
  const activeDocuments = allDocuments.filter((document) => document.archived_at === null);
  const folderUpdates = allFolders
    .filter((folder) => folder.path === oldPath || folder.path.startsWith(`${oldPath}/`))
    .map((folder) => {
      const path = folder.path === oldPath ? nextPath : `${nextPath}${folder.path.slice(oldPath.length)}`;
      return { ...folder, nextPath: path, nextSlug: folderSlugFromPath(path) };
    });
  const documentUpdates = allDocuments
    .filter((document) => {
      const path = document.path ?? "";
      return path.startsWith(`${oldPath}/`);
    })
    .map((document) => {
      const path = `${nextPath}${(document.path ?? "").slice(oldPath.length)}`;
      return { ...document, nextPath: path, nextSlug: documentSlugFromPath(path) };
    });

  const subtreeFolderIds = new Set(folderUpdates.map((folder) => folder.id));
  const subtreeDocumentIds = new Set(documentUpdates.map((document) => document.id));
  const conflictingFolder = activeFolders.find(
    (folder) =>
      !subtreeFolderIds.has(folder.id) &&
      folderUpdates.some(
        (update) => update.nextPath === folder.path || update.nextSlug === folder.slug
      )
  );
  if (conflictingFolder) {
    return { ok: false, code: "conflict", error: "A folder with that path already exists." };
  }
  const conflictingDocument = activeDocuments.find(
    (document) =>
      !subtreeDocumentIds.has(document.id) &&
      documentUpdates.some(
        (update) => update.nextPath === document.path || update.nextSlug === document.slug
      )
  );
  if (conflictingDocument) {
    return { ok: false, code: "conflict", error: "A document with that path already exists." };
  }

  for (const folder of folderUpdates) {
    const { data, error } = (await db
      .from("creed_document_folders")
      .update({
        ...(folder.id === current.id ? { name } : {}),
        slug: folder.nextSlug,
        path: folder.nextPath,
        updated_by: input.actorUserId ?? null,
        updated_at: now,
      })
      .eq("id", folder.id)
      .select("id, slug, name, path, parent_id, archived_at, updated_at")
      .maybeSingle()) as {
      data: SharedDocumentFolderRow | null;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "conflict", error: error.message };
    }
    if (!data) {
      return { ok: false, code: "not-found", error: "Folder not found." };
    }
  }

  for (const document of documentUpdates) {
    const { error } = (await db
      .from("creed_documents")
      .update({
        slug: document.nextSlug,
        path: document.nextPath,
        github_path: document.nextPath,
        sync_status: "local-ahead",
        last_synced_content_hash: null,
        updated_by: input.actorUserId ?? null,
        updated_at: now,
        last_edited_by: input.actorUserId ?? null,
        last_edited_via: "creed",
      })
      .eq("id", document.id)) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "conflict", error: error.message };
    }
  }

  const renamed = await readFolderById(client, input.id);
  if (!renamed) {
    return { ok: false, code: "not-found", error: "Folder not found." };
  }
  return { ok: true, value: renamed };
}

// Collects a folder and all of its descendant folder ids (depth-first). Includes
// archived descendants so cascade archive/delete cover the whole subtree. The
// root id is always the first element.
async function collectFolderSubtreeIds(client: unknown, rootId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_folders")
    .select("id, parent_id")) as {
    data: Array<{ id: string; parent_id: string | null }> | null;
    error: { message: string } | null;
  };
  assertNoError(error, "Could not load folder tree.");

  const childrenByParent = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.parent_id) continue;
    childrenByParent.set(row.parent_id, [...(childrenByParent.get(row.parent_id) ?? []), row.id]);
  }

  const ids: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return ids;
}

export async function archiveSharedDocumentFolder(
  client: unknown,
  input: {
    id: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocumentFolder>> {
  const folder = await readFolderById(client, input.id);
  if (!folder) {
    return { ok: false, code: "not-found", error: "Folder not found." };
  }

  const db = client as SupabaseLikeClient;
  const now = nowIso();

  // Cascade: archiving a folder archives every nested document and subfolder so
  // nothing is left orphaned or stranded in a now-hidden folder.
  const subtreeIds = await collectFolderSubtreeIds(client, input.id);

  const { error: documentsError } = (await db
    .from("creed_documents")
    .update({
      archived_at: now,
      sync_status: "local-ahead",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: "creed",
    })
    .in("folder_id", subtreeIds)
    .is("archived_at", null)) as { error: { message: string } | null };
  assertNoError(documentsError, "Could not archive folder documents.");

  // Archive descendant folders first, then the target folder itself last so its
  // returned row reflects the final state.
  const descendantIds = subtreeIds.filter((id) => id !== input.id);
  if (descendantIds.length) {
    const { error: descendantsError } = (await db
      .from("creed_document_folders")
      .update({
        archived_at: now,
        updated_by: input.actorUserId ?? null,
        updated_at: now,
      })
      .in("id", descendantIds)
      .is("archived_at", null)) as { error: { message: string } | null };
    assertNoError(descendantsError, "Could not archive subfolders.");
  }

  const { data, error } = (await db
    .from("creed_document_folders")
    .update({
      archived_at: now,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.id)
    .is("archived_at", null)
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .maybeSingle()) as {
    data: SharedDocumentFolderRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Folder not found." };
  }

  return { ok: true, value: mapFolder(data) };
}

export async function listArchivedSharedDocuments(client: unknown) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .select(DOCUMENT_COLUMNS)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })) as {
    data: SharedDocumentRow[] | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load archived documents.");
  return (data ?? []).map(mapDocumentSummary);
}

export async function listArchivedSharedDocumentFolders(client: unknown) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_folders")
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })) as {
    data: SharedDocumentFolderRow[] | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not load archived folders.");
  return (data ?? []).map(mapFolder);
}

export async function restoreSharedDocument(
  client: unknown,
  input: {
    id: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocumentSummary>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Document id is required." };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;

  // If the document's folder is archived or gone (e.g. the doc is being
  // individually restored out of a cascade-archived folder), detach it to the
  // root so the restored document is not stranded under an unreachable folder.
  const { data: existingDoc } = (await db
    .from("creed_documents")
    .select("folder_id")
    .eq("id", input.id)
    .maybeSingle()) as { data: { folder_id: string | null } | null };
  const detachFolder = existingDoc?.folder_id
    ? (await readFolderById(client, existingDoc.folder_id)) === null
    : false;

  const { data, error } = (await db
    .from("creed_documents")
    .update({
      archived_at: null,
      ...(detachFolder ? { folder_id: null } : {}),
      sync_status: "local-ahead",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: "creed",
    })
    .eq("id", input.id)
    .not("archived_at", "is", null)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()) as {
    data: SharedDocumentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Archived document not found." };
  }

  return { ok: true, value: mapDocumentSummary(data) };
}

export async function restoreSharedDocumentFolder(
  client: unknown,
  input: {
    id: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocumentFolder>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Folder id is required." };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;

  // If the folder's parent is archived or gone, detach it to the root so the
  // restored folder is not stranded under an unreachable parent.
  const { data: existingFolder } = (await db
    .from("creed_document_folders")
    .select("parent_id")
    .eq("id", input.id)
    .maybeSingle()) as { data: { parent_id: string | null } | null };
  const detachParent = existingFolder?.parent_id
    ? (await readFolderById(client, existingFolder.parent_id)) === null
    : false;

  const { data, error } = (await db
    .from("creed_document_folders")
    .update({
      archived_at: null,
      ...(detachParent ? { parent_id: null } : {}),
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.id)
    .not("archived_at", "is", null)
    .select("id, slug, name, path, parent_id, archived_at, updated_at")
    .maybeSingle()) as {
    data: SharedDocumentFolderRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Archived folder not found." };
  }

  return { ok: true, value: mapFolder(data) };
}

// Permanent delete. Related rows (versions, proposals, comments, activity,
// notifications) cascade via `on delete cascade`. Folder deletes remove their
// documents explicitly (see deleteSharedDocumentFolder). Only archived items
// may be hard-deleted.
export async function deleteSharedDocument(
  client: unknown,
  input: {
    id: string;
  }
): Promise<MutationResult<{ id: string }>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Document id is required." };
  }

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .delete()
    .eq("id", input.id)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Archived document not found." };
  }

  return { ok: true, value: { id: data.id } };
}

export async function deleteSharedDocumentFolder(
  client: unknown,
  input: {
    id: string;
  }
): Promise<MutationResult<{ id: string }>> {
  if (!input.id.trim()) {
    return { ok: false, code: "invalid", error: "Folder id is required." };
  }

  const db = client as SupabaseLikeClient;

  // Only archived folders may be permanently deleted. Read the row directly
  // (readFolderById filters to non-archived, so it can't be used here).
  const { data: root, error: rootError } = (await db
    .from("creed_document_folders")
    .select("id, archived_at")
    .eq("id", input.id)
    .maybeSingle()) as {
    data: { id: string; archived_at: string | null } | null;
    error: { message: string } | null;
  };
  assertNoError(rootError, "Could not load folder.");
  if (!root) {
    return { ok: false, code: "not-found", error: "Folder not found." };
  }
  if (!root.archived_at) {
    return { ok: false, code: "conflict", error: "Archive the folder before deleting it." };
  }

  // Cascade: remove every ARCHIVED document in the subtree (their versions,
  // proposals, comments, activity and notifications cascade via `on delete
  // cascade`), then remove every folder in the subtree. Documents that were
  // individually restored (archived_at IS NULL) must NOT be hard-deleted here;
  // when their folder row is removed below, `documents.folder_id` is
  // `on delete set null`, so they survive and fall back to the root view.
  const subtreeIds = await collectFolderSubtreeIds(client, input.id);

  const { error: documentsError } = (await db
    .from("creed_documents")
    .delete()
    .in("folder_id", subtreeIds)
    .not("archived_at", "is", null)) as { error: { message: string } | null };
  if (documentsError) {
    return { ok: false, code: "invalid", error: documentsError.message };
  }

  const { error: foldersError } = (await db
    .from("creed_document_folders")
    .delete()
    .in("id", subtreeIds)) as { error: { message: string } | null };
  if (foldersError) {
    return { ok: false, code: "invalid", error: foldersError.message };
  }

  return { ok: true, value: { id: input.id } };
}

export async function readDocumentDashboardPreferences(
  client: unknown,
  userId: string
): Promise<{
  global: DocumentDashboardPreferences;
  user: DocumentDashboardPreferences | null;
  effective: DocumentDashboardPreferences;
}> {
  const db = client as SupabaseLikeClient;
  const [globalResult, userResult] = (await Promise.all([
    db
      .from("creed_document_dashboard_global_preferences")
      .select("view_mode, group_by, sort_by, sort_dir, visible_properties")
      .eq("id", true)
      .maybeSingle(),
    db
      .from("creed_document_dashboard_user_preferences")
      .select("view_mode, group_by, sort_by, sort_dir, visible_properties")
      .eq("user_id", userId)
      .maybeSingle(),
  ])) as Array<{
    data: DashboardPreferenceRow | null;
    error: { message: string } | null;
  }>;

  assertNoError(globalResult.error, "Could not load shared dashboard view.");
  assertNoError(userResult.error, "Could not load your dashboard view.");

  const global = mapDashboardPreferences(globalResult.data);
  const user = userResult.data ? mapDashboardPreferences(userResult.data) : null;
  return {
    global,
    user,
    effective: user ?? global,
  };
}

export async function saveDocumentDashboardPreferences(
  client: unknown,
  input: {
    userId: string;
    scope: "user" | "global";
    preferences: Partial<DocumentDashboardPreferences>;
  }
): Promise<MutationResult<DocumentDashboardPreferences>> {
  const current = await readDocumentDashboardPreferences(client, input.userId);
  const base = input.scope === "global" ? current.global : current.effective;
  const preferences = {
    viewMode: isDocumentViewMode(input.preferences.viewMode)
      ? input.preferences.viewMode
      : base.viewMode,
    groupBy: isDocumentGroupKey(input.preferences.groupBy)
      ? input.preferences.groupBy
      : base.groupBy,
    sortBy: isDocumentSortKey(input.preferences.sortBy)
      ? input.preferences.sortBy
      : base.sortBy,
    sortDir: isDocumentSortDirection(input.preferences.sortDir)
      ? input.preferences.sortDir
      : base.sortDir,
    visibleProperties: input.preferences.visibleProperties
      ? normalizeVisibleProperties(input.preferences.visibleProperties)
      : base.visibleProperties,
  } satisfies DocumentDashboardPreferences;

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const table =
    input.scope === "global"
      ? "creed_document_dashboard_global_preferences"
      : "creed_document_dashboard_user_preferences";
  const values =
    input.scope === "global"
      ? {
          id: true,
          view_mode: preferences.viewMode,
          group_by: preferences.groupBy,
          sort_by: preferences.sortBy,
          sort_dir: preferences.sortDir,
          visible_properties: preferences.visibleProperties,
          updated_by: input.userId,
          updated_at: now,
        }
      : {
          user_id: input.userId,
          view_mode: preferences.viewMode,
          group_by: preferences.groupBy,
          sort_by: preferences.sortBy,
          sort_dir: preferences.sortDir,
          visible_properties: preferences.visibleProperties,
          updated_at: now,
        };

  const { data, error } = (await db
    .from(table)
    .upsert(values)
    .select("view_mode, group_by, sort_by, sort_dir, visible_properties")
    .single()) as {
    data: DashboardPreferenceRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  return { ok: true, value: mapDashboardPreferences(data) };
}

// Document versioning and review now live entirely in Supabase (see
// lib/document-editing.ts and lib/document-versions.ts). The former GitHub
// sync helpers (serialize/markSynced/applyRemotePull) were removed with the
// document GitHub routes.
