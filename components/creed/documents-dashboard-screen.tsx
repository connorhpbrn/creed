"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  Archive,
  CircleDashed,
  Clock3,
  FileText,
  Flag,
  Folder,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  TShirt,
} from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateDocumentDialog } from "@/components/creed/create-document-dialog";
import {
  DOCUMENT_GROUP_OPTIONS,
  DOCUMENT_LIFECYCLE_OPTIONS,
  DOCUMENT_PRIORITY_OPTIONS,
  DOCUMENT_PROPERTY_OPTIONS,
  DOCUMENT_SIZE_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  DOCUMENT_STAGE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TONE_DOT,
  DOCUMENT_TONE_STYLE,
  DOCUMENT_TYPE_OPTIONS,
  DEFAULT_VISIBLE_DOCUMENT_PROPERTIES,
  documentPropertyTone,
  labelDocumentProperty,
  type DocumentDashboardPreferences,
  type DocumentGroupKey,
  type DocumentLifecycle,
  type DocumentPriority,
  type DocumentPropertyKey,
  type DocumentSize,
  type DocumentSortDirection,
  type DocumentSortKey,
  type DocumentStage,
  type DocumentStatus,
  type DocumentType,
  type DocumentViewMode,
} from "@/lib/document-properties";
import type { SharedDocumentFolder, SharedDocumentSummary } from "@/lib/shared-documents";
import { cn } from "@/lib/utils";

type DashboardDocument = SharedDocumentSummary;

type PropertyValueMap = {
  status: DocumentStatus;
  documentType: DocumentType;
  stage: DocumentStage;
  lifecycle: DocumentLifecycle;
  priority: DocumentPriority;
  size: DocumentSize;
};

const PROPERTY_OPTIONS = {
  status: DOCUMENT_STATUS_OPTIONS,
  documentType: DOCUMENT_TYPE_OPTIONS,
  stage: DOCUMENT_STAGE_OPTIONS,
  lifecycle: DOCUMENT_LIFECYCLE_OPTIONS,
  priority: DOCUMENT_PRIORITY_OPTIONS,
  size: DOCUMENT_SIZE_OPTIONS,
} as const;

const STATUS_ORDER: DocumentStatus[] = [
  "backlog",
  "planning",
  "in-progress",
  "review",
  "done",
];
const PRIORITY_ORDER: DocumentPriority[] = ["urgent", "high", "medium", "low"];
const SIZE_ORDER: DocumentSize[] = ["xs", "s", "m", "l", "xl"];

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

function propertyLabel(property: DocumentPropertyKey) {
  return DOCUMENT_PROPERTY_OPTIONS.find((option) => option.value === property)?.label ?? property;
}

function PropertyTypeIcon({ property }: { property: DocumentPropertyKey }) {
  const className = "h-3 w-3 shrink-0";

  if (property === "status") return <CircleDashed className={className} />;
  if (property === "documentType") return <Tag className={className} />;
  if (property === "stage") return <LayoutGrid className={className} />;
  if (property === "lifecycle") return <RotateCcw className={className} />;
  if (property === "priority") return <Flag className={className} />;
  return <TShirt className={className} />;
}

function groupLabel(groupBy: DocumentGroupKey, value: string) {
  if (groupBy === "none") return "All documents";
  return labelDocumentProperty(groupBy, value);
}

function comparableValue(document: DashboardDocument, sortBy: DocumentSortKey) {
  if (sortBy === "name") return document.title.toLowerCase();
  if (sortBy === "updated") return new Date(document.updatedAt).getTime();
  if (sortBy === "status") return STATUS_ORDER.indexOf(document.status);
  if (sortBy === "priority") return PRIORITY_ORDER.indexOf(document.priority);
  if (sortBy === "size") return SIZE_ORDER.indexOf(document.size);
  return document[sortBy].toLowerCase();
}

function sortDocuments(
  documents: DashboardDocument[],
  sortBy: DocumentSortKey,
  sortDir: DocumentSortDirection
) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...documents].sort((a, b) => {
    const aValue = comparableValue(a, sortBy);
    const bValue = comparableValue(b, sortBy);
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return a.title.localeCompare(b.title);
  });
}

function groupedDocuments(documents: DashboardDocument[], groupBy: DocumentGroupKey) {
  if (groupBy === "none") {
    return [{ key: "all", label: "All documents", value: "", documents }];
  }

  const groups = new Map<string, DashboardDocument[]>();
  for (const document of documents) {
    const value = String(document[groupBy]);
    groups.set(value, [...(groups.get(value) ?? []), document]);
  }

  const options = PROPERTY_OPTIONS[groupBy];
  return options.map((option) => ({
    key: option.value,
    label: groupLabel(groupBy, option.value),
    value: option.value,
    documents: groups.get(option.value) ?? [],
  }));
}

// Compact inline select for the toolbar (group / sort / direction).
function InlineSelect<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  label: string;
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)]"
        >
          <span className="text-[var(--creed-text-tertiary)]">{label}</span>
          <span className="text-[var(--creed-text-primary)]">{current}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Editable colored pill: shows the value as a soft tinted badge; clicking opens
// a dropdown to change it. Status gets a leading dot (Notion-style).
function PropertyPill({
  property,
  value,
  disabled,
  onChange,
}: {
  property: DocumentPropertyKey;
  value: string;
  disabled?: boolean;
  onChange: (property: DocumentPropertyKey, value: string) => void;
}) {
  const options = PROPERTY_OPTIONS[property] as unknown as ReadonlyArray<{ value: string; label: string }>;
  const label = options.find((option) => option.value === value)?.label ?? value;
  const tone = documentPropertyTone(property, value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          style={DOCUMENT_TONE_STYLE[tone]}
          className={cn(
            "inline-flex h-6 w-fit max-w-full items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <PropertyTypeIcon property={property} />
          <span className="min-w-0 truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel>{propertyLabel(property)}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(property, next)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentRow({
  document,
  visibleProperties,
  updating,
  onPropertyChange,
  onArchive,
  onDragStart,
  onDragEnd,
}: {
  document: DashboardDocument;
  visibleProperties: DocumentPropertyKey[];
  updating: boolean;
  onPropertyChange: (property: DocumentPropertyKey, value: string) => void;
  onArchive: () => void;
  onDragStart: (documentId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(document.id)}
      onDragEnd={onDragEnd}
      className="group/row flex items-center gap-3 rounded-[8px] px-2.5 py-2 transition hover:bg-[var(--creed-surface-raised)]/60"
    >
      <FileText className="h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={1.8} />
      <Link
        href={`/file?document=${encodeURIComponent(document.slug)}`}
        className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--creed-text-primary)] hover:text-[#2563EB]"
        title={document.title}
      >
        {document.title}
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {visibleProperties.map((property) => (
          <PropertyPill
            key={property}
            property={property}
            value={String(document[property])}
            disabled={updating}
            onChange={onPropertyChange}
          />
        ))}
      </div>

      <span className="w-12 shrink-0 text-right text-[12px] text-[var(--creed-text-tertiary)]">
        {formatUpdatedAt(document.updatedAt)}
      </span>

      <button
        type="button"
        disabled={updating}
        onClick={onArchive}
        aria-label={`Archive ${document.title}`}
        title="Archive"
        className="inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/row:opacity-100 disabled:opacity-50"
      >
        {updating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function DocumentCard({
  document,
  visibleProperties,
  updating,
  onPropertyChange,
  onArchive,
  onDragStart,
  onDragEnd,
}: {
  document: DashboardDocument;
  visibleProperties: DocumentPropertyKey[];
  updating: boolean;
  onPropertyChange: (property: DocumentPropertyKey, value: string) => void;
  onArchive: () => void;
  onDragStart: (documentId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(document.id)}
      onDragEnd={onDragEnd}
      className="group/card flex min-h-[150px] flex-col rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3.5 transition hover:border-[var(--creed-border-strong)] hover:shadow-[0_6px_20px_rgba(28,28,26,0.05)]"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/file?document=${encodeURIComponent(document.slug)}`}
          className="min-w-0 text-[14px] font-semibold leading-snug text-[var(--creed-text-primary)] hover:text-[#2563EB]"
        >
          <span className="line-clamp-2">{document.title}</span>
        </Link>
      </div>

      {document.description ? (
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-[var(--creed-text-tertiary)]">
          {document.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {visibleProperties.map((property) => (
          <PropertyPill
            key={property}
            property={property}
            value={String(document[property])}
            disabled={updating}
            onChange={onPropertyChange}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-[12px] text-[var(--creed-text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
          {formatUpdatedAt(document.updatedAt)}
        </span>
        <button
          type="button"
          disabled={updating}
          onClick={onArchive}
          aria-label={`Archive ${document.title}`}
          title="Archive"
          className="inline-grid size-7 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/card:opacity-100 disabled:opacity-50"
        >
          {updating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ViewSwitcher({
  viewMode,
  onChange,
}: {
  viewMode: DocumentViewMode;
  onChange: (mode: DocumentViewMode) => void;
}) {
  const options: Array<{ mode: DocumentViewMode; icon: ReactNode; label: string }> = [
    { mode: "list", icon: <List className="h-4 w-4" strokeWidth={1.8} />, label: "List view" },
    { mode: "cards", icon: <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />, label: "Card view" },
  ];

  return (
    <div className="inline-flex h-8 items-center rounded-[8px] border border-[var(--creed-border)] p-0.5">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChange(option.mode)}
          aria-label={option.label}
          title={option.label}
          aria-pressed={viewMode === option.mode}
          className={cn(
            "inline-flex h-7 w-8 items-center justify-center rounded-[6px] text-[var(--creed-text-tertiary)] transition",
            viewMode === option.mode &&
              "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function DocumentsDashboardScreen({
  documents,
  folders,
  preferences,
}: {
  documents: SharedDocumentSummary[];
  folders: SharedDocumentFolder[];
  preferences: DocumentDashboardPreferences;
}) {
  const router = useRouter();
  const [documentRows, setDocumentRows] = useState<DashboardDocument[]>(documents);
  const [folderRows, setFolderRows] = useState<SharedDocumentFolder[]>(folders);
  const [viewMode, setViewMode] = useState<DocumentViewMode>(preferences.viewMode);
  const [groupBy, setGroupBy] = useState<DocumentGroupKey>(preferences.groupBy);
  const [sortBy, setSortBy] = useState<DocumentSortKey>(preferences.sortBy);
  const [sortDir, setSortDir] = useState<DocumentSortDirection>(preferences.sortDir);
  const [visibleProperties, setVisibleProperties] = useState<DocumentPropertyKey[]>(
    preferences.visibleProperties.length ? preferences.visibleProperties : DEFAULT_VISIBLE_DOCUMENT_PROPERTIES
  );
  const [filter, setFilter] = useState("");
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [savingView, setSavingView] = useState<"user" | "global" | null>(null);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);
  const [updatingFolderId, setUpdatingFolderId] = useState<string | null>(null);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);

  const filteredDocuments = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? documentRows.filter((document) =>
          [
            document.title,
            document.description,
            document.path,
            document.status,
            document.documentType,
            document.stage,
            document.lifecycle,
            document.priority,
            document.size,
          ].some((value) => value.toLowerCase().includes(query))
        )
      : documentRows;

    return sortDocuments(filtered, sortBy, sortDir);
  }, [documentRows, filter, sortBy, sortDir]);

  const groups = useMemo(
    () => groupedDocuments(filteredDocuments, groupBy),
    [filteredDocuments, groupBy]
  );

  function currentPreferences() {
    return {
      viewMode,
      groupBy,
      sortBy,
      sortDir,
      visibleProperties,
    } satisfies DocumentDashboardPreferences;
  }

  async function savePreferences(scope: "user" | "global") {
    if (savingView) return;
    try {
      setSavingView(scope);
      const response = await fetch("/api/app/document-dashboard-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, preferences: currentPreferences() }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not save view."));
      }
      toast.success(scope === "global" ? "Shared view saved" : "View saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save view.");
    } finally {
      setSavingView(null);
    }
  }

  async function archiveFolder(folderId: string) {
    if (updatingFolderId) return;
    try {
      setUpdatingFolderId(folderId);
      const response = await fetch(`/api/app/document-folders/${encodeURIComponent(folderId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not archive folder."));
      }
      setFolderRows((rows) => rows.filter((folder) => folder.id !== folderId));
      toast.success("Folder archived");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive folder.");
    } finally {
      setUpdatingFolderId(null);
    }
  }

  async function updateDocument<K extends DocumentPropertyKey>(
    documentId: string,
    property: K,
    value: PropertyValueMap[K]
  ) {
    if (updatingDocumentId) return;
    try {
      setUpdatingDocumentId(documentId);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [property]: value }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not update document."));
      }
      const payload = await response.json() as { document?: SharedDocumentSummary };
      if (payload.document) {
        setDocumentRows((rows) => rows.map((row) => row.id === documentId ? payload.document! : row));
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update document.");
    } finally {
      setUpdatingDocumentId(null);
    }
  }

  function updateDocumentFromString(
    documentId: string,
    property: DocumentPropertyKey,
    value: string
  ) {
    if (property === "status") void updateDocument(documentId, property, value as DocumentStatus);
    if (property === "documentType") void updateDocument(documentId, property, value as DocumentType);
    if (property === "stage") void updateDocument(documentId, property, value as DocumentStage);
    if (property === "lifecycle") void updateDocument(documentId, property, value as DocumentLifecycle);
    if (property === "priority") void updateDocument(documentId, property, value as DocumentPriority);
    if (property === "size") void updateDocument(documentId, property, value as DocumentSize);
  }

  async function archiveDocument(documentId: string) {
    if (updatingDocumentId) return;
    try {
      setUpdatingDocumentId(documentId);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not archive document."));
      }
      setDocumentRows((rows) => rows.filter((row) => row.id !== documentId));
      toast.success("Document archived");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive document.");
    } finally {
      setUpdatingDocumentId(null);
    }
  }

  function toggleVisibleProperty(property: DocumentPropertyKey) {
    setVisibleProperties((current) => {
      if (current.includes(property)) {
        const next = current.filter((item) => item !== property);
        return next.length ? next : current;
      }
      return [...current, property];
    });
  }

  function handleDropOnGroup(event: DragEvent<HTMLDivElement>, value: string) {
    event.preventDefault();
    const documentId = draggedDocumentId;
    setDraggedDocumentId(null);
    if (!documentId || groupBy === "none" || !value) return;
    const document = documentRows.find((row) => row.id === documentId);
    if (!document || String(document[groupBy]) === value) return;

    if (groupBy === "status") void updateDocument(documentId, "status", value as DocumentStatus);
    if (groupBy === "documentType") void updateDocument(documentId, "documentType", value as DocumentType);
    if (groupBy === "stage") void updateDocument(documentId, "stage", value as DocumentStage);
    if (groupBy === "lifecycle") void updateDocument(documentId, "lifecycle", value as DocumentLifecycle);
    if (groupBy === "priority") void updateDocument(documentId, "priority", value as DocumentPriority);
    if (groupBy === "size") void updateDocument(documentId, "size", value as DocumentSize);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--creed-surface)]">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--creed-border)] px-5 py-3 md:px-8">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-semibold text-[var(--creed-text-primary)]">Documents</h1>
          <span className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
            {documentRows.length}
          </span>
        </div>

        <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateDocumentOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          New document
        </Button>
      </header>

      {/* Toolbar (floating) */}
      <div className="px-5 pt-3 md:px-8">
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2 shadow-[0_8px_24px_rgba(28,28,26,0.06)]">
        <span className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--creed-text-tertiary)]"
            strokeWidth={1.8}
          />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search documents"
            className="h-8 pl-8"
          />
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewSwitcher viewMode={viewMode} onChange={setViewMode} />
          <InlineSelect label="Group" value={groupBy} options={DOCUMENT_GROUP_OPTIONS} onChange={setGroupBy} />
          <InlineSelect label="Sort" value={sortBy} options={DOCUMENT_SORT_OPTIONS} onChange={setSortBy} />
          <InlineSelect
            label="Dir"
            value={sortDir}
            options={[
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" },
            ]}
            onChange={setSortDir}
          />

          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[8px] border border-[var(--creed-border)] px-2.5 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)] [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
              Properties
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_12px_30px_rgba(28,28,26,0.1)]">
              {DOCUMENT_PROPERTY_OPTIONS.map((property) => (
                <label
                  key={property.value}
                  className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1.5 text-[13px] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
                >
                  <input
                    type="checkbox"
                    checked={visibleProperties.includes(property.value)}
                    onChange={() => toggleVisibleProperty(property.value)}
                    className="h-4 w-4"
                  />
                  {property.label}
                </label>
              ))}
            </div>
          </details>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="View options">
                {savingView ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuLabel>Save current view</DropdownMenuLabel>
              <DropdownMenuItem disabled={Boolean(savingView)} onSelect={() => void savePreferences("user")}>
                Save for me
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={Boolean(savingView)} onSelect={() => void savePreferences("global")}>
                Save for everyone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
      </div>

      {/* Folders strip */}
      {folderRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--creed-border)] px-5 py-2.5 md:px-8">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
            <Folder className="h-3.5 w-3.5" strokeWidth={1.8} />
            Folders
          </span>
          {folderRows.map((folder) => (
            <span
              key={folder.id}
              className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-[var(--creed-border)] px-2 text-[12px] text-[var(--creed-text-secondary)]"
            >
              {folder.path}
              <button
                type="button"
                disabled={updatingFolderId === folder.id}
                onClick={() => void archiveFolder(folder.id)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-[5px] text-[var(--creed-text-tertiary)] transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:opacity-50"
                aria-label={`Archive ${folder.path}`}
              >
                {updatingFolderId === folder.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Documents */}
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-8">
        {filteredDocuments.length > 0 ? (
          <div className="space-y-7">
            {groups.map((group) => (
              <div
                key={group.key}
                onDragOver={(event) => {
                  if (groupBy !== "none") event.preventDefault();
                }}
                onDrop={(event) => handleDropOnGroup(event, group.value)}
                className={cn(
                  "rounded-[10px] border border-transparent",
                  draggedDocumentId && groupBy !== "none" && "border-dashed border-[var(--creed-border)]"
                )}
              >
                {groupBy !== "none" ? (
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", DOCUMENT_TONE_DOT[documentPropertyTone(groupBy as DocumentPropertyKey, group.value)])} />
                    <h2 className="text-[13px] font-semibold text-[var(--creed-text-primary)]">
                      {group.label}
                    </h2>
                    <span className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                      {group.documents.length}
                    </span>
                  </div>
                ) : null}

                {group.documents.length > 0 ? (
                  viewMode === "list" ? (
                    <div className="space-y-px">
                      {group.documents.map((document) => (
                        <DocumentRow
                          key={document.id}
                          document={document}
                          visibleProperties={visibleProperties}
                          updating={updatingDocumentId === document.id}
                          onDragStart={setDraggedDocumentId}
                          onDragEnd={() => setDraggedDocumentId(null)}
                          onArchive={() => void archiveDocument(document.id)}
                          onPropertyChange={(property, value) => updateDocumentFromString(document.id, property, value)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.documents.map((document) => (
                        <DocumentCard
                          key={document.id}
                          document={document}
                          visibleProperties={visibleProperties}
                          updating={updatingDocumentId === document.id}
                          onDragStart={setDraggedDocumentId}
                          onDragEnd={() => setDraggedDocumentId(null)}
                          onArchive={() => void archiveDocument(document.id)}
                          onPropertyChange={(property, value) => updateDocumentFromString(document.id, property, value)}
                        />
                      ))}
                    </div>
                  )
                ) : groupBy !== "none" ? (
                  <div className="rounded-[10px] border border-dashed border-[var(--creed-border)] py-6 text-center text-[12.5px] text-[var(--creed-text-tertiary)]">
                    Drop documents here
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-sm rounded-[12px] border border-dashed border-[var(--creed-border)] py-12 text-center">
            <FileText className="mx-auto h-7 w-7 text-[var(--creed-text-tertiary)]" strokeWidth={1.6} />
            <h2 className="mt-4 text-[15px] font-medium text-[var(--creed-text-primary)]">
              {filter ? "No documents match" : "No documents yet"}
            </h2>
            <p className="mt-1.5 text-[13px] text-[var(--creed-text-secondary)]">
              {filter ? "Try a different search." : "Create your first document to get started."}
            </p>
            {!filter ? (
              <Button
                type="button"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => setCreateDocumentOpen(true)}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                New document
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <CreateDocumentDialog
        open={createDocumentOpen}
        onOpenChange={setCreateDocumentOpen}
        folders={folderRows}
        onCreated={(document) => setDocumentRows((rows) => [document, ...rows])}
      />
    </div>
  );
}
