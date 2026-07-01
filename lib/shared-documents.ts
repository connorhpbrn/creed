import { createHash } from "node:crypto";
import "server-only";
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
import { parseDocumentFile, serializeDocumentFile } from "@/lib/document-markdown";
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
  documentType: DocumentType;
  stage: DocumentStage;
  lifecycle: DocumentLifecycle;
  status: DocumentStatus;
  priority: DocumentPriority;
  size: DocumentSize;
  archivedAt: string | null;
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

function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
    if (!isDocumentType(input.documentType)) {
      return { ok: false as const, error: "Invalid document type." };
    }
    patch.document_type = input.documentType;
  }
  if (input.stage !== undefined) {
    if (!isDocumentStage(input.stage)) {
      return { ok: false as const, error: "Invalid stage." };
    }
    patch.stage = input.stage;
    if (input.lifecycle === undefined) {
      patch.lifecycle = defaultLifecycleForStage(input.stage);
    }
  }
  if (input.lifecycle !== undefined) {
    if (!isDocumentLifecycle(input.lifecycle)) {
      return { ok: false as const, error: "Invalid lifecycle." };
    }
    patch.lifecycle = input.lifecycle;
    patch.stage = lifecycleStage(input.lifecycle);
  }
  if (input.status !== undefined) {
    if (!isDocumentStatus(input.status)) {
      return { ok: false as const, error: "Invalid status." };
    }
    patch.status = input.status;
  }
  if (input.priority !== undefined) {
    if (!isDocumentPriority(input.priority)) {
      return { ok: false as const, error: "Invalid priority." };
    }
    patch.priority = input.priority;
  }
  if (input.size !== undefined) {
    if (!isDocumentSize(input.size)) {
      return { ok: false as const, error: "Invalid size." };
    }
    patch.size = input.size;
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
    documentType: isDocumentType(row.document_type) ? row.document_type : "feature",
    stage: isDocumentStage(row.stage) ? row.stage : "discovery",
    lifecycle: isDocumentLifecycle(row.lifecycle) ? row.lifecycle : "ideation",
    status: isDocumentStatus(row.status) ? row.status : "backlog",
    priority: isDocumentPriority(row.priority) ? row.priority : "medium",
    size: isDocumentSize(row.size) ? row.size : "m",
    archivedAt: row.archived_at,
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
      slug: path.replace(/\//g, "-"),
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
    documentType?: DocumentType;
    stage?: DocumentStage;
    lifecycle?: DocumentLifecycle;
    status?: DocumentStatus;
    priority?: DocumentPriority;
    size?: DocumentSize;
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
  const slug = path.replace(/\.md$/i, "").replace(/\//g, "-");
  const githubPath = ensureMarkdownPath(input.githubPath?.trim() || path);
  const githubRepoOwner = input.githubRepoOwner?.trim() || documentGithubDefault("OWNER");
  const githubRepoName = input.githubRepoName?.trim() || documentGithubDefault("REPO");
  const githubBranch = input.githubBranch?.trim() || documentGithubDefault("BRANCH") || "main";
  // Incoming content may carry property frontmatter (e.g. from an agent that
  // read the serialized file). Split it so `content` stays body-only and the
  // frontmatter seeds properties. Explicit structured args take precedence.
  const parsed = parseDocumentFile(input.content ?? "");
  const content = (input.content !== undefined ? parsed.body : "") || `# ${title}\n`;
  const metadata = cleanMetadataPatch({
    documentType: input.documentType ?? parsed.metadata.documentType,
    stage: input.stage ?? parsed.metadata.stage,
    lifecycle: input.lifecycle ?? parsed.metadata.lifecycle,
    status: input.status ?? parsed.metadata.status,
    priority: input.priority ?? parsed.metadata.priority,
    size: input.size ?? parsed.metadata.size,
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
      document_type: metadata.patch.document_type ?? "feature",
      stage: metadata.patch.stage ?? "discovery",
      lifecycle: metadata.patch.lifecycle ?? "ideation",
      status: metadata.patch.status ?? "backlog",
      priority: metadata.patch.priority ?? "medium",
      size: metadata.patch.size ?? "m",
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

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      ...metadata.patch,
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
  const [{ data: childFolders, error: childFoldersError }, { data: childDocuments, error: childDocumentsError }] =
    (await Promise.all([
      db
        .from("creed_document_folders")
        .select("id")
        .eq("parent_id", input.id)
        .is("archived_at", null)
        .limit(1),
      db
        .from("creed_documents")
        .select("id")
        .eq("folder_id", input.id)
        .is("archived_at", null)
        .limit(1),
    ])) as Array<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;

  assertNoError(childFoldersError, "Could not check folder contents.");
  assertNoError(childDocumentsError, "Could not check folder contents.");
  if ((childFolders?.length ?? 0) > 0 || (childDocuments?.length ?? 0) > 0) {
    return { ok: false, code: "conflict", error: "Archive or move the folder contents first." };
  }

  const now = nowIso();
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

export function hashDocumentContent(content: string) {
  return contentHash(content);
}

// The canonical GitHub representation of a document: property frontmatter
// followed by the body. This is what we push and what we hash for sync-status.
export function serializeSharedDocument(document: SharedDocument) {
  return serializeDocumentFile(document, document.content);
}

export async function markSharedDocumentSynced(
  client: unknown,
  input: {
    id: string;
    remoteSha: string;
    content: string;
    revision: number;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  // Guard on the revision we pushed. If a concurrent Creed edit moved the
  // document on while the push was in flight, no row matches and we must not
  // stamp "up-to-date" over content that is actually ahead of GitHub.
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      last_remote_sha: input.remoteSha,
      last_synced_content_hash: contentHash(input.content),
      last_synced_revision: input.revision,
      sync_status: "up-to-date",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.id)
    .eq("revision", input.revision)
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
      error: "Document changed in Creed during publish. Publish again to sync the latest revision.",
    };
  }

  return { ok: true, value: { ...mapDocumentSummary(data), content: data.content ?? "" } };
}

// Pull is authoritative: the remote Markdown replaces the Supabase content
// wholesale, mirroring the creed.md pull/apply behaviour. Property frontmatter
// from the remote file is applied to the columns in the same write. Guarded on
// `expectedRevision` so a concurrent Creed edit can't be silently clobbered.
export async function applyRemoteDocumentPull(
  client: unknown,
  input: {
    id: string;
    content: string;
    metadata: DocumentMetadataPatch;
    syncedContentHash: string;
    remoteSha: string;
    expectedRevision: number;
    actorUserId?: string | null;
  }
): Promise<MutationResult<SharedDocument>> {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    return { ok: false, code: "invalid", error: "A valid expectedRevision is required." };
  }

  const cleaned = cleanMetadataPatch(input.metadata);
  if (!cleaned.ok) {
    return { ok: false, code: "invalid", error: cleaned.error };
  }

  const now = nowIso();
  const nextRevision = input.expectedRevision + 1;
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_documents")
    .update({
      content: input.content,
      ...cleaned.patch,
      revision: nextRevision,
      last_remote_sha: input.remoteSha,
      last_synced_content_hash: input.syncedContentHash,
      last_synced_revision: nextRevision,
      sync_status: "up-to-date",
      updated_by: input.actorUserId ?? null,
      updated_at: now,
      last_edited_by: input.actorUserId ?? null,
      last_edited_via: "github",
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
      error: "Document changed since it was previewed. Re-open the pull and try again.",
    };
  }

  return { ok: true, value: { ...mapDocumentSummary(data), content: data.content ?? "" } };
}
