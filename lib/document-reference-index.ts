"use client";

// Client-side index of shared documents + folders used to power in-editor
// references: the `@` / slash document search and the chip/card node views
// that resolve a `[[doc:slug]]` token into a live title, description, and
// property pills.
//
// This is a module singleton so the
// list is fetched once and survives navigation between documents. Editor node
// views subscribe directly instead of prop-drilling a resolver, which keeps
// the plain-DOM node views decoupled from React state.

import type { DocReferenceKind } from "@/lib/document-reference";
import { referenceHref } from "@/lib/document-reference";
import type {
  DocumentLifecycle,
  DocumentPriority,
  DocumentSize,
  DocumentStage,
  DocumentStatus,
  DocumentType,
} from "@/lib/document-properties";

export type DocumentReferenceEntry = {
  id: string;
  kind: DocReferenceKind;
  slug: string;
  title: string;
  description: string;
  href: string;
  path: string;
  // Documents carry the dashboard properties so the card node view can render
  // the same pills as the dashboard. Folders leave these undefined.
  documentType?: DocumentType;
  status?: DocumentStatus;
  stage?: DocumentStage;
  lifecycle?: DocumentLifecycle;
  priority?: DocumentPriority;
  size?: DocumentSize;
  updatedAt?: string;
};

type Listener = () => void;

let entries: DocumentReferenceEntry[] = [];
let bySlug = new Map<string, DocumentReferenceEntry>();
let loaded = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function keyFor(kind: DocReferenceKind, slug: string) {
  return `${kind}:${slug}`;
}

function reindex() {
  const next = new Map<string, DocumentReferenceEntry>();
  for (const entry of entries) {
    next.set(keyFor(entry.kind, entry.slug), entry);
  }
  bySlug = next;
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

type DocumentRecord = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  path?: string | null;
  documentType?: DocumentType;
  status?: DocumentStatus;
  stage?: DocumentStage;
  lifecycle?: DocumentLifecycle;
  priority?: DocumentPriority;
  size?: DocumentSize;
  updatedAt?: string;
};

type FolderRecord = {
  id: string;
  slug: string;
  name: string;
  path?: string | null;
  updatedAt?: string;
};

function normalize(documents: DocumentRecord[], folders: FolderRecord[]): DocumentReferenceEntry[] {
  const docEntries = documents.map<DocumentReferenceEntry>((document) => ({
    id: document.id,
    kind: "doc",
    slug: document.slug,
    title: document.title || "Untitled document",
    description: document.description ?? "",
    href: referenceHref("doc", document.slug),
    path: document.path ?? document.title ?? "",
    documentType: document.documentType,
    status: document.status,
    stage: document.stage,
    lifecycle: document.lifecycle,
    priority: document.priority,
    size: document.size,
    updatedAt: document.updatedAt,
  }));

  const folderEntries = folders.map<DocumentReferenceEntry>((folder) => ({
    id: folder.id,
    kind: "folder",
    slug: folder.slug,
    title: folder.name || "Untitled folder",
    description: "",
    href: referenceHref("folder", folder.slug),
    path: folder.path ?? folder.name ?? "",
    updatedAt: folder.updatedAt,
  }));

  return [...docEntries, ...folderEntries];
}

async function load() {
  const [documentsResponse, foldersResponse] = await Promise.all([
    fetch("/api/app/documents", { headers: { accept: "application/json" } }),
    fetch("/api/app/document-folders", { headers: { accept: "application/json" } }),
  ]);

  const documents: DocumentRecord[] = documentsResponse.ok
    ? ((await documentsResponse.json()).documents ?? [])
    : [];
  const folders: FolderRecord[] = foldersResponse.ok
    ? ((await foldersResponse.json()).folders ?? [])
    : [];

  entries = normalize(documents, folders);
  reindex();
  loaded = true;
  emit();
}

// Lazily fetch the index once. Safe to call from many places (file screen,
// suggestion menu, node views) - concurrent calls share one request.
export function ensureReferenceIndex(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = load()
    .catch(() => {
      // Leave the index empty on failure; a later refresh can retry.
      loaded = false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resolveReference(
  kind: DocReferenceKind,
  slug: string
): DocumentReferenceEntry | null {
  return bySlug.get(keyFor(kind, slug)) ?? null;
}

export function searchReferences(query: string, limit = 8): DocumentReferenceEntry[] {
  const normalized = query.trim().toLowerCase();
  const pool = entries;
  const matches = normalized
    ? pool.filter((entry) => {
        const haystack = `${entry.title} ${entry.path} ${entry.slug}`.toLowerCase();
        return haystack.includes(normalized);
      })
    : pool;
  // Documents first (they are the common target), then folders, then by title.
  return [...matches]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "doc" ? -1 : 1;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

export function subscribeReferenceIndex(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
