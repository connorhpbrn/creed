"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  Clock3,
  CloudDownload,
  CloudUpload,
  Copy,
  Delete,
  Download,
  Ellipsis,
  FileStack,
  Flag,
  FolderUp,
  GripVertical,
  History,
  LayoutGrid,
  LoaderCircle,
  Lock,
  LockOpen,
  MessageSquare,
  Plus,
  Reply,
  RotateCcw,
  Save,
  SquarePen,
  Stamp,
  Tag,
  TShirt,
  X,
} from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { Button } from "@/components/ui/button";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
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
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { MentionText } from "@/components/creed/mention-text";
import { MentionTextarea } from "@/components/creed/mention-textarea";
import {
  DiffBadge,
  InlineMetaProposal,
  InlineNewSectionProposal,
  InlineProposalDiff,
  computeDiffParts,
  htmlToText,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import { ReviewPill } from "@/components/creed/review-pill";
import {
  DocumentReviewPanel,
  InlineDocumentProposal,
  resolveProposalPerson,
  type DocumentProposal as DocumentReviewProposal,
} from "@/components/creed/document-review-panel";
import {
  useCreedShellFileActions,
  useCreedShellActiveSection,
  useCreedShellLiveSections,
} from "@/components/creed/shell";
import { useCreed } from "@/components/creed/creed-provider";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import {
  accentColorMap,
  accentLabelMap,
  accentTintMap,
  VISIBLE_ACCENT_KEYS,
  buildVisibleCreedMarkdown,
  getProposalPreviewText,
  normalizeLegacyProposalDraft,
  normalizeProposalForSection,
  type AccentKey,
  type ActivityEntry,
  type ActivityStatus,
  type CreedSection,
  type Proposal,
} from "@/lib/creed-data";
import {
  DOCUMENT_LIFECYCLE_OPTIONS,
  DOCUMENT_PRIORITY_OPTIONS,
  DOCUMENT_SIZE_OPTIONS,
  DOCUMENT_STAGE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TONE_STYLE,
  DOCUMENT_TYPE_OPTIONS,
  documentPropertyTone,
  labelDocumentProperty,
  type DocumentLifecycle,
  type DocumentPriority,
  type DocumentPropertyKey,
  type DocumentSize,
  type DocumentStage,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/document-properties";
import type {
  DocumentActivityEvent,
  DocumentComment,
  WorkspaceUser,
} from "@/lib/document-collaboration";
import type { SharedDocument } from "@/lib/shared-documents";
import {
  canIndentSection,
  canNestUnder,
  canOutdentSection,
  insertSectionRelativeTo,
  normalizeSectionDepths,
  sectionDepth,
  shiftSubtreeDepth,
} from "@/lib/section-hierarchy";
import { cn } from "@/lib/utils";
import {
  useEditorView,
  setEditorView,
  EDITOR_WIDTH_PX,
  EDITOR_FONT_SCALE,
} from "@/lib/editor-view";

const activityStatuses: Array<{ label: string; value: "all" | ActivityStatus }> = [
  { label: "All", value: "all" },
  { label: "Direct", value: "direct" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
];

const activityStatusLabelMap: Record<ActivityStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  direct: "Direct",
  rejected: "Rejected",
  stale: "Stale",
};

const FILE_NAV_INTENT_KEY = "creed:file-nav-intent";

const documentHeaderIconButtonClass =
  "h-8 w-8 min-h-8 min-w-8 rounded-full border-0 bg-transparent p-0 text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]";

function getProposalStatusStyles(status: ActivityStatus) {
  if (status === "pending") {
    return "bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#1e3a8a]/25 dark:text-[#93c5fd]";
  }

  if (status === "direct") {
    return "bg-[#FFF6E8] text-[#C26A00] dark:bg-[#451a03]/40 dark:text-[#fbbf24]";
  }

  if (status === "accepted") {
    return "bg-[#F0FDF4] text-[#15803D] dark:bg-[#052e1a]/50 dark:text-[#4ade80]";
  }

  if (status === "stale") {
    return "bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#2e1065]/40 dark:text-[#c4b5fd]";
  }

  return "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/40 dark:text-[#fca5a5]";
}

function formatRelativeTime(timestamp?: string, fallbackLabel?: string) {
  if (!timestamp) {
    return fallbackLabel ?? "just now";
  }

  const deltaMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days === 1) {
    return "1d ago";
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.round(days / 7);
  if (weeks === 1) {
    return "1w ago";
  }

  return `${weeks}w ago`;
}

function ActivityFilterPill({
  active,
  tone = "blue",
  onClick,
  children,
}: {
  active: boolean;
  tone?: "blue" | "green" | "red" | "orange" | "purple";
  onClick: () => void;
  children: ReactNode;
}) {
  const activeClass =
    tone === "green"
      ? "border-[#22C55E] bg-[#F0FDF4] text-[#15803D] shadow-[inset_0_0_0_1px_#22C55E] dark:border-[#4ade80] dark:bg-[#052e1a]/50 dark:text-[#4ade80] dark:shadow-[inset_0_0_0_1px_#4ade80]"
      : tone === "red"
        ? "border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C] shadow-[inset_0_0_0_1px_#EF4444] dark:border-[#F87171] dark:bg-[#3F1212]/40 dark:text-[#fca5a5] dark:shadow-[inset_0_0_0_1px_#F87171]"
        : tone === "orange"
          ? "border-[#F59E0B] bg-[#FFF7ED] text-[#C26A00] shadow-[inset_0_0_0_1px_#F59E0B] dark:border-[#fbbf24] dark:bg-[#451a03]/40 dark:text-[#fbbf24] dark:shadow-[inset_0_0_0_1px_#fbbf24]"
          : tone === "purple"
            ? "border-[#8B5CF6] bg-[#F5F3FF] text-[#7C3AED] shadow-[inset_0_0_0_1px_#8B5CF6] dark:border-[#c4b5fd] dark:bg-[#2e1065]/40 dark:text-[#c4b5fd] dark:shadow-[inset_0_0_0_1px_#c4b5fd]"
            : "border-[#2563EB] bg-[#EFF6FF] text-[#1447E6] shadow-[inset_0_0_0_1px_#2563EB] dark:border-[#93c5fd] dark:bg-[#1e3a8a]/30 dark:text-[#93c5fd] dark:shadow-[inset_0_0_0_1px_#93c5fd]";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
        active
          ? activeClass
          : "border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      )}
    >
      {children}
    </motion.button>
  );
}

function formatDayLabel(timestamp?: string, fallbackLabel?: string) {
  if (!timestamp) {
    return fallbackLabel ?? "Today";
  }

  const deltaMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0);
  const days = Math.floor(deltaMs / 86_400_000);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return "Earlier";
}

function uniqueAgentNames(names: Array<string | undefined | null>) {
  const seen = new Set<string>();

  return names.filter((name): name is string => {
    const normalized = name?.trim();
    if (!normalized || normalized.toLowerCase() === "you") {
      return false;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}


function resolveSectionAccent(
  summarySection: { id: string; name: string; accent: AccentKey },
  sections: CreedSection[]
) {
  const byId = sections.find((section) => section.id === summarySection.id);
  if (byId) {
    return byId.accent;
  }

  const normalizedName = summarySection.name.trim().toLowerCase();
  const byName = sections.find((section) => section.name.trim().toLowerCase() === normalizedName);
  if (byName) {
    return byName.accent;
  }

  return summarySection.accent;
}

type SectionChangeKind = "added" | "removed" | "modified";

type SectionLike = { id: string; name: string; accent: AccentKey; content: string };

type SectionChange = {
  id: string;
  name: string;
  accent: AccentKey;
  kind: SectionChangeKind;
  // "before" / "after" relative to the direction (push or pull) being shown.
  existingContent: string;
  nextContent: string;
};

function matchSection(section: SectionLike, pool: SectionLike[]) {
  const byId = pool.find((candidate) => candidate.id === section.id);
  if (byId) {
    return byId;
  }
  const normalized = section.name.trim().toLowerCase();
  return pool.find((candidate) => candidate.name.trim().toLowerCase() === normalized);
}

// Diff two section sets into add / remove / modify rows. `before` is the
// current state of the destination and `after` is what it becomes, so for a
// push before=remote/after=local and for a pull before=local/after=remote.
// Accents always resolve against the local sections so colours match the app.
function computeSectionChanges(
  before: SectionLike[],
  after: SectionLike[],
  localSections: CreedSection[]
): SectionChange[] {
  const changes: SectionChange[] = [];
  const consumedBeforeIds = new Set<string>();

  for (const next of after) {
    const prev = matchSection(next, before);
    const accent = resolveSectionAccent(next, localSections);
    if (!prev) {
      changes.push({
        id: next.id,
        name: next.name,
        accent,
        kind: "added",
        existingContent: "",
        nextContent: next.content,
      });
    } else {
      consumedBeforeIds.add(prev.id);
      changes.push({
        id: next.id,
        name: next.name,
        accent,
        kind: "modified",
        existingContent: prev.content,
        nextContent: next.content,
      });
    }
  }

  for (const prev of before) {
    if (consumedBeforeIds.has(prev.id)) {
      continue;
    }
    changes.push({
      id: prev.id,
      name: prev.name,
      accent: resolveSectionAccent(prev, localSections),
      kind: "removed",
      existingContent: prev.content,
      nextContent: "",
    });
  }

  return changes;
}

// Smooth height + fade reveal, shared by every change row. Eases out (expo) so
// the dropdown glides open rather than snapping.
function SmoothExpand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0.3, ease: "easeOut" },
          }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const CHEVRON_CLASS =
  "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

// One row in a push / pull preview. Modified sections render the accent-tinted
// diff dropdown; added / removed sections render the clean green / red
// dashed-border dropdown (same language as the inline proposal cards) that
// expands to show the content being added or deleted - no diff.
function SectionChangeRow({ change }: { change: SectionChange }) {
  const [expanded, setExpanded] = useState(false);
  const { kind, name, accent } = change;

  const parts = useMemo(
    () =>
      kind === "modified"
        ? computeDiffParts(change.existingContent, change.nextContent)
        : [],
    [kind, change.existingContent, change.nextContent]
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  if (kind === "added" || kind === "removed") {
    const added = kind === "added";
    const content = added ? change.nextContent : change.existingContent;
    const containerClass = added
      ? "border-[#10b981]/35 bg-[#ECFDF5]/40 dark:border-[#22c55e]/35 dark:bg-[#052e1a]/40"
      : "border-[#dc2626]/35 bg-[#FEF2F2]/40 dark:border-[#ef4444]/35 dark:bg-[#7f1d1d]/15";
    const toneClass = added
      ? "text-[#10b981] dark:text-[#4ade80]"
      : "text-[#dc2626] dark:text-[#f87171]";
    const dividerClass = added ? "border-[#10b981]/20" : "border-[#dc2626]/20";

    return (
      <div className={cn("overflow-hidden rounded-xl border border-dashed", containerClass)}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left"
          aria-expanded={expanded}
        >
          <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
            {name}
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[7px] bg-[var(--creed-surface)] px-2 py-1 text-[11px] font-medium",
                toneClass
              )}
            >
              <span className="font-mono leading-none">{added ? "+" : "−"}</span>
              {added ? "Added" : "Removed"}
            </span>
            <ChevronDown
              className={cn(CHEVRON_CLASS, toneClass, expanded ? "rotate-0" : "-rotate-90")}
            />
          </span>
        </button>
        <SmoothExpand open={expanded}>
          <div className={cn("border-t", dividerClass)} />
          <div className="creed-diff-block px-4 py-3 text-[14px] leading-7 text-[var(--creed-text-primary)]">
            {htmlToText(content) || "(empty)"}
          </div>
        </SmoothExpand>
      </div>
    );
  }

  const unchanged = stats.added === 0 && stats.removed === 0;

  return (
    // Modified: one accent-tinted block where the header and the expanded
    // dropdown share the same section tint as a continuation.
    <div className="overflow-hidden rounded-xl" style={{ backgroundColor: accentTintMap[accent] }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="truncate text-[14px] font-medium" style={{ color: accentColorMap[accent] }}>
          {name}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {/* The +/- numbers sit in their own surface-coloured mini card so
              they stay legible on top of the section's accent tint. */}
          <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--creed-surface)] px-2 py-1">
            <DiffBadge tone="added" count={stats.added} />
            <DiffBadge tone="removed" count={stats.removed} />
          </span>
          <ChevronDown
            className={cn(CHEVRON_CLASS, expanded ? "rotate-0" : "-rotate-90")}
            style={{ color: accentColorMap[accent] }}
          />
        </span>
      </button>
      <SmoothExpand open={expanded}>
        {/* Inside the tinted dropdown, an inset card on the normal surface
            colour (no border) so the diff stays legible regardless of the
            section's accent tint. */}
        <div className="px-2 pb-2">
          <div className="creed-diff-block rounded-[10px] bg-[var(--creed-surface)] px-3.5 py-3">
            {unchanged ? (
              <span className="text-[var(--creed-text-tertiary)]">No textual change</span>
            ) : (
              parts.map((part, index) => {
                if (part.added) {
                  return (
                    <span key={index} className="creed-diff-add">
                      {part.value}
                    </span>
                  );
                }
                if (part.removed) {
                  return (
                    <span key={index} className="creed-diff-remove">
                      {part.value}
                    </span>
                  );
                }
                return <span key={index}>{part.value}</span>;
              })
            )}
          </div>
        </div>
      </SmoothExpand>
    </div>
  );
}

// The animated, scrollable list of section changes shared by both the push and
// pull dialogs.
function SectionChangeList({
  changes,
  heading,
  show,
  renderKey,
}: {
  changes: SectionChange[];
  heading: string;
  show: boolean;
  renderKey: number;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {show ? (
        <motion.div
          key={renderKey}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]"
        >
          <div className="border-b border-[var(--creed-border)] px-4 py-3 text-[13px] font-medium text-[var(--creed-text-secondary)]">
            {heading}
          </div>
          <div className="max-h-[280px] overflow-y-auto px-4 py-3">
            <motion.div
              className="space-y-2"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.16 } },
              }}
            >
              {changes.map((change) => (
                <motion.div
                  key={`${change.kind}-${change.id}`}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                >
                  <SectionChangeRow change={change} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type GitHubVersionStatus = {
  connected: boolean;
  configured: boolean;
  syncStatus:
    | "not-configured"
    | "unknown"
    | "up-to-date"
    | "local-ahead"
    | "remote-ahead"
    | "diverged";
  remoteSha?: string | null;
  remoteMessage?: string | null;
  remoteCommittedAt?: string | null;
  remoteContentHash?: string | null;
};

type GitHubPullPreview = {
  syncStatus:
    | "not-configured"
    | "unknown"
    | "up-to-date"
    | "local-ahead"
    | "remote-ahead"
    | "diverged";
  remoteSha?: string | null;
  remoteMessage?: string | null;
  remoteCommittedAt?: string | null;
  remoteContentHash?: string | null;
  remoteContent?: string;
  warnings: string[];
  sections: CreedSection[];
};

type SharedDocumentFilePayload = {
  document: SharedDocument;
  comments: DocumentComment[];
  pendingComments: DocumentComment[];
  activity: DocumentActivityEvent[];
  users: WorkspaceUser[];
  currentUserId: string | null;
  activeCommentId: string | null;
  back?: { href: string; label: string };
};

type DocumentPropertyName = DocumentPropertyKey;

type DocumentPropertyValueMap = {
  documentType: DocumentType | null;
  status: DocumentStatus | null;
  stage: DocumentStage | null;
  lifecycle: DocumentLifecycle | null;
  priority: DocumentPriority | null;
  size: DocumentSize | null;
};
const NONE_DOCUMENT_PROPERTY_VALUE = "__none__";

const DOCUMENT_PROPERTY_LABELS: Record<DocumentPropertyName, string> = {
  documentType: "Type",
  status: "Status",
  stage: "Stage",
  lifecycle: "Lifecycle",
  priority: "Priority",
  size: "T-shirt size",
};

function DocumentPropertyTypeIcon({ property }: { property: DocumentPropertyName }) {
  const className = "h-3 w-3 shrink-0";

  if (property === "status") return <CircleDashed className={className} />;
  if (property === "documentType") return <Tag className={className} />;
  if (property === "stage") return <LayoutGrid className={className} />;
  if (property === "lifecycle") return <RotateCcw className={className} />;
  if (property === "priority") return <Flag className={className} />;
  return <TShirt className={className} />;
}

function parseDocumentSections(markdown: string): CreedSection[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const withoutDocumentTitle = normalized.replace(/^#\s+.+\n?/i, "");
  const parsed = parseCreedMarkdown(withoutDocumentTitle.trim());
  if (parsed.sections.length > 0) {
    return parsed.sections;
  }

  return [
    {
      id: "document",
      kind: "rich-text",
      template: "freeform",
      name: "Overview",
      accent: "identity",
      content: "Start shaping this document.",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "Creed",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    },
  ];
}

function documentSectionsToMarkdown(sections: CreedSection[], title?: string) {
  const body = buildVisibleCreedMarkdown(sections).trim();
  const heading = title?.trim();
  if (!heading) {
    return body ? `${body}\n` : "";
  }
  return body ? `# ${heading}\n\n${body}\n` : `# ${heading}\n`;
}

function formatDocumentTimestamp(value: string) {
  return formatRelativeTime(value);
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

// The header save indicator owns the 60s relative-label ticker so it
// re-renders only this line, not the whole editor.
function SaveStatus({
  saving,
  lastSavedAt,
}: {
  saving: boolean;
  lastSavedAt: number | null;
}) {
  // Re-render once a minute so "Saved Xm ago" ages while the user is idle.
  // Nothing to age while saving, or before the first save (static "Saved").
  const [, setTick] = useState(0);
  useEffect(() => {
    if (saving || lastSavedAt === null) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(id);
  }, [saving, lastSavedAt]);

  const label = saving
    ? "Saving…"
    : lastSavedAt
      ? `Saved ${formatRelativeTime(new Date(lastSavedAt).toISOString())}`
      : "Saved";

  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-[var(--creed-text-secondary)]">
      <Clock3 className="h-3.5 w-3.5 shrink-0" />
      {label}
    </div>
  );
}

function DocumentPropertySelect<K extends DocumentPropertyName>({
  property,
  value,
  options,
  disabled,
  onChange,
}: {
  property: K;
  value: DocumentPropertyValueMap[K];
  options: ReadonlyArray<{ value: NonNullable<DocumentPropertyValueMap[K]>; label: string }>;
  disabled?: boolean;
  onChange: (property: K, value: DocumentPropertyValueMap[K]) => void;
}) {
  const selectedValue = value ?? NONE_DOCUMENT_PROPERTY_VALUE;
  const current = value
    ? options.find((option) => option.value === value)?.label ?? labelDocumentProperty(property, value)
    : "None";
  const tone = documentPropertyTone(property, value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={property}
          style={DOCUMENT_TONE_STYLE[tone]}
          className={cn(
            "inline-flex h-6 w-fit max-w-full items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <DocumentPropertyTypeIcon property={property} />
          <span className="min-w-0 truncate">{current}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DropdownMenuLabel>{DOCUMENT_PROPERTY_LABELS[property]}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selectedValue}
          onValueChange={(next) =>
            onChange(
              property,
              next === NONE_DOCUMENT_PROPERTY_VALUE ? null : (next as DocumentPropertyValueMap[K])
            )
          }
        >
          <DropdownMenuRadioItem value={NONE_DOCUMENT_PROPERTY_VALUE}>
            None
          </DropdownMenuRadioItem>
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

function DocumentPropertyBar({
  document,
  disabledProperty,
  onChange,
}: {
  document: SharedDocument;
  disabledProperty: DocumentPropertyName | null;
  onChange: <K extends DocumentPropertyName>(
    property: K,
    value: DocumentPropertyValueMap[K]
  ) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      <DocumentPropertySelect
        property="documentType"
        value={document.documentType}
        options={DOCUMENT_TYPE_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
      <DocumentPropertySelect
        property="status"
        value={document.status}
        options={DOCUMENT_STATUS_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
      <DocumentPropertySelect
        property="stage"
        value={document.stage}
        options={DOCUMENT_STAGE_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
      <DocumentPropertySelect
        property="lifecycle"
        value={document.lifecycle}
        options={DOCUMENT_LIFECYCLE_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
      <DocumentPropertySelect
        property="priority"
        value={document.priority}
        options={DOCUMENT_PRIORITY_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
      <DocumentPropertySelect
        property="size"
        value={document.size}
        options={DOCUMENT_SIZE_OPTIONS}
        disabled={Boolean(disabledProperty)}
        onChange={onChange}
      />
    </div>
  );
}

export function FileScreen({
  sharedDocument = null,
}: {
  sharedDocument?: SharedDocumentFilePayload | null;
} = {}) {
  const router = useRouter();
  const {
    state,
    toggleLock,
    toggleSectionLock,
    updateRichTextSection,
    reorderSections,
    addSection,
    addSectionAfter,
    indentSection,
    outdentSection,
    renameSection,
    setSectionAccent,
    duplicateSection,
    deleteSection,
    archiveSection,
    archiveCreed,
    clearSections,
    acceptProposal,
    acceptProposals,
    rejectProposal,
    importSections,
    exportMarkdown,
    refreshState,
  } = useCreed();
  const documentMode = Boolean(sharedDocument);
  const [currentDocument, setCurrentDocument] = useState<SharedDocument | null>(
    sharedDocument?.document ?? null
  );
  const [documentSections, setDocumentSections] = useState<CreedSection[]>(() =>
    sharedDocument
      ? parseDocumentSections(sharedDocument.document.content)
      : []
  );
  const [savedDocumentMarkdown, setSavedDocumentMarkdown] = useState(() =>
    sharedDocument
      ? documentSectionsToMarkdown(
          parseDocumentSections(sharedDocument.document.content),
          sharedDocument.document.title
        )
      : ""
  );
  const [documentComments, setDocumentComments] = useState<DocumentComment[]>(
    sharedDocument?.comments ?? []
  );
  const [pendingComments, setPendingComments] = useState<DocumentComment[]>(
    sharedDocument?.pendingComments ?? []
  );
  const [documentActivity, setDocumentActivity] = useState<DocumentActivityEvent[]>(
    sharedDocument?.activity ?? []
  );
  const [activeDocumentPanel, setActiveDocumentPanel] = useState<"comments" | "activity" | null>(
    sharedDocument?.activeCommentId ? "comments" : null
  );
  const [focusVersionId, setFocusVersionId] = useState<string | null>(null);
  const [activeDocumentCommentId, setActiveDocumentCommentId] = useState<string | null>(
    sharedDocument?.activeCommentId ?? null
  );
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [documentLocked, setDocumentLocked] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [documentProposals, setDocumentProposals] = useState<DocumentReviewProposal[]>([]);
  const [busyDocumentProposalId, setBusyDocumentProposalId] = useState<string | null>(null);
  const [savingDocumentProperty, setSavingDocumentProperty] = useState<DocumentPropertyName | null>(null);
  const documentUsers = useMemo(() => sharedDocument?.users ?? [], [sharedDocument]);
  const currentUserId = sharedDocument?.currentUserId ?? null;
  // People you can @mention: everyone except yourself (tagging yourself is a
  // no-op the server strips anyway).
  const mentionableUsers = useMemo(
    () => documentUsers.filter((user) => user.id !== currentUserId),
    [documentUsers, currentUserId]
  );

  useEffect(() => {
    if (!sharedDocument) {
      setCurrentDocument(null);
      setDocumentSections([]);
      setSavedDocumentMarkdown("");
      setDocumentComments([]);
      setPendingComments([]);
      setDocumentActivity([]);
      setActiveDocumentPanel(null);
      setActiveDocumentCommentId(null);
      setRenameDocumentOpen(false);
      setRenameDocumentTitle("");
      return;
    }

    const parsed = parseDocumentSections(sharedDocument.document.content);
    setCurrentDocument(sharedDocument.document);
    setDocumentSections(parsed);
    setSavedDocumentMarkdown(documentSectionsToMarkdown(parsed, sharedDocument.document.title));
    setDocumentComments(sharedDocument.comments);
    setPendingComments(sharedDocument.pendingComments);
    setDocumentActivity(sharedDocument.activity);
    setActiveDocumentPanel(sharedDocument.activeCommentId ? "comments" : null);
    setActiveDocumentCommentId(sharedDocument.activeCommentId ?? null);
    setReplyingTo(null);
    setReplyBody("");
    setRenameDocumentOpen(false);
    setRenameDocumentTitle(sharedDocument.document.title);
  }, [sharedDocument]);

  const documentMarkdown = useMemo(
    () => (documentMode ? documentSectionsToMarkdown(documentSections, currentDocument?.title) : ""),
    [currentDocument?.title, documentMode, documentSections]
  );
  const documentDirty = documentMode && documentMarkdown !== savedDocumentMarkdown;
  const editorSections = documentMode ? documentSections : state.sections;
  const rootDocumentComments = useMemo(
    () => documentComments.filter((comment) => !comment.parentId),
    [documentComments]
  );
  const openDocumentCommentCount = useMemo(
    () => rootDocumentComments.filter((comment) => comment.status === "open").length,
    [rootDocumentComments]
  );
  const documentRepliesByParent = useMemo(() => {
    const replies = new Map<string, DocumentComment[]>();
    for (const comment of documentComments) {
      if (!comment.parentId) continue;
      replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment]);
    }
    return replies;
  }, [documentComments]);
  // Archived sections stay in state (so they persist) but are hidden from the
  // editor; the section list renders from this live set.
  const visibleSections = useMemo(
    () => editorSections.filter((section) => !section.archived),
    [editorSections]
  );
  useCreedShellLiveSections(documentMode ? visibleSections : null);
  // Section collapse lives only in the sidebar outline (see shell.tsx). The
  // editor always renders every visible section, so the rendered list is just
  // the un-archived sections in their current order.
  const renderSections = visibleSections;
  const pendingProposals = useMemo(
    () => (documentMode ? [] : state.proposals.filter((proposal) => proposal.status === "pending")),
    [documentMode, state.proposals]
  );
  const normalizedPendingProposals = useMemo(
    () =>
      pendingProposals.map((proposal) =>
        normalizeProposalForSection(
          {
            ...proposal,
            draft: normalizeLegacyProposalDraft(proposal.draft),
          },
          editorSections.find((section) => section.id === proposal.sectionId)
        )
      ),
    [editorSections, pendingProposals]
  );
  // Map each pending document section-proposal to the rendered section it
  // targets, so the editor can show an inline card at the bottom of that
  // section (like the personal file's InlineProposalDiff). Section proposals
  // carry the section heading; match it to the rendered section by name, and
  // never reuse a proposal across two sections.
  const documentProposalsBySection = useMemo(() => {
    const map = new Map<string, DocumentReviewProposal[]>();
    if (!documentMode) return map;
    const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
    const used = new Set<string>();
    for (const section of renderSections) {
      const matches = documentProposals.filter(
        (proposal) =>
          proposal.kind === "document-section" &&
          proposal.status === "pending" &&
          !used.has(proposal.id) &&
          norm(proposal.sectionHeading) === norm(section.name)
      );
      for (const match of matches) used.add(match.id);
      if (matches.length > 0) map.set(section.id, matches);
    }
    return map;
  }, [documentMode, documentProposals, renderSections]);
  const [activityOpen, setActivityOpen] = useState(false);

  // Global ⌘A / Ctrl+A → toggle the activity sidebar instead of select-all.
  // We skip when the user is typing inside an input / textarea / contenteditable
  // so basic editing still works.
  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "a" && event.key !== "A") return;
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) return;
      if (event.shiftKey || event.altKey) return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      setActivityOpen((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerName, setComposerName] = useState("");
  const [composerStarter, setComposerStarter] = useState<string | undefined>();
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  // Whether the composer will create a sibling of the anchor or nest a child
  // under it. Set by the slash command / per-section add controls.
  const [composerMode, setComposerMode] = useState<"sibling" | "child">("sibling");
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState("Update Creed");
  const [pushBusy, setPushBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [versionStatusBusy, setVersionStatusBusy] = useState(false);
  const [versionStatus, setVersionStatus] = useState<GitHubVersionStatus | null>(null);
  const [pullPreview, setPullPreview] = useState<GitHubPullPreview | null>(null);
  const [pullPreviewRenderKey, setPullPreviewRenderKey] = useState(0);
  const [showPullPreview, setShowPullPreview] = useState(false);
  const [pushPreview, setPushPreview] = useState<{
    sections: CreedSection[];
    warnings: string[];
  } | null>(null);
  const [pushPreviewRenderKey, setPushPreviewRenderKey] = useState(0);
  const [showPushPreview, setShowPushPreview] = useState(false);
  const [pushPreviewBusy, setPushPreviewBusy] = useState(false);
  const [selectedVersionAction, setSelectedVersionAction] = useState<"push" | "pull">("push");
  const [renameDocumentOpen, setRenameDocumentOpen] = useState(false);
  const [renameDocumentTitle, setRenameDocumentTitle] = useState(
    sharedDocument?.document.title ?? ""
  );
  const [renamingDocument, setRenamingDocument] = useState(false);
  const [renameSectionState, setRenameSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSectionState, setDeleteSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteFileOpen, setDeleteFileOpen] = useState(false);
  const [archiveAllOpen, setArchiveAllOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const documentReviewPanelHeightRef = useRef<number | null>(null);
  const editorView = useEditorView();
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const lastDocumentStatusKeyRef = useRef<string | null>(null);
  // `exportMarkdown` is re-created by the provider whenever state changes,
  // so depending on it alone is sufficient - listing `state.sections`
  // separately would be redundant.
  const localMarkdown = useMemo(
    () => (documentMode ? documentMarkdown : exportMarkdown()),
    [documentMarkdown, documentMode, exportMarkdown]
  );

  const handleDocumentReviewPanelHeightChange = useCallback((height: number) => {
    if (height <= 0) {
      documentReviewPanelHeightRef.current = null;
      return;
    }

    const previous = documentReviewPanelHeightRef.current;
    documentReviewPanelHeightRef.current = height;
    if (previous === null) return;

    const delta = height - previous;
    if (delta <= 1) return;

    const container = editorScrollRef.current;
    if (!container || container.scrollTop <= 0) return;

    const stickyHeader = container.querySelector<HTMLElement>("[data-file-sticky-header]");
    if (!stickyHeader) return;

    const containerTop = container.getBoundingClientRect().top;
    const headerTop = stickyHeader.getBoundingClientRect().top;
    if (Math.abs(headerTop - containerTop) > 2) return;

    container.scrollTop = Math.max(container.scrollTop - delta, 0);
  }, []);

  // Documents are Supabase-only (no GitHub sync); GitHub version control here
  // only applies to the profile creed.md file, never to shared documents.
  const githubConfigured =
    !documentMode &&
    state.settings.integrations.github.status === "connected" &&
    Boolean(state.settings.versionControl.repoOwner) &&
    Boolean(state.settings.versionControl.repoName) &&
    Boolean(state.settings.versionControl.branch);

  const pushDisabled =
    !githubConfigured ||
    versionStatusBusy ||
    versionStatus?.syncStatus === "up-to-date" ||
    versionStatus?.syncStatus === "remote-ahead";
  // Pull is allowed any time GitHub is configured - including when the
  // local file is "local-ahead." That way, as soon as you make a local
  // edit, you can still click Pull to refresh against the latest remote
  // commit. The pull-preview API always fetches fresh from the GitHub
  // contents endpoint (no caching - see `githubRequest` in lib/github.ts)
  // so the dialog shows the true current state of the remote.
  const pullDisabled = !githubConfigured || versionStatusBusy;
  const primaryVersionAction =
    versionStatus?.syncStatus === "remote-ahead" || versionStatus?.syncStatus === "diverged"
      ? "pull"
      : "push";

  useEffect(() => {
    if (pushDisabled && pullDisabled) {
      setSelectedVersionAction(primaryVersionAction);
    }
  }, [primaryVersionAction, pullDisabled, pushDisabled]);

  useEffect(() => {
    if (composerOpen) {
      inputRef.current?.focus();
    }
  }, [composerOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadVersionStatus() {
      if (documentMode) {
        // Documents are Supabase-only now; there is no GitHub sync status to
        // fetch. Version history lives in the document's own panel.
        setVersionStatus({ connected: false, configured: false, syncStatus: "not-configured" });
        return;
      }

      if (state.settings.integrations.github.status !== "connected") {
        setVersionStatus({
          connected: false,
          configured: false,
          syncStatus: "not-configured",
        });
        return;
      }

      try {
        setVersionStatusBusy(true);
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
        const localHash = Array.from(new Uint8Array(buffer))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        const response = await fetch(`/api/app/github/status?localHash=${localHash}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as GitHubVersionStatus & { error?: string };

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load GitHub version status");
        }

        if (!cancelled) {
          setVersionStatus(payload);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Could not load GitHub version status"
          );
        }
      } finally {
        if (!cancelled) {
          setVersionStatusBusy(false);
        }
      }
    }

    void loadVersionStatus();

    return () => {
      cancelled = true;
    };
  }, [
    currentDocument,
    documentMode,
    githubConfigured,
    localMarkdown,
    state.settings.integrations.github.status,
    state.settings.versionControl.repoOwner,
    state.settings.versionControl.repoName,
    state.settings.versionControl.branch,
    state.settings.versionControl.lastSyncedContentHash,
  ]);

  const openComposer = useCallback(
    (afterSectionId?: string, mode: "sibling" | "child" = "sibling") => {
      setInsertAfterId(afterSectionId ?? null);
      setComposerMode(afterSectionId ? mode : "sibling");
      setComposerOpen(true);
      setComposerName("");
      setComposerStarter(undefined);
    },
    []
  );

  const scrollComposerIntoView = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = editorScrollRef.current;
    const composerArea = composerAreaRef.current;

    if (!container || !composerArea) {
      return false;
    }

    container.scrollTo({
      top: Math.max(composerArea.offsetTop - 24, 0),
      behavior,
    });

    return true;
  }, []);

  const openComposerAndReveal = useCallback(
    (afterSectionId?: string, mode: "sibling" | "child" = "sibling") => {
      openComposer(afterSectionId, mode);

      window.setTimeout(() => {
        scrollComposerIntoView("smooth");
      }, 60);
    },
    [openComposer, scrollComposerIntoView]
  );

  function createDocumentSection(name: string, starter?: string): CreedSection {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseId = slug || "section";
    const existingIds = new Set(documentSections.map((section) => section.id));
    let id = baseId;
    let index = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${index}`;
      index += 1;
    }

    return {
      id,
      kind: "rich-text",
      template: "freeform",
      name: name.trim(),
      accent: "identity",
      content: starter ?? "Start shaping this section.",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "Creed",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    };
  }

  function addDocumentSection(
    name: string,
    starter?: string,
    afterSectionId?: string | null,
    mode: "sibling" | "child" = "sibling"
  ) {
    setDocumentSections((current) => {
      const nextSection = createDocumentSection(name, starter);
      // "sibling" lands after the anchor's whole subtree at the same depth;
      // "child" nests it one level deeper as the anchor's first child.
      return insertSectionRelativeTo(current, afterSectionId, nextSection, mode);
    });
  }

  function updateDocumentSection(sectionId: string, patch: Partial<CreedSection>) {
    setDocumentSections((current) =>
      current.map((section) => section.id === sectionId ? { ...section, ...patch } : section)
    );
  }

  function indentDocumentSection(sectionId: string) {
    setDocumentSections((current) => {
      const index = current.findIndex((section) => section.id === sectionId);
      if (index === -1 || !canIndentSection(current, index)) return current;
      return shiftSubtreeDepth(current, index, 1);
    });
  }

  function outdentDocumentSection(sectionId: string) {
    setDocumentSections((current) => {
      const index = current.findIndex((section) => section.id === sectionId);
      if (index === -1 || !canOutdentSection(current, index)) return current;
      return shiftSubtreeDepth(current, index, -1);
    });
  }

  function reorderDocumentSections(ids: string[]) {
    setDocumentSections((current) => {
      const byId = new Map(current.map((section) => [section.id, section]));
      const ordered = ids.flatMap((id) => {
        const section = byId.get(id);
        return section ? [section] : [];
      });
      const missing = current.filter((section) => !ids.includes(section.id));
      // Keep the tree valid after a drag - see reorderSections in the provider.
      return normalizeSectionDepths([...ordered, ...missing]);
    });
  }

  // Drag reorders the section rows. Every visible section is rendered (the
  // editor has no collapse), so the reordered ids already represent the full
  // order - route straight to the right mode's reorder handler.
  function handleSectionReorder(reorderedVisibleIds: string[]) {
    if (documentMode) {
      reorderDocumentSections(reorderedVisibleIds);
    } else {
      reorderSections(reorderedVisibleIds);
    }
  }

  // Promote a text selection (captured inside a section's editor) into a new
  // section placed right after the source section. Routes through the same
  // add-section paths as the composer so profile and document modes stay in
  // sync; the editor has already stripped the selected text from the source.
  function createSectionFromSelection(
    afterSectionId: string,
    input: { name: string; content?: string }
  ) {
    const name = input.name.trim() || "New section";
    const starter = input.content?.trim() ? input.content : undefined;
    if (documentMode) {
      addDocumentSection(name, starter, afterSectionId, "sibling");
    } else {
      addSectionAfter(afterSectionId, name, starter, "sibling");
    }
  }

  function submitComposer() {
    if (!composerName.trim()) {
      return;
    }

    if (documentMode) {
      addDocumentSection(composerName, composerStarter, insertAfterId, composerMode);
    } else if (insertAfterId) {
      addSectionAfter(insertAfterId, composerName, composerStarter, composerMode);
    } else {
      addSection(composerName, composerStarter);
    }

    setComposerOpen(false);
    setComposerName("");
    setComposerStarter(undefined);
    setInsertAfterId(null);
    setComposerMode("sibling");
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  function markActionComplete(key: string) {
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    markActionComplete("download");
  }

  async function handleImportFile(file: File) {
    try {
      setImportBusy(true);
      setCopiedAction(null);

      const markdown = await file.text();
      const parsed = parseCreedMarkdown(markdown);

      if (parsed.sections.length === 0) {
        throw new Error(parsed.warnings[0] ?? "Could not import this markdown file");
      }

      if (documentMode) {
        setDocumentSections(parsed.sections);
      } else {
        await importSections(parsed.sections);
      }
      if (parsed.warnings.length > 0) {
        toast.warning(`Imported ${file.name} with warnings`);
      } else {
        toast.success(`Imported ${file.name}`);
      }
      markActionComplete("import");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import this markdown file"
      );
    } finally {
      setImportBusy(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function reloadDocumentActivity(documentId: string) {
    const response = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}/activity`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { activity?: DocumentActivityEvent[] };
    if (payload.activity) {
      setDocumentActivity(payload.activity);
    }
  }

  // Accept or reject a pending document section-proposal from its inline card in
  // the body. On accept the returned document replaces local state and sections
  // re-parse; either way the review panel is refreshed (which re-emits the
  // pending list via onProposalsChange, updating the inline cards).
  async function resolveDocumentProposal(id: string, action: "accept" | "reject") {
    if (!currentDocument) return;
    setBusyDocumentProposalId(id);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/proposals/${encodeURIComponent(id)}/${action}`,
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        document?: SharedDocument;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Could not ${action} the proposal.`);
      }
      if (action === "accept" && payload.document) {
        setCurrentDocument(payload.document);
        const parsed = parseDocumentSections(payload.document.content);
        setDocumentSections(parsed);
        setSavedDocumentMarkdown(documentSectionsToMarkdown(parsed, payload.document.title));
        void reloadDocumentActivity(payload.document.id);
      }
      setReviewRefreshKey((key) => key + 1);
      toast.success(action === "accept" ? "Proposal accepted" : "Proposal rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
    } finally {
      setBusyDocumentProposalId(null);
    }
  }

  // Approve a pending agent-proposed comment: it becomes a normal shared comment
  // authored by the current user, and the deferred mention notifications fire.
  async function approvePendingComment(commentId: string) {
    if (!currentDocument) return;
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/comments/${encodeURIComponent(commentId)}/approve`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { comment?: DocumentComment; error?: string };
      if (!response.ok || !payload.comment) {
        throw new Error(payload.error || "Could not approve the comment.");
      }
      const approved = payload.comment;
      setPendingComments((rows) => rows.filter((comment) => comment.id !== commentId));
      setDocumentComments((rows) => [...rows, approved]);
      await reloadDocumentActivity(currentDocument.id);
      toast.success("Comment shared with the workspace");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve the comment.");
    }
  }

  async function rejectPendingComment(commentId: string) {
    if (!currentDocument) return;
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/comments/${encodeURIComponent(commentId)}/reject`,
        { method: "POST" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not reject the comment.");
      }
      setPendingComments((rows) => rows.filter((comment) => comment.id !== commentId));
      toast.success("Pending comment rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reject the comment.");
    }
  }

  async function handleSaveDocument(): Promise<SharedDocument | null> {
    if (!currentDocument || documentSaving || !documentDirty) {
      return currentDocument;
    }

    try {
      setDocumentSaving(true);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: documentMarkdown,
          expectedRevision: currentDocument.revision,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not save document."));
      }
      const payload = (await response.json()) as {
        outcome?: "applied" | "proposed";
        document?: SharedDocument;
        proposal?: { id: string };
      };
      // Under the workspace edit policy a save is either applied directly or
      // recorded as a pending proposal for review.
      if (payload.outcome === "proposed" || (!payload.document && payload.proposal)) {
        await reloadDocumentActivity(currentDocument.id);
        setReviewRefreshKey((key) => key + 1);
        toast.success("Change proposed for review");
        return currentDocument;
      }
      if (payload.document) {
        setCurrentDocument(payload.document);
        const parsed = parseDocumentSections(payload.document.content);
        setDocumentSections(parsed);
        setSavedDocumentMarkdown(documentSectionsToMarkdown(parsed, payload.document.title));
        await reloadDocumentActivity(payload.document.id);
        lastDocumentStatusKeyRef.current = null;
        toast.success("Document saved");
        return payload.document;
      }
      throw new Error("Save did not return the updated document.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save document.");
      return null;
    } finally {
      setDocumentSaving(false);
    }
  }

  async function renameCurrentDocument() {
    if (!currentDocument || renamingDocument) {
      return;
    }

    const title = renameDocumentTitle.trim();
    if (!title || title === currentDocument.title.trim()) {
      return;
    }

    try {
      setRenamingDocument(true);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          expectedRevision: currentDocument.revision,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not rename document."));
      }

      const payload = (await response.json()) as { document?: SharedDocument };
      if (!payload.document) {
        throw new Error("Rename did not return the updated document.");
      }

      const previousSlug = currentDocument.slug;
      const savedSections = parseDocumentSections(savedDocumentMarkdown);
      setCurrentDocument(payload.document);
      setSavedDocumentMarkdown(documentSectionsToMarkdown(savedSections, payload.document.title));
      setRenameDocumentTitle(payload.document.title);
      setRenameDocumentOpen(false);
      if (payload.document.slug !== previousSlug) {
        router.replace(`/file?document=${encodeURIComponent(payload.document.slug)}`);
      }
      await reloadDocumentActivity(payload.document.id);
      toast.success("Document renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename document.");
    } finally {
      setRenamingDocument(false);
    }
  }

  async function updateDocumentProperty<K extends DocumentPropertyName>(
    property: K,
    value: DocumentPropertyValueMap[K]
  ) {
    if (!currentDocument || savingDocumentProperty) {
      return;
    }

    try {
      setSavingDocumentProperty(property);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [property]: value,
          expectedRevision: currentDocument.revision,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not update document properties."));
      }
      const payload = (await response.json()) as { document?: SharedDocument };
      if (payload.document) {
        setCurrentDocument(payload.document);
        await reloadDocumentActivity(payload.document.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update document properties.");
    } finally {
      setSavingDocumentProperty(null);
    }
  }

  // New comments are created from the in-editor popup composer, which supplies
  // the selected text as the anchor quote. Replies use the sidebar and go
  // through createDocumentReply below.
  // A proposal comment was posted from a review card: surface it in the
  // comments sidebar immediately, reusing the same comment placement as
  // section-anchored comments (dedupe so a later reload can't double it).
  function handleProposalCommentPosted(comment: DocumentComment) {
    setDocumentComments((rows) =>
      rows.some((row) => row.id === comment.id) ? rows : [...rows, comment]
    );
    setActiveDocumentPanel("comments");
  }

  async function createDocumentCommentFromEditor(input: {
    quote: string;
    body: string;
    mentionedUserIds: string[];
  }) {
    if (!currentDocument) {
      return;
    }
    const body = input.body.trim();
    if (!body) {
      return;
    }
    const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        parentId: null,
        referenceQuote: input.quote || null,
        mentionedUserIds: input.mentionedUserIds,
      }),
    });
    if (!response.ok) {
      const message = await readError(response, "Could not add comment.");
      toast.error(message);
      // Re-throw so the editor popup stays open and the user can retry.
      throw new Error(message);
    }
    const payload = (await response.json()) as { comment?: DocumentComment };
    if (payload.comment) {
      setDocumentComments((rows) => [...rows, payload.comment!]);
      setActiveDocumentPanel("comments");
      setActiveDocumentCommentId(payload.comment.id);
    }
    await reloadDocumentActivity(currentDocument.id);
  }

  async function createDocumentReply(parentId: string) {
    if (!currentDocument) {
      return;
    }
    const body = replyBody.trim();
    if (!body) {
      return;
    }
    // Resolve "@Display Name" mentions typed into the reply against workspace
    // members so replies can notify people just like top-level comments.
    const mentionedUserIds = documentUsers
      .filter((user) => user.label && body.includes(`@${user.label}`))
      .map((user) => user.id);

    try {
      setSavingReply(true);
      const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          parentId,
          referenceQuote: null,
          mentionedUserIds,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not add reply."));
      }
      const payload = (await response.json()) as { comment?: DocumentComment };
      if (payload.comment) {
        setDocumentComments((rows) => [...rows, payload.comment!]);
      }
      setReplyBody("");
      setReplyingTo(null);
      await reloadDocumentActivity(currentDocument.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add reply.");
    } finally {
      setSavingReply(false);
    }
  }

  async function updateDocumentCommentBody(commentId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    const response = await fetch(`/api/app/comments/${encodeURIComponent(commentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    if (!response.ok) {
      const message = await readError(response, "Could not update comment.");
      toast.error(message);
      throw new Error(message);
    }
    const payload = (await response.json()) as { comment?: DocumentComment };
    if (payload.comment) {
      setDocumentComments((rows) =>
        rows.map((comment) => comment.id === commentId ? payload.comment! : comment)
      );
    }
    if (currentDocument) {
      await reloadDocumentActivity(currentDocument.id);
    }
  }

  async function deleteDocumentCommentById(commentId: string) {
    const response = await fetch(`/api/app/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error(await readError(response, "Could not delete comment."));
      return;
    }
    // Drop the comment and any of its replies from local state.
    setDocumentComments((rows) =>
      rows.filter((comment) => comment.id !== commentId && comment.parentId !== commentId)
    );
    if (activeDocumentCommentId === commentId) {
      setActiveDocumentCommentId(null);
    }
    if (currentDocument) {
      await reloadDocumentActivity(currentDocument.id);
    }
  }

  async function updateDocumentCommentStatus(commentId: string, status: "open" | "resolved") {
    const response = await fetch(`/api/app/comments/${encodeURIComponent(commentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      toast.error(await readError(response, "Could not update comment."));
      return;
    }
    const payload = (await response.json()) as { comment?: DocumentComment };
    if (payload.comment) {
      setDocumentComments((rows) =>
        rows.map((comment) => comment.id === commentId ? payload.comment! : comment)
      );
    }
    if (currentDocument) {
      await reloadDocumentActivity(currentDocument.id);
    }
  }


  async function handleOpenPushReview() {
    setSelectedVersionAction("push");
    setPushMessage("Update Creed");
    setPushPreview(null);
    setPushDialogOpen(true);

    if (!githubConfigured) {
      return;
    }

    try {
      setPushPreviewBusy(true);
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
      const localHash = Array.from(new Uint8Array(buffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");

      const response = await fetch("/api/app/github/pull/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localHash }),
      });

      // No creed.md in the repo yet: nothing remote to diff against, so every
      // local section reads as an addition.
      if (response.status === 404) {
        setPushPreview({ sections: [], warnings: [] });
        setPushPreviewRenderKey((current) => current + 1);
        return;
      }

      const payload = (await response.json()) as GitHubPullPreview & { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || "Could not preview the push");
      }

      setPushPreview({ sections: payload.sections, warnings: payload.warnings ?? [] });
      setPushPreviewRenderKey((current) => current + 1);
    } catch (error) {
      // Leave the dialog open so the user can still push; just surface why the
      // preview is missing.
      toast.error(error instanceof Error ? error.message : "Could not preview the push");
    } finally {
      setPushPreviewBusy(false);
    }
  }

  async function handlePushCreed() {
    try {
      setSelectedVersionAction("push");
      setPushBusy(true);
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
      const localHash = Array.from(new Uint8Array(buffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const response = await fetch("/api/app/github/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          markdown: localMarkdown,
          localHash,
          message: pushMessage.trim() || "Update Creed",
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not push Creed to GitHub.");
      }

      await refreshState();
      toast.success("Pushed Creed to GitHub");
      setPushDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not push Creed");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleOpenPullReview() {
    try {
      setSelectedVersionAction("pull");
      setPullBusy(true);
      setPullDialogOpen(true);
      setPullPreview(null);

      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
      const localHash = Array.from(new Uint8Array(buffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");

      const response = await fetch("/api/app/github/pull/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ localHash }),
      });
      const payload = (await response.json()) as GitHubPullPreview & { error?: string };

      if (!response.ok) {
        throw new Error(payload?.error || "Could not preview GitHub import");
      }

      setPullPreview(payload);
      setPullPreviewRenderKey((current) => current + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not preview GitHub import"
      );
      setPullDialogOpen(false);
    } finally {
      setPullBusy(false);
    }
  }

  async function handleApplyPull() {
    if (!pullPreview) {
      return;
    }

    try {
      setPullBusy(true);
      const response = await fetch("/api/app/github/pull/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sections: pullPreview.sections,
          remoteSha: pullPreview.remoteSha,
          remoteMessage: pullPreview.remoteMessage,
          remoteCommittedAt: pullPreview.remoteCommittedAt,
          remoteContentHash: pullPreview.remoteContentHash,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not import Creed from GitHub");
      }

      await refreshState();
      toast.success("Pulled Creed from GitHub");
      setPullDialogOpen(false);
      setPullPreview(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import Creed from GitHub"
      );
    } finally {
      setPullBusy(false);
    }
  }

  const setActiveShellSection = useCreedShellActiveSection();
  const scrollLockRef = useRef<{ sectionId: string; until: number } | null>(null);

  const handleSectionSelect = useCallback(
    (sectionId: string) => {
      const container = editorScrollRef.current;

      if (!container) {
        return;
      }

      const element = container.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);

      if (!element) {
        return;
      }

      const stickyHeader = container.querySelector<HTMLElement>("[data-file-sticky-header]");
      const stickyOffset = stickyHeader?.getBoundingClientRect().height ?? 96;

      scrollLockRef.current = { sectionId, until: Date.now() + 1200 };
      setActiveShellSection(sectionId);

      container.scrollTo({
        top: Math.max(element.offsetTop - stickyOffset - 16, 0),
        behavior: "smooth",
      });
    },
    [setActiveShellSection]
  );

  const handleProposalSelect = useCallback((proposalId: string) => {
    const container = editorScrollRef.current;
    if (!container) return;
    const element = container.querySelector<HTMLElement>(
      `[data-proposal-id="${proposalId}"]`
    );
    if (!element) return;
    const stickyHeader = container.querySelector<HTMLElement>("[data-file-sticky-header]");
    const stickyOffset = stickyHeader?.getBoundingClientRect().height ?? 96;
    container.scrollTo({
      top: Math.max(element.offsetTop - stickyOffset - 16, 0),
      behavior: "smooth",
    });
  }, []);

  const shellFileActions = useMemo(
    () => ({
      onAddSection: () => openComposerAndReveal(),
      onSectionSelect: handleSectionSelect,
      onProposalSelect: handleProposalSelect,
    }),
    [handleSectionSelect, handleProposalSelect, openComposerAndReveal]
  );
  useCreedShellFileActions(shellFileActions);

  // Re-run the scroll tracker when the count of pending new-section
  // proposals changes so newly-mounted `[data-proposal-id]` previews
  // get picked up. Extracted from the deps array to satisfy ESLint's
  // "complex expression in dependency array" rule.
  const pendingNewSectionProposalCount = useMemo(
    () =>
      state.proposals.filter(
        (p) => p.status === "pending" && p.draft.kind === "new-section"
      ).length,
    [state.proposals]
  );

  useEffect(() => {
    const container = editorScrollRef.current;
    if (!container) return;

    // Track both real sections and pending new-section proposals so the
    // sidebar's "active row" highlight follows the user's scroll into a
    // proposal preview the same way it follows real section scrolls.
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-section-id], [data-proposal-id]")
    );
    if (elements.length === 0) return;

    function targetIdOf(element: HTMLElement) {
      return element.dataset.sectionId ?? element.dataset.proposalId ?? null;
    }

    function update() {
      const stickyHeader = container?.querySelector<HTMLElement>("[data-file-sticky-header]");
      const offset = (stickyHeader?.getBoundingClientRect().height ?? 96) + 32;
      let bestId: string | null = null;
      let bestDistance = Infinity;

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - offset);
        if (rect.top - offset <= 0 && rect.bottom > offset) {
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = targetIdOf(element);
          }
        }
      }

      if (!bestId) {
        const firstVisible = elements.find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > offset;
        });
        bestId = firstVisible ? targetIdOf(firstVisible) : null;
      }

      const lock = scrollLockRef.current;
      if (lock) {
        if (Date.now() > lock.until || bestId === lock.sectionId) {
          scrollLockRef.current = null;
        } else {
          return;
        }
      }

      setActiveShellSection(bestId);
    }

    update();
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      setActiveShellSection(null);
    };
  }, [editorSections.length, pendingNewSectionProposalCount, setActiveShellSection]);

  useEffect(() => {
    if (!pullDialogOpen || !pullPreview) {
      setShowPullPreview(false);
      return;
    }

    setShowPullPreview(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setShowPullPreview(true);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [pullDialogOpen, pullPreview, pullPreviewRenderKey]);

  useEffect(() => {
    if (!pushDialogOpen || !pushPreview) {
      setShowPushPreview(false);
      return;
    }

    setShowPushPreview(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setShowPushPreview(true);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [pushDialogOpen, pushPreview, pushPreviewRenderKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawIntent = window.sessionStorage.getItem(FILE_NAV_INTENT_KEY);
    if (!rawIntent) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let timeoutId = 0;

    timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      try {
        const intent = JSON.parse(rawIntent) as
          | { type: "section"; sectionId: string }
          | { type: "compose" }
          | { type: "proposal"; proposalId: string };

        if (intent.type === "compose") {
          const scrolled = scrollComposerIntoView("smooth");
          const openDelay = scrolled ? 280 : 0;
          const openTimeoutId = window.setTimeout(() => {
            if (!cancelled) {
              openComposer();
              window.setTimeout(() => {
                if (!cancelled) {
                  scrollComposerIntoView("smooth");
                }
              }, 60);
            }
            window.sessionStorage.removeItem(FILE_NAV_INTENT_KEY);
          }, openDelay);

          if (cancelled) {
            window.clearTimeout(openTimeoutId);
          }
          return;
        }

        let attempts = 0;

        const tryScroll = () => {
          if (cancelled) {
            return;
          }

          const container = editorScrollRef.current;
          const selector =
            intent.type === "proposal"
              ? `[data-proposal-id="${intent.proposalId}"]`
              : `[data-section-id="${intent.sectionId}"]`;
          const element = container?.querySelector<HTMLElement>(selector);

          if (container && element) {
            if (intent.type === "proposal") {
              handleProposalSelect(intent.proposalId);
            } else {
              handleSectionSelect(intent.sectionId);
            }
            window.sessionStorage.removeItem(FILE_NAV_INTENT_KEY);
            return;
          }

          attempts += 1;
          if (attempts < 24) {
            frameId = window.requestAnimationFrame(tryScroll);
          }
        };

        frameId = window.requestAnimationFrame(tryScroll);
      } catch {
        return;
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [handleSectionSelect, handleProposalSelect, openComposer, scrollComposerIntoView]);

  return (
    <>
      <div className="relative flex h-full min-h-0 bg-[var(--creed-surface)] transition-colors duration-200">
        <div className="min-w-0 flex-1">
          <div ref={editorScrollRef} className="h-full overflow-y-auto overscroll-contain creed-scrollbar">
            <div
              className="mx-auto px-4 py-6 pb-28 md:px-12 md:py-10 md:pb-10 xl:px-16"
              style={{
                maxWidth: EDITOR_WIDTH_PX[editorView.width],
                // Scoped var consumed by `.ProseMirror` font-size (globals.css)
                // so only editor content scales, not the header chrome.
                "--editor-font-scale": String(EDITOR_FONT_SCALE[editorView.textScale]),
              } as CSSProperties}
            >
              <div
                data-file-sticky-header
                className="sticky top-0 z-20 mb-8 -mx-4 bg-[color:var(--creed-surface)]/95 px-4 pb-5 pt-2 backdrop-blur-sm md:-mx-12 md:mb-12 md:px-12 md:pb-7 xl:-mx-16 xl:px-16"
              >
                <div
                  className={cn(
                    "flex gap-3",
                    documentMode
                      ? "flex-row items-start justify-between"
                      : "flex-col md:flex-row md:items-start md:justify-between"
                  )}
                >
                  <div className="relative flex min-w-0 items-start">
                    {documentMode ? (
                      <Link
                        href={sharedDocument?.back?.href ?? "/dashboard"}
                        aria-label={sharedDocument?.back?.label ?? "Back to dashboard"}
                        className={cn("absolute -left-8 top-0.5 inline-flex shrink-0 items-center justify-center transition-colors duration-150 md:-left-10", documentHeaderIconButtonClass)}
                      >
                        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
                      </Link>
                    ) : null}
                    <div className="min-w-0">
                      <div className="truncate font-heading text-[1.22rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)] md:text-[1.45rem]">
                        {documentMode ? currentDocument?.title ?? "Document" : `${state.user.name} / Creed`}
                      </div>
                      <SaveStatus
                        saving={documentMode ? documentSaving : state.saving}
                        lastSavedAt={
                          documentMode
                            ? currentDocument?.updatedAt
                              ? new Date(currentDocument.updatedAt).getTime()
                              : null
                            : state.lastSavedAt
                        }
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-start">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".md,.markdown,text/markdown,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        void handleImportFile(file);
                      }}
                    />
                    {documentMode ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Rename document"
                          title="Rename document"
                          className={documentHeaderIconButtonClass}
                          disabled={renamingDocument || documentSaving}
                          onClick={() => {
                            setRenameDocumentTitle(currentDocument?.title ?? "");
                            setRenameDocumentOpen(true);
                          }}
                        >
                          {renamingDocument ? (
                            <LoaderCircle className="inline-flex h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <SquarePen className="inline-flex h-3.5 w-3.5 shrink-0" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Save document"
                          title="Save document"
                          className={documentHeaderIconButtonClass}
                          disabled={documentSaving || !documentDirty}
                          onClick={() => void handleSaveDocument()}
                        >
                          {documentSaving ? (
                            <LoaderCircle className="inline-flex h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <Save className="inline-flex h-3.5 w-3.5 shrink-0" />
                          )}
                        </Button>
                      </>
                    ) : null}
                    {!documentMode ? (
                    <div
                      className="flex items-center"
                      title={
                        githubConfigured
                          ? undefined
                          : "Connect GitHub and choose a repo in Settings first."
                      }
                    >
                      <Button
                        variant={documentMode ? "ghost" : "outline"}
                        size={documentMode ? "icon-sm" : "sm"}
                        aria-label={documentMode ? "Publish document" : undefined}
                        title={documentMode ? "Publish document" : undefined}
                        style={
                          documentMode
                            ? undefined
                            : { borderTopLeftRadius: 13, borderBottomLeftRadius: 13, borderTopRightRadius: 0, borderBottomRightRadius: 0, height: 32, minHeight: 32 }
                        }
                        className={cn(
                          // Neutral outline pill - this button only OPENS the
                          // push/pull dialog. The brand-blue CTA lives on the
                          // dialog's final confirm button (Push Creed / Import
                          // remote Creed), so we keep the trigger here calm to
                          // avoid two competing CTAs on screen.
                          "border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:px-3.5 md:text-sm",
                          documentMode && documentHeaderIconButtonClass,
                          documentMode && "px-0 md:px-0",
                          !documentMode && "border-r-0",
                          !githubConfigured && "text-[var(--creed-text-tertiary)]"
                        )}
                        onClick={() => {
                          if (!documentMode && selectedVersionAction === "pull") {
                            if (!pullDisabled) {
                              void handleOpenPullReview();
                            }
                            return;
                          }

                          if (!pushDisabled) {
                            void handleOpenPushReview();
                          }
                        }}
                        disabled={
                          documentMode
                            ? pushDisabled
                            : selectedVersionAction === "pull"
                              ? pullDisabled
                              : pushDisabled
                        }
                      >
                        {!documentMode && selectedVersionAction === "pull" ? (
                          <CloudDownload className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        ) : (
                          <CloudUpload className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        )}
                        {documentMode ? null : selectedVersionAction === "pull" ? "Pull" : "Push"}
                      </Button>

                      {documentMode ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Pull from GitHub"
                          title="Pull from GitHub"
                          className={documentHeaderIconButtonClass}
                          disabled={pullDisabled || pullBusy}
                          onClick={() => {
                            setSelectedVersionAction("pull");
                            void handleOpenPullReview();
                          }}
                        >
                          {pullBusy ? (
                            <LoaderCircle className="inline-flex h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <CloudDownload className="inline-flex h-3.5 w-3.5 shrink-0" />
                          )}
                        </Button>
                      ) : null}

                      {!documentMode ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 13, borderBottomRightRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                            className="border-[var(--creed-border)] bg-[var(--creed-surface)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                            disabled={!githubConfigured}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-[var(--creed-border)] bg-[var(--creed-surface)]"
                        >
                          <AnimatedMenuIconItem
                            icon={CloudUpload}
                            className="text-sm"
                            disabled={pushDisabled}
                            onSelect={(event) => {
                              event.preventDefault();
                              void handleOpenPushReview();
                            }}
                          >
                            Push
                          </AnimatedMenuIconItem>
                          <AnimatedMenuIconItem
                            icon={CloudDownload}
                            className="text-sm"
                            disabled={pullDisabled}
                            onSelect={(event) => {
                              event.preventDefault();
                              setSelectedVersionAction("pull");
                              void handleOpenPullReview();
                            }}
                          >
                            Pull
                          </AnimatedMenuIconItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      ) : null}
                    </div>
                    ) : null}

                    {documentMode ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Comments${openDocumentCommentCount > 0 ? `, ${openDocumentCommentCount} open` : ""}`}
                        title="Comments"
                        className={cn(
                          "relative",
                          documentHeaderIconButtonClass,
                          activeDocumentPanel === "comments" && "bg-[var(--creed-surface-raised)]"
                        )}
                        onClick={() => {
                          setActiveDocumentPanel((current) => current === "comments" ? null : "comments");
                        }}
                      >
                        <MessageSquare className="inline-flex h-3.5 w-3.5 shrink-0" />
                        {openDocumentCommentCount > 0 ? (
                          <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#F59E0B] px-1 text-[9px] font-semibold leading-4 text-white">
                            {openDocumentCommentCount}
                          </span>
                        ) : null}
                      </Button>
                    ) : null}

                    {documentMode ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Activity"
                        title="Activity"
                        className={cn(
                          documentHeaderIconButtonClass,
                          activeDocumentPanel === "activity" && "bg-[var(--creed-surface-raised)]"
                        )}
                        onClick={() => {
                          setActiveDocumentPanel((current) => current === "activity" ? null : "activity");
                        }}
                      >
                        <History className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Activity"
                          style={{ borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                          className={cn(
                            "border-[var(--creed-border)] bg-[var(--creed-surface)] md:hidden",
                            activityOpen && "bg-[var(--creed-surface-raised)]"
                          )}
                          onClick={() => {
                            setActivityOpen((current) => !current);
                          }}
                        >
                          <History className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          style={{ borderRadius: 13, height: 32, minHeight: 32 }}
                          className={cn(
                            "hidden border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:inline-flex md:px-3.5 md:text-sm",
                            activityOpen && "bg-[var(--creed-surface-raised)]"
                          )}
                          onClick={() => {
                            setActivityOpen((current) => !current);
                          }}
                        >
                          <History className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                          Activity
                        </Button>
                      </>
                    )}

                    <HeaderLockButton
                      locked={documentMode ? documentLocked : state.locked}
                      onToggle={documentMode ? () => setDocumentLocked((current) => !current) : toggleLock}
                      iconOnly={documentMode}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={documentMode ? "ghost" : "outline"}
                          size="icon-sm"
                          style={documentMode ? undefined : { borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                          className={cn(
                            documentMode
                              ? documentHeaderIconButtonClass
                              : "border-[var(--creed-border)] bg-[var(--creed-surface)]",
                            "data-[state=open]:bg-[var(--creed-surface-raised)]"
                          )}
                        >
                          <Ellipsis className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-64 border-[var(--creed-border)] bg-[var(--creed-surface)]"
                      >
                        <AnimatedMenuIconItem
                          icon={FolderUp}
                          showIcon={!importBusy && copiedAction !== "import"}
                          className="text-sm"
                          disabled={importBusy}
                          onSelect={(event) => {
                            event.preventDefault();
                            importInputRef.current?.click();
                          }}
                        >
                          {importBusy
                            ? "Importing"
                            : copiedAction === "import"
                              ? "Imported"
                              : "Import"}
                          {importBusy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : copiedAction === "import" ? (
                            <AnimatedCheckmark />
                          ) : null}
                        </AnimatedMenuIconItem>
                        <AnimatedMenuIconItem
                          icon={Copy}
                          showIcon={copiedAction !== "copy"}
                          className="min-w-[82px] text-sm"
                          onSelect={(event) => {
                            event.preventDefault();
                            void copyValue("copy", localMarkdown);
                          }}
                        >
                          {copiedAction === "copy" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {copiedAction === "copy" ? "Copied" : "Copy"}
                        </AnimatedMenuIconItem>
                        <AnimatedMenuIconItem
                          icon={Download}
                          showIcon={copiedAction !== "download"}
                          className="text-sm"
                          onSelect={(event) => {
                            event.preventDefault();
                            downloadFile(
                              documentMode && currentDocument ? currentDocument.path : "creed.md",
                              localMarkdown,
                              "text/markdown;charset=utf-8"
                            );
                          }}
                        >
                          {copiedAction === "download" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {copiedAction === "download" ? "Downloaded" : "Download"}
                        </AnimatedMenuIconItem>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5">
                          <div className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--creed-text-tertiary)]">
                            View
                          </div>
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className="text-xs text-[var(--creed-text-secondary)]">Text</span>
                            <div className="flex overflow-hidden rounded-md border border-[var(--creed-border)]">
                              {(["small", "large"] as const).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setEditorView({ textScale: value });
                                  }}
                                  className={cn(
                                    "px-2.5 py-1 text-xs transition-colors",
                                    editorView.textScale === value
                                      ? "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
                                      : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                                  )}
                                >
                                  {value === "small" ? "Small" : "Large"}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-[var(--creed-text-secondary)]">Width</span>
                            <div className="flex overflow-hidden rounded-md border border-[var(--creed-border)]">
                              {(["narrow", "wide"] as const).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setEditorView({ width: value });
                                  }}
                                  className={cn(
                                    "px-2.5 py-1 text-xs transition-colors",
                                    editorView.width === value
                                      ? "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
                                      : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                                  )}
                                >
                                  {value === "narrow" ? "Narrow" : "Wide"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {!documentMode ? (
                          <>
                            <DropdownMenuSeparator />
                            <AnimatedMenuIconItem
                              icon={Archive}
                              className="text-sm"
                              onSelect={() => {
                                window.setTimeout(() => setArchiveAllOpen(true), 0);
                              }}
                            >
                              Archive
                            </AnimatedMenuIconItem>
                            <AnimatedMenuIconItem
                              icon={Delete}
                              className="mt-1 bg-[#DC2626] text-sm text-white hover:bg-[#B91C1C] hover:text-white focus:bg-[#B91C1C] focus:text-white data-[highlighted]:bg-[#B91C1C] data-[highlighted]:text-white not-data-[variant=destructive]:focus:**:text-white"
                              onSelect={() => {
                                // Let the menu close first, then open the dialog on
                                // the next tick so its enter animation plays (two
                                // Radix overlays in the same tick skips it).
                                window.setTimeout(() => setDeleteFileOpen(true), 0);
                              }}
                            >
                              Delete
                            </AnimatedMenuIconItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {documentMode && currentDocument ? (
                  <DocumentPropertyBar
                    document={currentDocument}
                    disabledProperty={savingDocumentProperty}
                    onChange={(property, value) => void updateDocumentProperty(property, value)}
                  />
                ) : null}

                {documentMode && currentDocument ? (
                  <DocumentReviewPanel
                    documentId={currentDocument.id}
                    revision={currentDocument.revision}
                    currentContent={currentDocument.content}
                    users={documentUsers}
                    refreshSignal={reviewRefreshKey}
                    onProposalsChange={setDocumentProposals}
                    onCommentPosted={handleProposalCommentPosted}
                    focusVersionId={focusVersionId}
                    onFocusVersionHandled={() => setFocusVersionId(null)}
                    onHeightChange={handleDocumentReviewPanelHeightChange}
                    onDocumentUpdated={(doc) => {
                      setCurrentDocument(doc);
                      const parsed = parseDocumentSections(doc.content);
                      setDocumentSections(parsed);
                      setSavedDocumentMarkdown(documentSectionsToMarkdown(parsed, doc.title));
                      void reloadDocumentActivity(doc.id);
                    }}
                  />
                ) : null}

                {/* Review pill lives inside the sticky header block so both
                    pin to the top of the scroll viewport together. Visually
                    distinct via its own card chrome and a top margin - but
                    structurally they share the same sticky context, which
                    means the pill always rides directly under the header
                    while the user scrolls through the file.

                    Only shown for 2+ pending proposals: a single proposal
                    needs no roll-up summary, so we skip straight to its
                    inline section card (accept / reject + diff in place). */}
                {normalizedPendingProposals.length > 1 ? (
                  <div className="mt-5 flex justify-start">
                    <ReviewPill
                      proposals={normalizedPendingProposals.map((proposal) => {
                        const target = state.sections.find((s) => s.id === proposal.sectionId);
                        return {
                          proposal,
                          existingContent: target?.content ?? "",
                          sectionName: target?.name ?? proposal.sectionName,
                        };
                      })}
                      onAcceptAll={() => {
                        // Single-commit batch accept - bypasses the
                        // per-proposal server-state fetch that was
                        // re-introducing already-accepted proposals.
                        acceptProposals(
                          normalizedPendingProposals.map((p) => p.id)
                        );
                      }}
                      onRejectAll={() => {
                        normalizedPendingProposals.forEach((p) => rejectProposal(p.id));
                      }}
                      onAcceptOne={(id) => {
                        void acceptProposal(id);
                      }}
                      onRejectOne={(id) => {
                        rejectProposal(id);
                      }}
                      onJumpToProposal={(proposal) => {
                        const targetId =
                          proposal.draft.kind === "new-section" ? null : proposal.sectionId;
                        if (!targetId) return;
                        const el = document.querySelector<HTMLElement>(
                          `[data-section-id="${targetId}"]`
                        );
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <Reorder.Group
                axis="y"
                values={renderSections.map((section) => section.id)}
                onReorder={handleSectionReorder}
                className="space-y-10 md:space-y-16"
              >
                {renderSections.map((section) => {
                  const editorIndex = visibleSections.findIndex((item) => item.id === section.id);
                  const depth = sectionDepth(section);
                  const canIndent = canIndentSection(visibleSections, editorIndex);
                  const canOutdent = canOutdentSection(visibleSections, editorIndex);
                  const canAddSubsection = canNestUnder(section);

                  const isOverridden = !documentMode && state.sectionLockOverrides.includes(section.id);
                  const sectionLocked = documentMode
                    ? documentLocked
                    : isOverridden ? !state.locked : state.locked;
                  return (
                    <SectionCard
                      key={section.id}
                      section={section}
                      depth={depth}
                      canIndent={canIndent}
                      canOutdent={canOutdent}
                      onIndent={() => {
                        if (documentMode) indentDocumentSection(section.id);
                        else indentSection(section.id);
                      }}
                      onOutdent={() => {
                        if (documentMode) outdentDocumentSection(section.id);
                        else outdentSection(section.id);
                      }}
                      locked={sectionLocked}
                      globalLocked={documentMode ? documentLocked : state.locked}
                      onToggleLock={
                        documentMode
                          ? () => setDocumentLocked((current) => !current)
                          : () => toggleSectionLock(section.id)
                      }
                      proposals={normalizedPendingProposals.filter((item) => item.sectionId === section.id)}
                      documentProposals={documentProposalsBySection.get(section.id) ?? []}
                      documentUsers={documentUsers}
                      documentReviewDocumentId={currentDocument?.id ?? ""}
                      busyDocumentProposalId={busyDocumentProposalId}
                      onAcceptDocumentProposal={(id) => void resolveDocumentProposal(id, "accept")}
                      onRejectDocumentProposal={(id) => void resolveDocumentProposal(id, "reject")}
                      onDocumentCommentPosted={handleProposalCommentPosted}
                      onAcceptProposal={(id) => {
                        void acceptProposal(id);
                      }}
                      onRejectProposal={(id) => {
                        rejectProposal(id);
                      }}
                      onChangeRichText={(content) => {
                        if (documentMode) {
                          updateDocumentSection(section.id, { content });
                        } else {
                          updateRichTextSection(section.id, content);
                        }
                      }}
                      onRename={() =>
                        setRenameSectionState({
                          id: section.id,
                          name: section.name,
                        })
                      }
                      onDuplicate={() => {
                        if (documentMode) {
                          setDocumentSections((current) => {
                            const index = current.findIndex((item) => item.id === section.id);
                            if (index === -1) return current;
                            const copy = createDocumentSection(`${section.name} copy`, section.content);
                            copy.accent = section.accent;
                            return [
                              ...current.slice(0, index + 1),
                              copy,
                              ...current.slice(index + 1),
                            ];
                          });
                        } else {
                          duplicateSection(section.id);
                        }
                      }}
                      onSetAccent={(accent) => {
                        if (documentMode) {
                          updateDocumentSection(section.id, { accent });
                        } else {
                          setSectionAccent(section.id, accent);
                        }
                      }}
                      onDelete={() =>
                        // Defer so the section menu closes before the dialog
                        // opens, letting the dialog play its enter animation.
                        window.setTimeout(
                          () =>
                            setDeleteSectionState({
                              id: section.id,
                              name: section.name,
                            }),
                          0
                        )
                      }
                      onArchive={() => {
                        if (documentMode) {
                          updateDocumentSection(section.id, { archived: true });
                        } else {
                          archiveSection(section.id);
                          toast.success(`Archived "${section.name}"`);
                        }
                      }}
                      onAddSectionAfter={(mode) => openComposerAndReveal(section.id, mode)}
                      canAddSubsection={canAddSubsection}
                      onCreateSectionFromSelection={(input) =>
                        createSectionFromSelection(section.id, input)
                      }
                      comments={documentMode ? [...rootDocumentComments, ...pendingComments] : []}
                      activeCommentId={activeDocumentCommentId}
                      commentUsers={documentMode ? mentionableUsers : []}
                      onCreateComment={
                        documentMode ? createDocumentCommentFromEditor : undefined
                      }
                      onSelectComment={
                        documentMode
                          ? (commentId) => {
                              setActiveDocumentPanel("comments");
                              setActiveDocumentCommentId(commentId);
                            }
                          : undefined
                      }
                      enableReferences={documentMode}
                    />
                  );
                })}
              </Reorder.Group>

              {visibleSections.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--creed-border)] px-4 py-16 text-center">
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    Every section is archived
                  </div>
                  <div className="max-w-sm text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                    Restore a section from Settings, under Archived, to bring it back into your Creed.
                  </div>
                </div>
              ) : null}

              {normalizedPendingProposals.filter((p) => p.draft.kind === "new-section").length > 0 ? (
                <div className="mt-10 space-y-3 md:mt-16">
                  {normalizedPendingProposals
                    .filter((p) => p.draft.kind === "new-section")
                    .map((p) => (
                      <div key={p.id} data-proposal-id={p.id}>
                        <InlineNewSectionProposal
                          proposal={p}
                          agentName={p.agentName}
                          onAccept={() => {
                            void acceptProposal(p.id);
                          }}
                          onReject={() => {
                            rejectProposal(p.id);
                          }}
                        />
                      </div>
                    ))}
                </div>
              ) : null}

              <div ref={composerAreaRef} className="mt-10 md:mt-16">
                {composerOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                          {composerMode === "child" ? "New subsection" : "New section"}
                        </div>
                        <div className="mt-0.5 hidden text-[12px] text-[var(--creed-text-secondary)] sm:block">
                          {composerMode === "child" && insertAfterId
                            ? `Nested under "${
                                visibleSections.find((item) => item.id === insertAfterId)?.name ??
                                "section"
                              }". Pick a starter or name your own.`
                            : "Pick a starter or name your own."}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-md"
                        onClick={() => setComposerOpen(false)}
                        aria-label="Close composer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <Input
                      ref={inputRef}
                      value={composerName}
                      onChange={(event) => setComposerName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitComposer();
                        }
                      }}
                      placeholder="Section name..."
                      className="mt-4 h-10 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[14px]"
                    />

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        className="rounded-md text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => setComposerOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={submitComposer}
                        className="rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                      >
                        Create
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openComposerAndReveal()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--creed-border-strong)] bg-[var(--creed-surface)] px-4 py-3.5 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:border-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add section
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {documentMode ? (
          <DocumentCollaborationRail
            panel={activeDocumentPanel}
            comments={rootDocumentComments}
            pendingComments={pendingComments}
            repliesByParent={documentRepliesByParent}
            activity={documentActivity}
            users={documentUsers}
            mentionUsers={mentionableUsers}
            currentUserId={currentUserId}
            activeCommentId={activeDocumentCommentId}
            replyingTo={replyingTo}
            replyBody={replyBody}
            savingReply={savingReply}
            onReplyingToChange={setReplyingTo}
            onReplyBodyChange={setReplyBody}
            onCreateReply={(commentId) => void createDocumentReply(commentId)}
            onUpdateCommentStatus={(commentId, status) => void updateDocumentCommentStatus(commentId, status)}
            onUpdateCommentBody={updateDocumentCommentBody}
            onDeleteComment={(commentId) => void deleteDocumentCommentById(commentId)}
            onApprovePending={(commentId) => void approvePendingComment(commentId)}
            onRejectPending={(commentId) => void rejectPendingComment(commentId)}
            onActiveCommentChange={setActiveDocumentCommentId}
            onOpenVersion={(versionId) => setFocusVersionId(versionId)}
            onClose={() => setActiveDocumentPanel(null)}
          />
        ) : (
          <ActivityRail
            activity={state.activity}
            proposals={state.proposals}
            sections={state.sections}
            open={activityOpen}
            onClose={() => setActivityOpen(false)}
          />
        )}

      </div>

      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Push Creed</DialogTitle>
            <DialogDescription>
              This will save your current Creed as{" "}
              <span className="font-mono text-[13px]">creed.md</span> to GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pushPreview?.warnings.length ? (
              <div className="rounded-[var(--radius-lg)] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-4 text-[14px] leading-7 text-[#92400E] dark:border-[#fbbf24]/40 dark:bg-[#451a03]/40 dark:text-[#fbbf24]">
                {pushPreview.warnings.join(" ")}
              </div>
            ) : null}

            {pushPreviewBusy && !pushPreview ? (
              <div className="py-2 text-[14px] text-[var(--creed-text-secondary)]">
                Checking what will change...
              </div>
            ) : pushPreview ? (
              <SectionChangeList
                changes={computeSectionChanges(
                  pushPreview.sections,
                  state.sections,
                  state.sections
                )}
                heading="Outgoing changes"
                show={showPushPreview}
                renderKey={pushPreviewRenderKey}
              />
            ) : null}

            <div>
              <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                Commit message
              </label>
              <Input
                value={pushMessage}
                onChange={(event) => setPushMessage(event.target.value)}
                className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
              />
            </div>
          </div>
          <DialogFooter className="justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setPushDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => void handlePushCreed()}
              disabled={pushBusy || !githubConfigured}
            >
              {pushBusy ? "Pushing" : "Push Creed"}
              {pushBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pullDialogOpen} onOpenChange={setPullDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Pull from GitHub</DialogTitle>
            <DialogDescription>
              {documentMode ? (
                <>Review the remote file before it replaces this document.</>
              ) : (
                <>
                  Review the remote <span className="font-mono text-[13px]">creed.md</span> before it
                  replaces your local file.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {pullBusy && !pullPreview ? (
            <div className="py-6 text-[14px] text-[var(--creed-text-secondary)]">
              Loading GitHub preview...
            </div>
          ) : pullPreview ? (
            <div className="space-y-4">
              {pullPreview.warnings.length > 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-4 text-[14px] leading-7 text-[#92400E] dark:border-[#fbbf24]/40 dark:bg-[#451a03]/40 dark:text-[#fbbf24]">
                  {pullPreview.warnings.join(" ")}
                </div>
              ) : null}

              <SectionChangeList
                changes={computeSectionChanges(
                  editorSections,
                  pullPreview.sections,
                  editorSections
                )}
                heading="Incoming changes"
                show={showPullPreview}
                renderKey={pullPreviewRenderKey}
              />
            </div>
          ) : null}
          <DialogFooter className="justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setPullDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => void handleApplyPull()}
              disabled={pullBusy || !pullPreview}
            >
              {pullBusy ? "Importing" : documentMode ? "Import remote document" : "Import remote Creed"}
              {pullBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDocumentOpen}
        onOpenChange={(open) => {
          if (renamingDocument) return;
          setRenameDocumentOpen(open);
          if (open) {
            setRenameDocumentTitle(currentDocument?.title ?? "");
          }
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              Update the file name and URL slug.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameDocumentTitle}
            onChange={(event) => setRenameDocumentTitle(event.target.value)}
            className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
            disabled={renamingDocument}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameDocumentTitle.trim()) {
                event.preventDefault();
                void renameCurrentDocument();
              }
            }}
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              disabled={renamingDocument}
              onClick={() => setRenameDocumentOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              disabled={
                renamingDocument ||
                !renameDocumentTitle.trim() ||
                renameDocumentTitle.trim() === currentDocument?.title.trim()
              }
              onClick={() => void renameCurrentDocument()}
            >
              {renamingDocument ? "Renaming" : "Rename"}
              {renamingDocument ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameSectionState)}
        onOpenChange={(open) => !open && setRenameSectionState(null)}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
            <DialogDescription>
              Update the section title without changing its content.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameSectionState?.name ?? ""}
            onChange={(event) =>
              setRenameSectionState((current) =>
                current ? { ...current, name: event.target.value } : current
              )
            }
            className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameSectionState?.name.trim()) {
                renameSection(renameSectionState.id, renameSectionState.name);
                setRenameSectionState(null);
              }
            }}
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setRenameSectionState(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => {
                if (!renameSectionState?.name.trim()) {
                  return;
                }
                renameSection(renameSectionState.id, renameSectionState.name);
                setRenameSectionState(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteSectionState)}
        onOpenChange={(open) => !open && setDeleteSectionState(null)}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Delete section</DialogTitle>
            <DialogDescription>
              Remove {deleteSectionState?.name ?? "this section"} from the file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setDeleteSectionState(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                if (!deleteSectionState) {
                  return;
                }
                deleteSection(deleteSectionState.id);
                setDeleteSectionState(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFileOpen} onOpenChange={setDeleteFileOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[18px] font-medium">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete Creed file
            </DialogTitle>
            <DialogDescription>
              Wipes every section, proposal, and activity entry. Your account stays. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setDeleteFileOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                clearSections();
                setDeleteFileOpen(false);
              }}
            >
              Delete file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveAllOpen} onOpenChange={setArchiveAllOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Archive all sections</DialogTitle>
            <DialogDescription>
              This moves every section to your archive and starts you with a single fresh section.
              Nothing is deleted - restore any section anytime in Settings, under Archived.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setArchiveAllOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              onClick={() => {
                archiveCreed();
                setArchiveAllOpen(false);
                toast.success("All sections archived");
              }}
            >
              Archive all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionCard({
  section,
  depth,
  canIndent,
  canOutdent,
  onIndent,
  onOutdent,
  locked,
  globalLocked,
  onToggleLock,
  proposals,
  onAcceptProposal,
  onRejectProposal,
  documentProposals = [],
  documentUsers = [],
  documentReviewDocumentId = "",
  busyDocumentProposalId = null,
  onAcceptDocumentProposal,
  onRejectDocumentProposal,
  onDocumentCommentPosted,
  onChangeRichText,
  onRename,
  onSetAccent,
  onDuplicate,
  onDelete,
  onArchive,
  onAddSectionAfter,
  canAddSubsection,
  onCreateSectionFromSelection,
  comments = [],
  activeCommentId = null,
  commentUsers = [],
  onCreateComment,
  onSelectComment,
  enableReferences = false,
}: {
  section: CreedSection;
  depth: number;
  canIndent: boolean;
  canOutdent: boolean;
  onIndent: () => void;
  onOutdent: () => void;
  locked: boolean;
  globalLocked: boolean;
  onToggleLock: () => void;
  proposals: Proposal[];
  onAcceptProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  documentProposals?: DocumentReviewProposal[];
  documentUsers?: WorkspaceUser[];
  documentReviewDocumentId?: string;
  busyDocumentProposalId?: string | null;
  onAcceptDocumentProposal?: (proposalId: string) => void;
  onRejectDocumentProposal?: (proposalId: string) => void;
  onDocumentCommentPosted?: (comment: DocumentComment) => void;
  onChangeRichText: (content: string) => void;
  onRename: () => void;
  onSetAccent: (accent: AccentKey) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onAddSectionAfter: (mode: "sibling" | "child") => void;
  canAddSubsection: boolean;
  onCreateSectionFromSelection: (input: { name: string; content?: string }) => void;
  comments?: DocumentComment[];
  activeCommentId?: string | null;
  commentUsers?: WorkspaceUser[];
  onCreateComment?: (input: {
    quote: string;
    body: string;
    mentionedUserIds: string[];
  }) => Promise<void> | void;
  onSelectComment?: (commentId: string) => void;
  enableReferences?: boolean;
}) {
  const dragControls = useDragControls();
  const accent = accentColorMap[section.accent];
  // Section titles shrink with nesting depth so the hierarchy reads at a glance:
  // top-level sections are largest, subsections smaller, sub-subsections smallest.
  const titleSizeClass =
    depth >= 2
      ? "text-[13px] md:text-[14px]"
      : depth === 1
        ? "text-[14px] md:text-[15px]"
        : "text-[16px] md:text-[18px]";
  const accentBarHeightClass = depth >= 2 ? "h-6" : depth === 1 ? "h-7" : "h-9";
  const sectionText = useMemo(() => htmlToText(section.content).toLocaleLowerCase(), [section.content]);
  const sectionCommentAnchors = useMemo(
    () =>
      comments
        .filter((comment) => {
          if (comment.status !== "open") return false;
          const quote = comment.referenceQuote.trim();
          return quote.length > 0 && sectionText.includes(quote.toLocaleLowerCase());
        })
        .map((comment) => ({
          id: comment.id,
          quote: comment.referenceQuote,
          body: comment.body,
          authorLabel: comment.authorLabel,
          status: comment.status,
        })),
    [comments, sectionText]
  );

  return (
    <Reorder.Item
      value={section.id}
      dragListener={false}
      dragControls={dragControls}
      data-section-id={section.id}
      id={section.id}
      className="scroll-mt-24"
      style={depth > 0 ? { paddingLeft: depth * 18 } : undefined}
    >
      <section className="group relative">
        <button
          type="button"
          onPointerDown={(event) => dragControls.start(event)}
          className="group/drag absolute -left-7 top-1 hidden rounded-full p-1 text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] xl:flex"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span
                className={cn("inline-block w-[3px] rounded-full", accentBarHeightClass)}
                style={{ backgroundColor: accent }}
              />
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span
                  className={cn("font-medium leading-none", titleSizeClass)}
                  style={{ color: accent }}
                >
                  {section.name}
                </span>
                {/* Per-section lock controls only exist while the master
                    lock is on - the header is the authority. Smoothly
                    expand/collapse so the chrome doesn't jump when the user
                    toggles the master. */}
                <AnimatePresence initial={false}>
                  {globalLocked ? (
                    <motion.div
                      key={`${section.id}-section-lock`}
                      initial={{ opacity: 0, scale: 0.88, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 28 }}
                      exit={{ opacity: 0, scale: 0.88, width: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <SectionLockButton
                        locked={locked}
                        title={locked ? `Unlock ${section.name}` : `Lock ${section.name}`}
                        onToggle={onToggleLock}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] data-[state=open]:text-[var(--creed-text-primary)]"
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[var(--creed-border)] bg-[var(--creed-surface)]">
              <AnimatedMenuIconItem
                icon={SquarePen}
                className="text-sm"
                onSelect={onRename}
              >
                Rename
              </AnimatedMenuIconItem>
              <AnimatedMenuIconItem
                icon={ArrowRight}
                className="text-sm"
                disabled={!canIndent}
                onSelect={() => onIndent()}
              >
                Nest
              </AnimatedMenuIconItem>
              <AnimatedMenuIconItem
                icon={ArrowLeft}
                className="text-sm"
                disabled={!canOutdent}
                onSelect={() => onOutdent()}
              >
                Un-nest
              </AnimatedMenuIconItem>
              {/*
                Colour sub-menu. Hover-driven on desktop via Radix's default
                Sub behaviour, with a custom chevron that flips < → > on
                hover/open so the affordance matches the profile-menu
                Feedback row. The default trailing chevron is hidden.
              */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className="group/colour rounded-[var(--radius-md)] gap-1.5 px-2.5 py-2 text-sm [&>svg:last-of-type]:hidden"
                >
                  <Stamp className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                  <span className="flex-1 text-left">Colour</span>
                  <ChevronLeft
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      "group-hover/colour:rotate-180 group-data-[state=open]/colour:rotate-180"
                    )}
                  />
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    // Matches the gap the profile dropdown uses from its
                    // trigger button (see feedback-menu.tsx). Bridging
                    // pseudo widens to cover the 14px gap so cursor travel
                    // between trigger row and picker doesn't dismiss it.
                    sideOffset={14}
                    alignOffset={0}
                    className="relative w-auto border-[var(--creed-border)] bg-[var(--creed-surface)] p-2 before:pointer-events-auto before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-['']"
                  >
                    <div className="grid grid-cols-4 gap-1.5">
                      {VISIBLE_ACCENT_KEYS.map((accentKey) => {
                        const selected =
                          section.accent === accentKey ||
                          // The legacy `custom` storage value renders as mono
                          // in the palette, so a section saved as "custom"
                          // should highlight the mono cell.
                          (accentKey === "mono" && section.accent === "custom");
                        return (
                          <button
                            key={accentKey}
                            type="button"
                            aria-label={accentLabelMap[accentKey]}
                            aria-pressed={selected}
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              onSetAccent(accentKey);
                              fireConfetti(
                                rect.left + rect.width / 2,
                                rect.top + rect.height / 2,
                                accentColorMap[accentKey]
                              );
                            }}
                            // The selected tick is painted in the app background colour
                            // so it reads as cut out of the filled swatch.
                            className="group/swatch relative flex aspect-square h-7 w-7 items-center justify-center overflow-hidden rounded-md transition-transform duration-150 active:scale-95"
                            style={{ backgroundColor: accentColorMap[accentKey] }}
                          >
                            <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-150 group-hover/swatch:bg-black/15" />
                            {selected ? (
                              <Check
                                className="relative h-4 w-4"
                                strokeWidth={3}
                                style={{ color: "var(--creed-background)" }}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <AnimatedMenuIconItem
                icon={FileStack}
                className="text-sm"
                onSelect={onDuplicate}
              >
                Duplicate
              </AnimatedMenuIconItem>
              <DropdownMenuSeparator />
              <AnimatedMenuIconItem icon={Archive} className="text-sm" onSelect={onArchive}>
                Archive
              </AnimatedMenuIconItem>
              {/* Solid red, matching the file menu's Delete. */}
              <AnimatedMenuIconItem
                icon={Delete}
                className="mt-1 bg-[#DC2626] text-sm text-white hover:bg-[#B91C1C] hover:text-white focus:bg-[#B91C1C] focus:text-white data-[highlighted]:bg-[#B91C1C] data-[highlighted]:text-white not-data-[variant=destructive]:focus:**:text-white"
                onSelect={onDelete}
              >
                Delete
              </AnimatedMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {proposals.length > 0 ? (
          <div className="mb-4 space-y-3">
            {proposals.map((p) => {
              const kind = p.draft.kind;
              if (
                kind === "delete-section" ||
                kind === "rename-section" ||
                kind === "recolor-section"
              ) {
                return (
                  <InlineMetaProposal
                    key={p.id}
                    proposal={p}
                    existingName={section.name}
                    existingAccent={accentColorMap[section.accent]}
                    agentName={p.agentName}
                    onAccept={() => onAcceptProposal(p.id)}
                    onReject={() => onRejectProposal(p.id)}
                  />
                );
              }
              return (
                <InlineProposalDiff
                  key={p.id}
                  proposal={p}
                  existingContent={section.content}
                  agentName={p.agentName}
                  onAccept={() => onAcceptProposal(p.id)}
                  onReject={() => onRejectProposal(p.id)}
                />
              );
            })}
          </div>
        ) : null}

        <div>
          <RichTextEditor
            sectionId={section.id}
            content={section.content}
            readOnly={locked}
            accentColor={accentColorMap[section.accent]}
            onChange={onChangeRichText}
            onAddSectionAfter={onAddSectionAfter}
            canAddSubsection={canAddSubsection}
            onCreateSectionFromSelection={onCreateSectionFromSelection}
            commentUsers={commentUsers}
            onCreateComment={onCreateComment}
            comments={sectionCommentAnchors}
            activeCommentId={activeCommentId}
            onSelectComment={onSelectComment}
            enableReferences={enableReferences}
          />
        </div>

        {documentProposals.length > 0 ? (
          <div className="mt-4 space-y-3">
            {documentProposals.map((documentProposal) => (
              <InlineDocumentProposal
                key={documentProposal.id}
                proposal={documentProposal}
                person={resolveProposalPerson(
                  documentUsers,
                  documentProposal.authorUserId,
                  documentProposal.authorAgentLabel
                )}
                busy={busyDocumentProposalId === documentProposal.id}
                documentId={documentReviewDocumentId}
                users={documentUsers}
                onCommentPosted={onDocumentCommentPosted}
                onAccept={() => onAcceptDocumentProposal?.(documentProposal.id)}
                onReject={() => onRejectDocumentProposal?.(documentProposal.id)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </Reorder.Item>
  );
}

// Lock / unlock button shared by the header and per-section controls.
function AnimatedLockButton({
  locked,
  title,
  onToggle,
  size = "sm",
}: {
  locked: boolean;
  title: string;
  onToggle: () => void;
  size?: "sm" | "header";
}) {
  const dimensions = size === "header"
    ? "h-8 w-8"
    : "h-7 w-7";

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-pressed={locked}
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
        dimensions
      )}
    >
      {locked ? (
        <Lock className="h-4 w-4" />
      ) : (
        <LockOpen className="h-4 w-4" />
      )}
    </button>
  );
}

function HeaderLockButton({
  locked,
  onToggle,
  iconOnly = false,
}: {
  locked: boolean;
  onToggle: () => void;
  iconOnly?: boolean;
}) {
  // Two-button pattern, identical to the Activity button:
  // mobile renders an icon-only `size="icon-sm"` circle, desktop renders a
  // labelled `size="sm"` pill with the SAME className the Activity pill uses.
  const title = locked ? "Locked" : "Unlocked";

  return (
    <>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size="icon-sm"
        aria-label={title}
        aria-pressed={locked}
        style={iconOnly ? undefined : { borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
        className={cn(
          iconOnly ? documentHeaderIconButtonClass : "border-[var(--creed-border)] bg-[var(--creed-surface)] md:hidden",
          locked && "bg-[var(--creed-surface-raised)]"
        )}
        onClick={onToggle}
      >
        {locked ? (
          <Lock className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
        ) : (
          <LockOpen className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
        )}
      </Button>
      {iconOnly ? null : (
      <Button
        variant="outline"
        size="sm"
        aria-pressed={locked}
        style={{ borderRadius: 13, height: 32, minHeight: 32 }}
        className="hidden border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:inline-flex md:px-3.5 md:text-sm"
        onClick={onToggle}
      >
        {locked ? (
          <Lock className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
        ) : (
          <LockOpen className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
        )}
        {title}
      </Button>
      )}
    </>
  );
}

function SectionLockButton({
  locked,
  title,
  onToggle,
}: {
  locked: boolean;
  title: string;
  onToggle: () => void;
}) {
  return <AnimatedLockButton locked={locked} onToggle={onToggle} title={title} size="sm" />;
}

function DocumentCollaborationRail({
  panel,
  comments,
  pendingComments,
  repliesByParent,
  activity,
  users,
  mentionUsers,
  currentUserId,
  activeCommentId,
  replyingTo,
  replyBody,
  savingReply,
  onReplyingToChange,
  onReplyBodyChange,
  onCreateReply,
  onUpdateCommentStatus,
  onUpdateCommentBody,
  onDeleteComment,
  onApprovePending,
  onRejectPending,
  onActiveCommentChange,
  onOpenVersion,
  onClose,
}: {
  panel: "comments" | "activity" | null;
  comments: DocumentComment[];
  pendingComments: DocumentComment[];
  repliesByParent: Map<string, DocumentComment[]>;
  activity: DocumentActivityEvent[];
  users: WorkspaceUser[];
  mentionUsers: WorkspaceUser[];
  currentUserId: string | null;
  activeCommentId: string | null;
  replyingTo: string | null;
  replyBody: string;
  savingReply: boolean;
  onReplyingToChange: (commentId: string | null) => void;
  onReplyBodyChange: (value: string) => void;
  onCreateReply: (commentId: string) => void;
  onUpdateCommentStatus: (commentId: string, status: "open" | "resolved") => void;
  onUpdateCommentBody: (commentId: string, body: string) => Promise<void> | void;
  onDeleteComment: (commentId: string) => void;
  onApprovePending: (commentId: string) => void;
  onRejectPending: (commentId: string) => void;
  onActiveCommentChange: (commentId: string | null) => void;
  onOpenVersion?: (versionId: string) => void;
  onClose: () => void;
}) {
  const open = panel !== null;
  const title = panel === "activity" ? "Activity" : "Comments";
  const openCount = comments.filter((comment) => comment.status === "open").length;
  const mentionLabels = useMemo(() => users.map((user) => user.label), [users]);
  const subtitle =
    panel === "activity"
      ? "Document changes from users and agents."
      : "Select text in the document and use the comment button to start a thread.";

  return (
    <motion.aside
      initial={false}
      animate={{
        width: open ? 400 : 0,
        opacity: open ? 1 : 0,
        x: open ? 0 : 18,
      }}
      transition={{
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:h-full lg:shrink-0 lg:shadow-none",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{ maxWidth: "min(92vw, 400px)" }}
    >
      <div className="flex h-full w-full flex-col p-4 lg:w-[400px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                {title}
              </div>
              {panel === "comments" && openCount > 0 ? (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                  {openCount} open
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[var(--creed-text-tertiary)]">
              {subtitle}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {panel === "comments" ? (
          <ScrollArea className="mt-4 min-h-0 flex-1">
            <div className="space-y-2.5 pr-3">
              {pendingComments.length ? (
                <div className="space-y-2 rounded-[14px] border border-dashed border-[var(--creed-accent)]/40 bg-[var(--creed-accent)]/[0.04] p-3">
                  <div className="flex items-center gap-1.5 px-0.5 text-[12px] font-medium text-[var(--creed-text-secondary)]">
                    <Stamp className="h-3.5 w-3.5" />
                    Pending from your agent
                    <span className="text-[var(--creed-text-tertiary)]">({pendingComments.length})</span>
                  </div>
                  {pendingComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2.5"
                    >
                      <div className="text-[12px] text-[var(--creed-text-tertiary)]">
                        {comment.proposedByAgentLabel || "Agent"} · proposed on your behalf
                      </div>
                      {comment.referenceQuote ? (
                        <div className="mt-1.5 border-l-2 border-[var(--creed-accent)]/40 pl-2 text-[12px] italic text-[var(--creed-text-secondary)]">
                          {comment.referenceQuote}
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-[13px] leading-6 text-[var(--creed-text-primary)]">
                        <MentionText text={comment.body} mentionLabels={mentionLabels} />
                      </div>
                      <div className="mt-2.5 flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                          onClick={() => onRejectPending(comment.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
                          onClick={() => onApprovePending(comment.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve &amp; share
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {comments.length ? (
                comments.map((comment) => (
                  <DocumentCommentCard
                    key={comment.id}
                    comment={comment}
                    replies={repliesByParent.get(comment.id) ?? []}
                    active={activeCommentId === comment.id}
                    replying={replyingTo === comment.id}
                    replyBody={replyBody}
                    savingReply={savingReply}
                    mentionLabels={mentionLabels}
                    mentionUsers={mentionUsers}
                    canManage={comment.createdBy !== null && comment.createdBy === currentUserId}
                    onActive={() => onActiveCommentChange(comment.id)}
                    onReplyingToChange={onReplyingToChange}
                    onReplyBodyChange={onReplyBodyChange}
                    onCreateReply={onCreateReply}
                    onUpdateCommentStatus={onUpdateCommentStatus}
                    onUpdateCommentBody={onUpdateCommentBody}
                    onDeleteComment={onDeleteComment}
                  />
                ))
              ) : pendingComments.length ? null : (
                <div className="rounded-[14px] border border-dashed border-[var(--creed-border)] px-4 py-10 text-center">
                  <MessageSquare className="mx-auto h-5 w-5 text-[var(--creed-text-tertiary)]" />
                  <div className="mt-2 text-sm font-medium text-[var(--creed-text-primary)]">
                    No comments yet
                  </div>
                  <div className="mx-auto mt-1 max-w-[240px] text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                    Highlight any text in the document and click the comment button to add the first one.
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="mt-3 min-h-0 flex-1">
            <div className="divide-y divide-[var(--creed-border)]/60 pr-3">
              {activity.length ? (
                activity.map((event) => {
                  const metadata = event.metadata as Record<string, unknown> | undefined;
                  const versionId =
                    typeof metadata?.versionId === "string" ? metadata.versionId : null;
                  const clickable = Boolean(versionId && onOpenVersion);
                  const body = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[11.5px] font-medium text-[var(--creed-text-primary)]">
                          {event.actorLabel}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-[var(--creed-text-tertiary)]">
                          {clickable ? (
                            <History className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                          ) : null}
                          {formatDocumentTimestamp(event.createdAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-[1.45] text-[var(--creed-text-secondary)]">
                        {event.summary || event.action}
                      </div>
                    </>
                  );
                  return clickable ? (
                    <button
                      key={event.id}
                      type="button"
                      title="Open in version history"
                      onClick={() => versionId && onOpenVersion?.(versionId)}
                      className="group block w-full py-1.5 text-left transition-colors hover:bg-[var(--creed-surface-raised)]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={event.id} className="py-1.5">
                      {body}
                    </div>
                  );
                })
              ) : (
                <div className="px-1 py-8 text-center text-[12px] text-[var(--creed-text-secondary)]">
                  No activity yet.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </motion.aside>
  );
}

function CommentActionButton({
  label,
  onClick,
  children,
  tone = "default",
}: {
  label: string;
  onClick: (event: ReactMouseEvent) => void;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:bg-[var(--creed-surface)] hover:text-[var(--creed-text-primary)]",
        tone === "danger" && "hover:bg-[#FEF2F2] hover:text-[#DC2626]"
      )}
    >
      {children}
    </button>
  );
}

function DocumentCommentCard({
  comment,
  replies,
  active,
  replying,
  replyBody,
  savingReply,
  mentionLabels,
  mentionUsers,
  canManage,
  onActive,
  onReplyingToChange,
  onReplyBodyChange,
  onCreateReply,
  onUpdateCommentStatus,
  onUpdateCommentBody,
  onDeleteComment,
}: {
  comment: DocumentComment;
  replies: DocumentComment[];
  active: boolean;
  replying: boolean;
  replyBody: string;
  savingReply: boolean;
  mentionLabels: string[];
  mentionUsers: WorkspaceUser[];
  canManage: boolean;
  onActive: () => void;
  onReplyingToChange: (commentId: string | null) => void;
  onReplyBodyChange: (value: string) => void;
  onCreateReply: (commentId: string) => void;
  onUpdateCommentStatus: (commentId: string, status: "open" | "resolved") => void;
  onUpdateCommentBody: (commentId: string, body: string) => Promise<void> | void;
  onDeleteComment: (commentId: string) => void;
}) {
  const resolved = comment.status === "resolved";
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [repliesCollapsed, setRepliesCollapsed] = useState(false);

  async function saveEdit() {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === comment.body) {
      setEditing(false);
      return;
    }
    try {
      setSavingEdit(true);
      await onUpdateCommentBody(comment.id, trimmed);
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActive}
      onKeyDown={(event) => {
        // Only activate when the card itself is the key target. Without this,
        // Space / Enter typed inside the reply or edit textarea bubbles here
        // and gets preventDefault'd, so replies could never be typed.
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActive();
        }
      }}
      className={cn(
        "group/comment block w-full rounded-2xl border bg-[var(--creed-surface)] p-3.5 text-left shadow-[0_1px_2px_rgba(28,28,26,0.04)] transition-colors",
        active
          ? "border-[#BFD7FE] ring-1 ring-[#BFD7FE]"
          : "border-[var(--creed-border)] hover:border-[var(--creed-border-strong)]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--creed-surface-raised)] text-[11px] font-semibold uppercase text-[var(--creed-text-secondary)]">
            {comment.authorLabel.trim().charAt(0) || "?"}
          </span>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold text-[var(--creed-text-primary)]">
              {comment.authorLabel}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">
              {formatDocumentTimestamp(comment.createdAt)}
            </span>
          </div>
        </div>
        {resolved ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
            <Check className="h-3 w-3" />
            Resolved
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
            Open
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2.5 space-y-2" onClick={(event) => event.stopPropagation()}>
          <MentionTextarea
            value={editBody}
            onChange={setEditBody}
            users={mentionUsers}
            autoFocus
            className="min-h-16 text-[13px]"
            onSubmit={() => void saveEdit()}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => {
                setEditBody(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[12px]"
              disabled={savingEdit || !editBody.trim()}
              onClick={() => void saveEdit()}
            >
              {savingEdit ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 whitespace-pre-wrap text-[13.5px] leading-6 text-[var(--creed-text-primary)]">
          <MentionText text={comment.body} mentionLabels={mentionLabels} />
        </div>
      )}

      {!editing && confirmingDelete ? (
        <div
          className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-[#FEF2F2] px-2.5 py-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="text-[12px] text-[#B91C1C]">Delete this comment?</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 bg-[#DC2626] px-3 text-[12px] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                setConfirmingDelete(false);
                onDeleteComment(comment.id);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {!editing && !confirmingDelete ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          {replies.length ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setRepliesCollapsed((value) => !value);
              }}
              className="flex items-center gap-1.5 rounded-md py-1 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:text-[var(--creed-text-primary)]"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  repliesCollapsed && "-rotate-90"
                )}
              />
              {repliesCollapsed ? "Show" : "Hide"} {replies.length}{" "}
              {replies.length === 1 ? "reply" : "replies"}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/comment:opacity-100 md:group-focus-within/comment:opacity-100">
            <CommentActionButton
              label="Reply"
              onClick={(event) => {
                event.stopPropagation();
                onReplyingToChange(replying ? null : comment.id);
              }}
            >
              <Reply className="h-4 w-4" />
            </CommentActionButton>
            <CommentActionButton
              label={resolved ? "Reopen" : "Resolve"}
              onClick={(event) => {
                event.stopPropagation();
                onUpdateCommentStatus(comment.id, resolved ? "open" : "resolved");
              }}
            >
              {resolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </CommentActionButton>
            {canManage ? (
              <>
                <CommentActionButton
                  label="Edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditBody(comment.body);
                    setEditing(true);
                  }}
                >
                  <SquarePen className="h-4 w-4" />
                </CommentActionButton>
                <CommentActionButton
                  label="Delete"
                  tone="danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmingDelete(true);
                  }}
                >
                  <Delete className="h-4 w-4" />
                </CommentActionButton>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {replying ? (
        <div className="mt-2.5 space-y-2" onClick={(event) => event.stopPropagation()}>
          <MentionTextarea
            value={replyBody}
            onChange={onReplyBodyChange}
            users={mentionUsers}
            placeholder="Write a reply. Type @ to mention someone."
            autoFocus
            className="min-h-16 text-[13px]"
            onSubmit={() => onCreateReply(comment.id)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => onReplyingToChange(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[12px]"
              disabled={savingReply || !replyBody.trim()}
              onClick={() => onCreateReply(comment.id)}
            >
              {savingReply ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Reply
            </Button>
          </div>
        </div>
      ) : null}

      {replies.length && !repliesCollapsed ? (
        <div className="mt-2 space-y-2">
          {replies.map((reply) => (
            <div key={reply.id} className="pt-0.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--creed-surface-raised)] text-[9px] font-semibold uppercase text-[var(--creed-text-secondary)]">
                  {reply.authorLabel.trim().charAt(0) || "?"}
                </span>
                <span className="truncate text-[12.5px] font-semibold text-[var(--creed-text-primary)]">
                  {reply.authorLabel}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--creed-text-tertiary)]">
                  {formatDocumentTimestamp(reply.createdAt)}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap pl-7 text-[12.5px] leading-5 text-[var(--creed-text-secondary)]">
                <MentionText text={reply.body} mentionLabels={mentionLabels} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActivityRail({
  activity,
  proposals,
  sections,
  open,
  onClose,
}: {
  activity: ActivityEntry[];
  proposals: Proposal[];
  sections: CreedSection[];
  open: boolean;
  onClose: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | ActivityStatus>("all");
  const [visibleCount, setVisibleCount] = useState(50);

  const livePendingProposalIds = useMemo(
    () => new Set(proposals.filter((proposal) => proposal.status === "pending").map((proposal) => proposal.id)),
    [proposals]
  );

  const filteredAll = useMemo(
    () =>
      activity.filter((entry) => {
        if (entry.status === "pending" && (!entry.proposalId || !livePendingProposalIds.has(entry.proposalId))) {
          return false;
        }

        if (statusFilter !== "all" && entry.status !== statusFilter) {
          return false;
        }

        return true;
      }),
    [activity, livePendingProposalIds, statusFilter]
  );

  useEffect(() => {
    setVisibleCount(50);
  }, [statusFilter]);

  const filtered = useMemo(
    () => filteredAll.slice(0, visibleCount),
    [filteredAll, visibleCount]
  );
  const hasMore = filteredAll.length > visibleCount;

  const grouped = filtered.reduce<Record<string, ActivityEntry[]>>((accumulator, entry) => {
    const dayLabel = formatDayLabel(entry.createdAt, entry.dayLabel);

    if (!accumulator[dayLabel]) {
      accumulator[dayLabel] = [];
    }

    accumulator[dayLabel].push(entry);
    return accumulator;
  }, {});

  return (
    <motion.aside
      initial={false}
      animate={{
        width: open ? 356 : 0,
        opacity: open ? 1 : 0,
        x: open ? 0 : 18,
      }}
      transition={{
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:h-full lg:shrink-0 lg:shadow-none",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{
        maxWidth: "min(82vw, 356px)",
      }}
    >
      <div className="flex h-full w-full flex-col p-5 lg:w-[356px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              Activity
            </div>
            <div className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">
              Audit trail for governed collaboration.
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activityStatuses.map((item) => (
            <ActivityFilterPill
              key={item.value}
              onClick={() => setStatusFilter(item.value)}
              active={statusFilter === item.value}
              tone={
                item.value === "accepted"
                  ? "green"
                  : item.value === "rejected"
                    ? "red"
                    : item.value === "direct"
                      ? "orange"
                      : item.value === "stale"
                        ? "purple"
                        : "blue"
              }
            >
              {item.label}
            </ActivityFilterPill>
          ))}
        </div>

        <ScrollArea className="mt-5 min-h-0 flex-1">
          {filtered.length ? (
            <div className="pr-4">
              <div className="space-y-7">
              {Object.entries(grouped).map(([dayLabel, entries]) => (
                <div key={dayLabel}>
                  <div className="mb-3 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                    {dayLabel}
                  </div>
                  <div className="space-y-3">
                    {entries.map((entry) => {
                      // For pending entries we mirror the inline accept-all
                      // card byte-for-byte: same existing content, same
                      // `getProposalPreviewText` result. Without this, the
                      // sidebar diff was off by 1–2 tokens because it used a
                      // stale snapshot stored at proposal-creation time.
                      const liveProposal = entry.proposalId
                        ? proposals.find((proposal) => proposal.id === entry.proposalId)
                        : undefined;
                      const liveSection = sections.find((section) => section.id === entry.sectionId);
                      const liveExistingContent =
                        entry.status === "pending" ? liveSection?.content : undefined;
                      const liveProposedText =
                        entry.status === "pending" && liveProposal
                          ? getProposalPreviewText(liveProposal.draft)
                          : undefined;
                      return (
                        <ActivityRow
                          key={entry.id}
                          entry={entry}
                          accent={liveSection?.accent ?? entry.accent}
                          liveExistingContent={liveExistingContent}
                          liveProposedText={liveProposedText}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              </div>
              {hasMore ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((current) => current + 50)}
                    className="w-full rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                  >
                    Load more · {filteredAll.length - visibleCount} remaining
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-[13px] text-[var(--creed-text-tertiary)]">
              <History className="h-5 w-5 opacity-60" />
              <span className="font-medium opacity-60">Nothing here yet</span>
            </div>
          )}
        </ScrollArea>
      </div>
    </motion.aside>
  );
}

function ActivityRow({
  entry,
  accent,
  liveExistingContent,
  liveProposedText,
}: {
  entry: ActivityEntry;
  accent: CreedSection["accent"];
  liveExistingContent?: string;
  liveProposedText?: string;
}) {
  const [open, setOpen] = useState(false);
  const agentNames = entry.actorType === "agent" ? uniqueAgentNames([entry.actor]) : [];

  // Reuse the in-app diff machinery so activity cards match the inline
  // proposal diff exactly - same word-level highlighting, same +N/−N stats.
  // For pending entries the parent feeds us the same live values the inline
  // card uses; for accepted/rejected/stale entries we fall back to the
  // snapshot stored on the entry.
  const beforeForDiff = liveExistingContent ?? entry.beforeText ?? "";
  const afterForDiff = liveProposedText ?? entry.afterText ?? "";
  const diffParts = useMemo(
    () => computeDiffParts(beforeForDiff, afterForDiff),
    [beforeForDiff, afterForDiff]
  );
  const diffStats = useMemo(() => summarizeDiff(diffParts), [diffParts]);
  const hasTextualChange = diffParts.some((part) => part.added || part.removed);
  // Activity entries from delete-section operations carry a "Keep X" →
  // "Delete X" before/after pair. The outer card stays neutral (full-card
  // red wash felt heavy); we tint only the expanded diff body red below
  // so the deletion reads clearly when the user opens it.
  const isDeletionActivity =
    entry.afterText.startsWith("Delete ") &&
    (entry.beforeText?.startsWith("Keep ") ?? false);

  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 transition-colors duration-150 hover:bg-[var(--creed-background)]">
      <button
        type="button"
        className="group w-full text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="flex items-start gap-3">
          {entry.actorType === "agent" ? (
            <AgentIconStack
              agents={agentNames}
              variant="inline"
              className="ml-0.5 mt-[2px] shrink-0"
              itemClassName="h-4 w-4"
            />
          ) : (
            <span
              className="mt-1.5 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: accentColorMap[accent] }}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                {entry.sectionName}
              </div>
              <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", getProposalStatusStyles(entry.status))}>
                {activityStatusLabelMap[entry.status]}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-secondary)]",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
              <span className="truncate">{entry.actor}</span>
              {isDeletionActivity ? (
                // A delete-section event is conceptually all-removed (one
                // entire section) - overriding the badge stats keeps the
                // signal honest even though the underlying "Keep X" →
                // "Delete X" diff would otherwise show a confusing
                // +1/−1 split.
                <span className="inline-flex items-center gap-1">
                  <span className="text-[var(--creed-text-tertiary)]">·</span>
                  <DiffBadge tone="added" count={0} />
                  <DiffBadge tone="removed" count={1} />
                </span>
              ) : hasTextualChange ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-[var(--creed-text-tertiary)]">·</span>
                  <DiffBadge tone="added" count={diffStats.added} />
                  <DiffBadge tone="removed" count={diffStats.removed} />
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-[12px] text-[var(--creed-text-tertiary)]">
            {formatRelativeTime(entry.createdAt, entry.timeLabel)}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ marginTop: 0 }}
            animate={{ marginTop: 12 }}
            exit={{ marginTop: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="-mx-3 border-t border-[var(--creed-border)]" />
              <div className="creed-scrollbar creed-diff-block -mx-3 max-h-72 overflow-y-auto px-4 py-3">
                {isDeletionActivity ? (
                  // Render the Delete line as a removal - same red
                  // background + strikethrough as `creed-diff-remove` so
                  // the operation reads consistently with how removed
                  // content is shown in the diff body elsewhere.
                  <span className="creed-diff-remove">
                    Delete {entry.sectionName}
                  </span>
                ) : hasTextualChange ? (
                  diffParts.map((part, index) => {
                    if (part.added) {
                      return (
                        <span key={index} className="creed-diff-add">
                          {part.value}
                        </span>
                      );
                    }
                    if (part.removed) {
                      return (
                        <span key={index} className="creed-diff-remove">
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={index}>{part.value}</span>;
                  })
                ) : (
                  // Fall back to the entry's summary so structural events
                  // (e.g. renames / recolors) still tell the user what
                  // happened even when the textual diff is empty.
                  <span className="text-[var(--creed-text-secondary)]">
                    {entry.summary || "No textual change"}
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
