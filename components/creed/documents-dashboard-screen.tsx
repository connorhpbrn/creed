"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Fragment, type DragEvent, type MouseEvent, type ReactNode } from "react";
import {
  Archive,
  ArrowUp,
  ArrowDown,
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileStack,
  FileText,
  Flag,
  Folder,
  FolderUp,
  Funnel,
  LayoutGrid,
  List,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquarePen,
  Tag,
  TreeStructure,
  TShirt,
  X,
} from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CreateDialog, type CreateDialogMode } from "@/components/creed/create-document-dialog";
import {
  DOCUMENT_GROUP_OPTIONS,
  DOCUMENT_LIFECYCLE_OPTIONS,
  DOCUMENT_PRIORITY_OPTIONS,
  DOCUMENT_PROPERTY_OPTIONS,
  DOCUMENT_SIZE_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  DOCUMENT_STAGE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TONE_DOT_COLOR,
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

type RenameTarget =
  | { kind: "document"; id: string; name: string }
  | { kind: "folder"; id: string; name: string };

type PropertyValueMap = {
  status: DocumentStatus | null;
  documentType: DocumentType | null;
  stage: DocumentStage | null;
  lifecycle: DocumentLifecycle | null;
  priority: DocumentPriority | null;
  size: DocumentSize | null;
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
const NONE_PROPERTY_VALUE = "__none__";

type PropertySelectOption = {
  value: string;
  label: string;
};

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

function emptyGroupLabel(property: DocumentPropertyKey) {
  return `No ${propertyLabel(property).toLowerCase()}`;
}

function propertySelectValue(value: string | null | undefined) {
  return value ?? NONE_PROPERTY_VALUE;
}

function propertyValueFromSelect(value: string) {
  return value === NONE_PROPERTY_VALUE ? null : value;
}

function propertyOptionsWithNone(property: DocumentPropertyKey): PropertySelectOption[] {
  return [
    { value: NONE_PROPERTY_VALUE, label: "None" },
    ...(PROPERTY_OPTIONS[property] as ReadonlyArray<PropertySelectOption>),
  ];
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
  if (value === NONE_PROPERTY_VALUE) return emptyGroupLabel(groupBy);
  return labelDocumentProperty(groupBy, value);
}

function comparableValue(document: DashboardDocument, sortBy: DocumentSortKey) {
  if (sortBy === "name") return document.title.toLowerCase();
  if (sortBy === "updated") return new Date(document.updatedAt).getTime();
  const propertyValue = document[sortBy];
  if (propertyValue === null) return null;
  if (sortBy === "status") return STATUS_ORDER.indexOf(propertyValue as DocumentStatus);
  if (sortBy === "priority") return PRIORITY_ORDER.indexOf(propertyValue as DocumentPriority);
  if (sortBy === "size") return SIZE_ORDER.indexOf(propertyValue as DocumentSize);
  return propertyValue.toLowerCase();
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
    if (aValue === null || bValue === null) {
      if (aValue === null && bValue !== null) return 1;
      if (aValue !== null && bValue === null) return -1;
      return a.title.localeCompare(b.title);
    }
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return a.title.localeCompare(b.title);
  });
}

function groupedDocuments(
  documents: DashboardDocument[],
  groupBy: DocumentGroupKey,
  groupValueFilter?: string[]
) {
  if (groupBy === "none") {
    return [{ key: "all", label: "All documents", value: "", documents }];
  }

  const groups = new Map<string, DashboardDocument[]>();
  for (const document of documents) {
    const value = propertySelectValue(document[groupBy]);
    groups.set(value, [...(groups.get(value) ?? []), document]);
  }

  const options = [
    ...(PROPERTY_OPTIONS[groupBy] as ReadonlyArray<PropertySelectOption>),
    { value: NONE_PROPERTY_VALUE, label: "None" },
  ];
  // When the grouped-by property is also being filtered, only render the
  // groups whose value is included in the filter. This keeps empty,
  // filtered-out groups (and their "Drop documents here" placeholders) from
  // showing up alongside the ones the user actually selected.
  const visibleOptions =
    groupValueFilter && groupValueFilter.length > 0
      ? options.filter((option) => groupValueFilter.includes(option.value))
      : options;
  return visibleOptions.map((option) => ({
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
  icon,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  icon: ReactNode;
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
          <span className="text-[var(--creed-text-tertiary)]">{icon}</span>
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
  value: string | null;
  disabled?: boolean;
  onChange: (property: DocumentPropertyKey, value: string | null) => void;
}) {
  const options = propertyOptionsWithNone(property);
  const selectedValue = propertySelectValue(value);
  const label = options.find((option) => option.value === selectedValue)?.label ?? "None";
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
        <DropdownMenuRadioGroup
          value={selectedValue}
          onValueChange={(next) => onChange(property, propertyValueFromSelect(next))}
        >
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

function RenameDialog({
  target,
  renaming,
  onOpenChange,
  onRename,
}: {
  target: RenameTarget | null;
  renaming: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target]);

  const label = target?.kind === "folder" ? "folder" : "document";
  const trimmed = name.trim();
  const unchanged = Boolean(target && trimmed === target.name.trim());

  function submit() {
    if (!trimmed || unchanged || renaming) return;
    onRename(trimmed);
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => {
      if (!renaming) onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Rename {label}</DialogTitle>
          <DialogDescription>
            Give this {label} a new name.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          autoFocus
          disabled={renaming}
          placeholder={target?.kind === "folder" ? "Folder name" : "Document name"}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" disabled={renaming} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={renaming || !trimmed || unchanged} onClick={submit} className="gap-1.5">
            {renaming ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <SquarePen className="h-3.5 w-3.5" strokeWidth={1.8} />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentRow({
  document,
  visibleProperties,
  updating,
  selected,
  onPropertyChange,
  onSelectionChange,
  onRename,
  onMove,
  onArchive,
  onDragStart,
  onDragEnd,
}: {
  document: DashboardDocument;
  visibleProperties: DocumentPropertyKey[];
  updating: boolean;
  selected: boolean;
  onPropertyChange: (property: DocumentPropertyKey, value: string | null) => void;
  onSelectionChange: (selected: boolean) => void;
  onRename: () => void;
  onMove: () => void;
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
      <input
        type="checkbox"
        checked={selected}
        disabled={updating}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onSelectionChange(event.target.checked)}
        aria-label={`Select ${document.title}`}
        className="h-4 w-4 shrink-0"
      />
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
            value={document[property]}
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
        onClick={onRename}
        aria-label={`Rename ${document.title}`}
        title="Rename"
        className="inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/row:opacity-100 disabled:opacity-50"
      >
        <SquarePen className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>

      <button
        type="button"
        disabled={updating}
        onClick={onMove}
        aria-label={`Move ${document.title}`}
        title="Move"
        className="inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/row:opacity-100 disabled:opacity-50"
      >
        <FolderUp className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>

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
  selected,
  onPropertyChange,
  onSelectionChange,
  onRename,
  onMove,
  onArchive,
  onDragStart,
  onDragEnd,
}: {
  document: DashboardDocument;
  visibleProperties: DocumentPropertyKey[];
  updating: boolean;
  selected: boolean;
  onPropertyChange: (property: DocumentPropertyKey, value: string | null) => void;
  onSelectionChange: (selected: boolean) => void;
  onRename: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDragStart: (documentId: string) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const href = `/file?document=${encodeURIComponent(document.slug)}`;

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    // Ignore clicks on interactive children (title link, property pills, archive button).
    if ((event.target as HTMLElement).closest("a, button, input, [role='menu'], [role='menuitem']")) {
      return;
    }
    router.push(href);
  }

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      onDragStart={() => onDragStart(document.id)}
      onDragEnd={onDragEnd}
      className="group/card flex min-h-[150px] cursor-pointer flex-col rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3.5 transition hover:border-[var(--creed-border-strong)] hover:shadow-[0_6px_20px_rgba(28,28,26,0.05)]"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={href}
          className="min-w-0 text-[14px] font-semibold leading-snug text-[var(--creed-text-primary)] hover:text-[#2563EB]"
        >
          <span className="line-clamp-2">{document.title}</span>
        </Link>
        <input
          type="checkbox"
          checked={selected}
          disabled={updating}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSelectionChange(event.target.checked)}
          aria-label={`Select ${document.title}`}
          className="h-4 w-4 shrink-0"
        />
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
            value={document[property]}
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
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={updating}
            onClick={onRename}
            aria-label={`Rename ${document.title}`}
            title="Rename"
            className="inline-grid size-7 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/card:opacity-100 disabled:opacity-50"
          >
            <SquarePen className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={onMove}
            aria-label={`Move ${document.title}`}
            title="Move"
            className="inline-grid size-7 place-items-center rounded-[7px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/card:opacity-100 disabled:opacity-50"
          >
            <FolderUp className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
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
        </span>
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

function FolderTile({
  folder,
  subfolderCount,
  updating,
  onRename,
  onArchive,
}: {
  folder: SharedDocumentFolder;
  subfolderCount: number;
  updating: boolean;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="group/folder relative">
      <Link
        href={`/dashboard/folder/${encodeURIComponent(folder.slug)}`}
        className="flex items-center gap-3 rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 pr-20 transition hover:border-[var(--creed-border-strong)] hover:shadow-[0_6px_20px_rgba(28,28,26,0.05)]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[var(--creed-surface-raised)] text-[var(--creed-text-secondary)] transition group-hover/folder:text-[#2563EB]">
          <Folder className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
            {folder.name}
          </span>
          <span className="block text-[12px] text-[var(--creed-text-tertiary)]">
            {subfolderCount > 0
              ? `${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"}`
              : "Folder"}
          </span>
        </span>
      </Link>
      <span className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
        <button
          type="button"
          disabled={updating}
          onClick={onRename}
          aria-label={`Rename ${folder.name}`}
          title="Rename"
          className="inline-grid size-8 place-items-center rounded-[8px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/folder:opacity-100 disabled:opacity-50"
        >
          <SquarePen className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={onArchive}
          aria-label={`Archive ${folder.name}`}
          title="Archive"
          className="inline-grid size-8 place-items-center rounded-[8px] text-[var(--creed-text-tertiary)] opacity-0 transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] group-hover/folder:opacity-100 disabled:opacity-50"
        >
          {updating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
        </button>
      </span>
    </div>
  );
}

type FolderTreeNode = SharedDocumentFolder & {
  children: FolderTreeNode[];
};

function folderTree(folders: SharedDocumentFolder[]) {
  const nodes = new Map<string, FolderTreeNode>();
  for (const folder of folders) {
    nodes.set(folder.id, { ...folder, children: [] });
  }

  const roots: FolderTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (items: FolderTreeNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) sort(item.children);
  };
  sort(roots);
  return roots;
}

function MoveDocumentsDialog({
  open,
  onOpenChange,
  folders,
  currentFolderId,
  selectedCount,
  moving,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: SharedDocumentFolder[];
  currentFolderId: string | null;
  selectedCount: number;
  moving: boolean;
  onMove: (folderId: string | null) => void;
}) {
  const [destinationId, setDestinationId] = useState<string | null>(currentFolderId);
  const tree = useMemo(() => folderTree(folders), [folders]);

  useEffect(() => {
    if (open) setDestinationId(currentFolderId);
  }, [currentFolderId, open]);

  function renderNode(node: FolderTreeNode, depth: number): ReactNode {
    const selected = destinationId === node.id;
    return (
      <Fragment key={node.id}>
        <button
          type="button"
          onClick={() => setDestinationId(node.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition hover:bg-[var(--creed-surface-raised)]",
            selected && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <Folder className="h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> : null}
        </button>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!moving) onOpenChange(next);
    }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Move documents</DialogTitle>
          <DialogDescription>
            Choose where to move {selectedCount === 1 ? "this document" : `${selectedCount} documents`}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] overflow-y-auto rounded-[10px] border border-[var(--creed-border)] p-1.5">
          <button
            type="button"
            onClick={() => setDestinationId(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition hover:bg-[var(--creed-surface-raised)]",
              destinationId === null && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
            )}
          >
            <TreeStructure className="h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate">Documents</span>
            {destinationId === null ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> : null}
          </button>
          {tree.map((node) => renderNode(node, 0))}
        </div>

        <DialogFooter className="mt-1">
          <Button type="button" variant="ghost" size="sm" disabled={moving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={moving} onClick={() => onMove(destinationId)} className="gap-1.5">
            {moving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FolderUp className="h-3.5 w-3.5" strokeWidth={1.8} />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsDashboardScreen({
  documents,
  folders,
  allFolders,
  currentFolder,
  breadcrumbs,
  preferences,
}: {
  documents: SharedDocumentSummary[];
  folders: SharedDocumentFolder[];
  allFolders: SharedDocumentFolder[];
  currentFolder: SharedDocumentFolder | null;
  breadcrumbs: SharedDocumentFolder[];
  preferences: DocumentDashboardPreferences;
}) {
  const router = useRouter();
  const [documentRows, setDocumentRows] = useState<DashboardDocument[]>(documents);
  const [folderRows, setFolderRows] = useState<SharedDocumentFolder[]>(folders);
  const [allFolderRows, setAllFolderRows] = useState<SharedDocumentFolder[]>(allFolders);
  const [viewMode, setViewMode] = useState<DocumentViewMode>(preferences.viewMode);
  const [groupBy, setGroupBy] = useState<DocumentGroupKey>(preferences.groupBy);
  const [sortBy, setSortBy] = useState<DocumentSortKey>(preferences.sortBy);
  const [sortDir, setSortDir] = useState<DocumentSortDirection>(preferences.sortDir);
  const [visibleProperties, setVisibleProperties] = useState<DocumentPropertyKey[]>(
    preferences.visibleProperties.length ? preferences.visibleProperties : DEFAULT_VISIBLE_DOCUMENT_PROPERTIES
  );
  const [filter, setFilter] = useState("");
  const [propertyFilters, setPropertyFilters] = useState<Partial<Record<DocumentPropertyKey, string[]>>>({});
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [busyDocumentIds, setBusyDocumentIds] = useState<string[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDocumentIds, setMoveDocumentIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"move" | "archive" | null>(null);
  const [savingView, setSavingView] = useState<"user" | "global" | null>(null);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);
  const [updatingFolderId, setUpdatingFolderId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateDialogMode>("document");

  function openCreate(mode: CreateDialogMode) {
    setCreateMode(mode);
    setCreateOpen(true);
  }

  useEffect(() => {
    const liveIds = new Set(documentRows.map((document) => document.id));
    setSelectedDocumentIds((ids) => ids.filter((id) => liveIds.has(id)));
  }, [documentRows]);

  useEffect(() => {
    setDocumentRows(documents);
  }, [documents]);

  useEffect(() => {
    setFolderRows(folders);
  }, [folders]);

  useEffect(() => {
    setAllFolderRows(allFolders);
  }, [allFolders]);

  const filteredDocuments = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const searched = query
      ? documentRows.filter((document) =>
          [
            document.title,
            document.description,
            document.path,
            labelDocumentProperty("status", document.status),
            labelDocumentProperty("documentType", document.documentType),
            labelDocumentProperty("stage", document.stage),
            labelDocumentProperty("lifecycle", document.lifecycle),
            labelDocumentProperty("priority", document.priority),
            labelDocumentProperty("size", document.size),
          ].some((value) => value.toLowerCase().includes(query))
        )
      : documentRows;

    const activeFilters = Object.entries(propertyFilters) as [DocumentPropertyKey, string[]][];
    const filtered = activeFilters.length
      ? searched.filter((document) =>
          activeFilters.every(
            ([property, values]) =>
              !values.length || values.includes(propertySelectValue(document[property]))
          )
        )
      : searched;

    return sortDocuments(filtered, sortBy, sortDir);
  }, [documentRows, filter, propertyFilters, sortBy, sortDir]);

  const filteredFolders = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const rows = query
      ? folderRows.filter((folder) =>
          [folder.name, folder.path].some((value) => value.toLowerCase().includes(query))
        )
      : folderRows;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [folderRows, filter]);

  // Subfolder counts come from the full folder tree so a folder tile can hint
  // at nested content even though the dashboard only loads direct children.
  const subfolderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of allFolderRows) {
      if (!folder.parentId) continue;
      counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + 1);
    }
    return counts;
  }, [allFolderRows]);

  const groups = useMemo(
    () =>
      groupedDocuments(
        filteredDocuments,
        groupBy,
        groupBy === "none" ? undefined : propertyFilters[groupBy]
      ),
    [filteredDocuments, groupBy, propertyFilters]
  );

  const selectedDocumentSet = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds]);
  const busyDocumentSet = useMemo(() => new Set(busyDocumentIds), [busyDocumentIds]);
  const visibleDocumentIds = useMemo(
    () => filteredDocuments.map((document) => document.id),
    [filteredDocuments]
  );
  const allVisibleSelected =
    visibleDocumentIds.length > 0 && visibleDocumentIds.every((id) => selectedDocumentSet.has(id));

  function toggleDocumentSelection(documentId: string, selected: boolean) {
    setSelectedDocumentIds((current) => {
      if (selected) {
        return current.includes(documentId) ? current : [...current, documentId];
      }
      return current.filter((id) => id !== documentId);
    });
  }

  function toggleAllVisibleDocuments(selected: boolean) {
    setSelectedDocumentIds((current) => {
      const visible = new Set(visibleDocumentIds);
      if (!selected) return current.filter((id) => !visible.has(id));
      return Array.from(new Set([...current, ...visibleDocumentIds]));
    });
  }

  function openMoveDialog(documentIds: string[]) {
    if (!documentIds.length || bulkAction) return;
    setMoveDocumentIds(documentIds);
    setMoveDialogOpen(true);
  }

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

  async function renameDocument(documentId: string, name: string) {
    if (updatingDocumentId) return;
    try {
      setUpdatingDocumentId(documentId);
      setRenaming(true);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not rename document."));
      }
      const payload = (await response.json()) as { document?: SharedDocumentSummary };
      if (payload.document) {
        setDocumentRows((rows) => rows.map((row) => row.id === documentId ? payload.document! : row));
      }
      setRenameTarget(null);
      toast.success("Document renamed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename document.");
    } finally {
      setUpdatingDocumentId(null);
      setRenaming(false);
    }
  }

  async function renameFolder(folderId: string, name: string) {
    if (updatingFolderId) return;
    try {
      setUpdatingFolderId(folderId);
      setRenaming(true);
      const response = await fetch(`/api/app/document-folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not rename folder."));
      }
      const payload = (await response.json()) as { folder?: SharedDocumentFolder };
      if (payload.folder) {
        setFolderRows((rows) => rows.map((row) => row.id === folderId ? payload.folder! : row));
        setAllFolderRows((rows) => rows.map((row) => row.id === folderId ? payload.folder! : row));
        if (currentFolder?.id === folderId) {
          router.replace(`/dashboard/folder/${encodeURIComponent(payload.folder.slug)}`);
        }
      }
      setRenameTarget(null);
      toast.success("Folder renamed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename folder.");
    } finally {
      setUpdatingFolderId(null);
      setRenaming(false);
    }
  }

  function renameTargetName(name: string) {
    if (!renameTarget) return;
    if (renameTarget.kind === "document") {
      void renameDocument(renameTarget.id, name);
    } else {
      void renameFolder(renameTarget.id, name);
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
    value: string | null
  ) {
    if (property === "status") void updateDocument(documentId, property, value as DocumentStatus | null);
    if (property === "documentType") void updateDocument(documentId, property, value as DocumentType | null);
    if (property === "stage") void updateDocument(documentId, property, value as DocumentStage | null);
    if (property === "lifecycle") void updateDocument(documentId, property, value as DocumentLifecycle | null);
    if (property === "priority") void updateDocument(documentId, property, value as DocumentPriority | null);
    if (property === "size") void updateDocument(documentId, property, value as DocumentSize | null);
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

  async function moveDocuments(destinationFolderId: string | null) {
    const ids = moveDocumentIds.length ? moveDocumentIds : selectedDocumentIds;
    if (!ids.length || bulkAction) return;

    try {
      setBulkAction("move");
      setBusyDocumentIds(ids);
      const updatedDocuments: SharedDocumentSummary[] = [];
      for (const documentId of ids) {
        const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: destinationFolderId }),
        });
        if (!response.ok) {
          throw new Error(await readError(response, "Could not move documents."));
        }
        const payload = (await response.json()) as { document?: SharedDocumentSummary };
        if (payload.document) updatedDocuments.push(payload.document);
      }

      const currentFolderId = currentFolder?.id ?? null;
      const updatedById = new Map(updatedDocuments.map((document) => [document.id, document]));
      const movedIds = new Set(ids);
      setDocumentRows((rows) =>
        rows.flatMap((row) => {
          if (!movedIds.has(row.id)) return [row];
          const updated = updatedById.get(row.id) ?? row;
          return (updated.folderId ?? null) === currentFolderId ? [updated] : [];
        })
      );
      setSelectedDocumentIds((current) => current.filter((id) => !movedIds.has(id)));
      setMoveDialogOpen(false);
      setMoveDocumentIds([]);
      toast.success(ids.length === 1 ? "Document moved" : "Documents moved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move documents.");
    } finally {
      setBulkAction(null);
      setBusyDocumentIds([]);
    }
  }

  async function archiveSelectedDocuments() {
    const ids = selectedDocumentIds;
    if (!ids.length || bulkAction) return;

    try {
      setBulkAction("archive");
      setBusyDocumentIds(ids);
      for (const documentId of ids) {
        const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(await readError(response, "Could not archive documents."));
        }
      }
      const archivedIds = new Set(ids);
      setDocumentRows((rows) => rows.filter((row) => !archivedIds.has(row.id)));
      setSelectedDocumentIds([]);
      toast.success(ids.length === 1 ? "Document archived" : "Documents archived");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive documents.");
    } finally {
      setBulkAction(null);
      setBusyDocumentIds([]);
    }
  }

  const activeFilterCount = useMemo(
    () =>
      Object.values(propertyFilters).reduce(
        (sum, values) => sum + (values?.length ?? 0),
        0
      ),
    [propertyFilters]
  );

  function toggleFilterValue(property: DocumentPropertyKey, value: string) {
    setPropertyFilters((current) => {
      const existing = current[property] ?? [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      const updated = { ...current };
      if (next.length) updated[property] = next;
      else delete updated[property];
      return updated;
    });
  }

  function clearFilters() {
    setPropertyFilters({});
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
    const nextValue = propertyValueFromSelect(value);
    if (!document || document[groupBy] === nextValue) return;

    if (groupBy === "status") void updateDocument(documentId, "status", nextValue as DocumentStatus | null);
    if (groupBy === "documentType") void updateDocument(documentId, "documentType", nextValue as DocumentType | null);
    if (groupBy === "stage") void updateDocument(documentId, "stage", nextValue as DocumentStage | null);
    if (groupBy === "lifecycle") void updateDocument(documentId, "lifecycle", nextValue as DocumentLifecycle | null);
    if (groupBy === "priority") void updateDocument(documentId, "priority", nextValue as DocumentPriority | null);
    if (groupBy === "size") void updateDocument(documentId, "size", nextValue as DocumentSize | null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--creed-surface)]">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--creed-border)] px-5 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-1.5">
          {currentFolder ? (
            <>
              <Link
                href="/dashboard"
                className="shrink-0 text-[15px] font-medium text-[var(--creed-text-tertiary)] transition hover:text-[var(--creed-text-primary)]"
              >
                Documents
              </Link>
              {breadcrumbs.map((folder, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <Fragment key={folder.id}>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={1.8} />
                    {isLast ? (
                      <h1 className="min-w-0 truncate text-[15px] font-semibold text-[var(--creed-text-primary)]">
                        {folder.name}
                      </h1>
                    ) : (
                      <Link
                        href={`/dashboard/folder/${encodeURIComponent(folder.slug)}`}
                        className="min-w-0 truncate text-[15px] font-medium text-[var(--creed-text-tertiary)] transition hover:text-[var(--creed-text-primary)]"
                      >
                        {folder.name}
                      </Link>
                    )}
                  </Fragment>
                );
              })}
            </>
          ) : (
            <h1 className="text-[15px] font-semibold text-[var(--creed-text-primary)]">Documents</h1>
          )}
          <span className="ml-1 shrink-0 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
            {documentRows.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentFolder ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Folder options"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[170px]">
                <DropdownMenuItem onSelect={() => setRenameTarget({ kind: "folder", id: currentFolder.id, name: currentFolder.name })}>
                  <SquarePen className="h-4 w-4" strokeWidth={1.8} />
                  Rename folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" strokeWidth={2} />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onSelect={() => openCreate("document")}>
                <FileText className="h-4 w-4" strokeWidth={1.8} />
                Document
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreate("folder")}>
                <Folder className="h-4 w-4" strokeWidth={1.8} />
                Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Toolbar (floating) */}
      <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-4 md:px-8">
        <span className="relative min-w-[200px] flex-1">
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

        <label className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[var(--creed-border)] px-2.5 text-[12.5px] font-medium text-[var(--creed-text-secondary)]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            disabled={visibleDocumentIds.length === 0 || Boolean(bulkAction)}
            onChange={(event) => toggleAllVisibleDocuments(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          Select
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewSwitcher viewMode={viewMode} onChange={setViewMode} />
          <InlineSelect
            icon={<FileStack className="h-3.5 w-3.5" strokeWidth={1.8} />}
            value={groupBy}
            options={DOCUMENT_GROUP_OPTIONS}
            onChange={setGroupBy}
          />
          <InlineSelect
            icon={<ListOrdered className="h-3.5 w-3.5" strokeWidth={1.8} />}
            value={sortBy}
            options={DOCUMENT_SORT_OPTIONS}
            onChange={setSortBy}
          />
          <button
            type="button"
            onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
            aria-label={sortDir === "asc" ? "Sorted ascending, click for descending" : "Sorted descending, click for ascending"}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.8} />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
          </button>

          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[8px] border border-[var(--creed-border)] px-2.5 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)] [&::-webkit-details-marker]:hidden">
              <Funnel className="h-3.5 w-3.5" strokeWidth={1.8} />
              Filter
              {activeFilterCount > 0 ? (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--creed-text-primary)] px-1 text-[10px] font-semibold leading-none text-[var(--creed-surface)]">
                  {activeFilterCount}
                </span>
              ) : null}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_12px_30px_rgba(28,28,26,0.1)]">
              {DOCUMENT_PROPERTY_OPTIONS.map((property) => {
                const options = propertyOptionsWithNone(property.value);
                const selected = propertyFilters[property.value] ?? [];
                return (
                  <details key={property.value} className="group/filter">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[7px] px-2 py-1.5 text-[13px] text-[var(--creed-text-primary)] transition hover:bg-[var(--creed-surface-raised)] [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3 w-3 shrink-0 text-[var(--creed-text-tertiary)] transition group-open/filter:rotate-90" strokeWidth={1.8} />
                      <span className="text-[var(--creed-text-tertiary)]">
                        <PropertyTypeIcon property={property.value} />
                      </span>
                      <span className="flex-1 truncate">{property.label}</span>
                      {selected.length ? (
                        <span className="shrink-0 text-[11px] font-medium text-[var(--creed-text-tertiary)]">
                          {selected.length}
                        </span>
                      ) : null}
                    </summary>
                    <div className="pb-1 pl-6">
                      {options.map((option) => (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 text-[12.5px] text-[var(--creed-text-primary)] transition hover:bg-[var(--creed-surface-raised)]"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={() => toggleFilterValue(property.value, option.value)}
                            className="h-3.5 w-3.5"
                          />
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                DOCUMENT_TONE_DOT_COLOR[
                                  documentPropertyTone(property.value, option.value)
                                ],
                            }}
                          />
                          <span className="min-w-0 truncate">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
              {activeFilterCount > 0 ? (
                <>
                  <div className="my-1 border-t border-[var(--creed-border)]" />
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Clear filters
                  </button>
                </>
              ) : null}
            </div>
          </details>

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
              <button
                type="button"
                aria-label="View options"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)]"
              >
                {savingView ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
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

      {selectedDocumentIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-[var(--creed-border)] bg-[var(--creed-surface-raised)]/45 px-5 py-2 md:px-8">
          <span className="text-[13px] font-medium text-[var(--creed-text-primary)]">
            {selectedDocumentIds.length} selected
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(bulkAction)}
            onClick={() => openMoveDialog(selectedDocumentIds)}
            className="gap-1.5"
          >
            <FolderUp className="h-3.5 w-3.5" strokeWidth={1.8} />
            Move
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(bulkAction)}
            onClick={() => void archiveSelectedDocuments()}
            className="gap-1.5"
          >
            {bulkAction === "archive" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
            Archive
          </Button>
          <button
            type="button"
            disabled={Boolean(bulkAction)}
            onClick={() => setSelectedDocumentIds([])}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface)] disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            Clear
          </button>
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-8">
        {filteredFolders.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFolders.map((folder) => (
              <FolderTile
                key={folder.id}
                folder={folder}
                subfolderCount={subfolderCounts.get(folder.id) ?? 0}
                updating={updatingFolderId === folder.id}
                onRename={() => setRenameTarget({ kind: "folder", id: folder.id, name: folder.name })}
                onArchive={() => void archiveFolder(folder.id)}
              />
            ))}
          </div>
        ) : null}

        {filteredFolders.length > 0 && filteredDocuments.length > 0 ? (
          <div className="my-6 border-t border-[var(--creed-border)]" />
        ) : null}

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
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          DOCUMENT_TONE_DOT_COLOR[
                            documentPropertyTone(groupBy as DocumentPropertyKey, group.value)
                          ],
                      }}
                    />
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
                          updating={updatingDocumentId === document.id || busyDocumentSet.has(document.id)}
                          selected={selectedDocumentSet.has(document.id)}
                          onDragStart={setDraggedDocumentId}
                          onDragEnd={() => setDraggedDocumentId(null)}
                          onSelectionChange={(selected) => toggleDocumentSelection(document.id, selected)}
                          onRename={() => setRenameTarget({ kind: "document", id: document.id, name: document.title })}
                          onMove={() => openMoveDialog([document.id])}
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
                          updating={updatingDocumentId === document.id || busyDocumentSet.has(document.id)}
                          selected={selectedDocumentSet.has(document.id)}
                          onDragStart={setDraggedDocumentId}
                          onDragEnd={() => setDraggedDocumentId(null)}
                          onSelectionChange={(selected) => toggleDocumentSelection(document.id, selected)}
                          onRename={() => setRenameTarget({ kind: "document", id: document.id, name: document.title })}
                          onMove={() => openMoveDialog([document.id])}
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
        ) : filteredFolders.length > 0 ? (
          <p className="px-1 py-2 text-[13px] text-[var(--creed-text-tertiary)]">
            {filter ? "No documents match your search." : "No documents here yet."}
          </p>
        ) : (
          <div className="mx-auto mt-10 max-w-sm py-12 text-center">
            <FileText className="mx-auto h-7 w-7 text-[var(--creed-text-tertiary)]" strokeWidth={1.6} />
            <h2 className="mt-4 text-[15px] font-medium text-[var(--creed-text-primary)]">
              {filter
                ? "No documents match"
                : currentFolder
                  ? "This folder is empty"
                  : "No documents yet"}
            </h2>
            <p className="mt-1.5 text-[13px] text-[var(--creed-text-secondary)]">
              {filter
                ? "Try a different search."
                : currentFolder
                  ? "Add a document or folder to get started."
                  : "Create your first document to get started."}
            </p>
            {!filter ? (
              <Button
                type="button"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => openCreate("document")}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                New document
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={createMode}
        onModeChange={setCreateMode}
        folders={allFolderRows}
        defaultFolderId={currentFolder?.id ?? null}
        onDocumentCreated={(document) => setDocumentRows((rows) => [document, ...rows])}
        onFolderCreated={(folder) => {
          setFolderRows((rows) => [...rows, folder]);
          setAllFolderRows((rows) => [...rows, folder]);
        }}
      />
      <RenameDialog
        target={renameTarget}
        renaming={renaming}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRename={renameTargetName}
      />
      <MoveDocumentsDialog
        open={moveDialogOpen}
        onOpenChange={(open) => {
          setMoveDialogOpen(open);
          if (!open) setMoveDocumentIds([]);
        }}
        folders={allFolderRows}
        currentFolderId={currentFolder?.id ?? null}
        selectedCount={moveDocumentIds.length || selectedDocumentIds.length}
        moving={bulkAction === "move"}
        onMove={(folderId) => void moveDocuments(folderId)}
      />
    </div>
  );
}
