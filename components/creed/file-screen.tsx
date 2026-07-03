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
  FileText,
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
  Reply,
  RotateCcw,
  Save,
  Share,
  SquarePen,
  Stamp,
  Tag,
  TShirt,
  X,
} from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Textarea } from "@/components/ui/textarea";
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
  type DocumentProposal,
} from "@/components/creed/document-review-panel";
import {
  useCreedShellFileActions,
  useCreedShellActiveSection,
  useCreedShellLiveSections,
} from "@/components/creed/shell";
import { useCreed } from "@/components/creed/creed-provider";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import { markdownToRichHtml } from "@/lib/rich-text";
import { blockIndexAtY, proposalIdsInBlockRange } from "@/lib/diff-block-selection";
import {
  accentColorMap,
  accentLabelMap,
  accentTintMap,
  VISIBLE_ACCENT_KEYS,
  getProposalPreviewText,
  normalizeLegacyProposalDraft,
  normalizeProposalForSection,
  richHtmlToMarkdown,
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
  canOutdentSection,
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

type DocumentBlockOutlineItem = {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  depth: number;
};

function normalizeDocumentMarkdown(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function documentHtmlToMarkdown(html: string) {
  return normalizeDocumentMarkdown(richHtmlToMarkdown(html));
}

function documentMarkdownToHtml(markdown: string) {
  return markdownToRichHtml(normalizeDocumentMarkdown(markdown).trim());
}

function slugifyDocumentHeading(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "heading"
  );
}

function documentOutlineFromHtml(html: string): DocumentBlockOutlineItem[] {
  const matches = Array.from(html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g));
  const levels = matches
    .map((match) => Number.parseInt(match[1], 10))
    .filter((level): level is 1 | 2 | 3 => level === 1 || level === 2 || level === 3);
  const rootLevel = levels.length > 0 ? Math.min(...levels) : 1;
  const counts = new Map<string, number>();
  return matches.flatMap((match) => {
    const name = htmlToText(match[2]).trim();
    if (!name) return [];
    const level = Number.parseInt(match[1], 10) as 1 | 2 | 3;
    const slug = slugifyDocumentHeading(name);
    const count = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, count);
    return [
      {
        id: `doc-heading-${slug}${count > 1 ? `-${count}` : ""}`,
        name,
        level,
        depth: Math.max(0, level - rootLevel),
      },
    ];
  });
}

function documentOutlineToShellSections(outline: DocumentBlockOutlineItem[]): CreedSection[] {
  return outline.map((item) => ({
    id: item.id,
    kind: "rich-text",
    template: "freeform",
    name: item.name,
    accent: "mono",
    content: "",
    depth: item.depth,
    agentWritable: true,
    agentPermission: "propose",
    lastEditedBy: "Creed",
    lastEditedType: "user",
    lastEditedLabel: "just now",
  }));
}

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

type DocumentDiffSegment =
  | { type: "content"; key: string; markdown: string }
  | { type: "proposal"; key: string; proposal: DocumentProposal; conflict: boolean };

function positionsOf(content: string, needle: string) {
  if (!needle) return [];
  const positions: number[] = [];
  let index = content.indexOf(needle);
  while (index !== -1) {
    positions.push(index);
    index = content.indexOf(needle, index + Math.max(needle.length, 1));
  }
  return positions;
}

function matchesPrefix(content: string, index: number, prefix: string) {
  if (!prefix) return true;
  return content.slice(Math.max(0, index - prefix.length), index) === prefix;
}

function matchesSuffix(content: string, index: number, suffix: string) {
  if (!suffix) return true;
  return content.slice(index, index + suffix.length) === suffix;
}

function resolveProposalRange(
  content: string,
  proposal: DocumentProposal,
  cursor: number
): { start: number; end: number; conflict: boolean } {
  const directStart = Math.max(0, Math.min(content.length, proposal.hunkBeforeStart));
  const directEnd = Math.max(directStart, Math.min(content.length, proposal.hunkBeforeEnd));

  if (proposal.hunkBefore.length > 0) {
    if (
      directStart >= cursor &&
      content.slice(directStart, directEnd) === proposal.hunkBefore
    ) {
      return {
        start: directStart,
        end: directEnd,
        conflict: proposal.conflictStatus === "conflict",
      };
    }

    const contextual = positionsOf(content, proposal.hunkBefore).filter(
      (start) =>
        start >= cursor &&
        matchesPrefix(content, start, proposal.hunkPrefix) &&
        matchesSuffix(content, start + proposal.hunkBefore.length, proposal.hunkSuffix)
    );
    if (contextual.length === 1) {
      return {
        start: contextual[0],
        end: contextual[0] + proposal.hunkBefore.length,
        conflict: proposal.conflictStatus === "conflict",
      };
    }
  } else if (
    directStart >= cursor &&
    matchesPrefix(content, directStart, proposal.hunkPrefix) &&
    matchesSuffix(content, directStart, proposal.hunkSuffix)
  ) {
    return {
      start: directStart,
      end: directStart,
      conflict: proposal.conflictStatus === "conflict",
    };
  }

  return {
    start: Math.max(cursor, directStart),
    end: Math.max(cursor, directStart),
    conflict: true,
  };
}

function buildDocumentDiffSegments(content: string, proposals: DocumentProposal[]): DocumentDiffSegment[] {
  const segments: DocumentDiffSegment[] = [];
  const ordered = [...proposals].sort(
    (a, b) => a.hunkBeforeStart - b.hunkBeforeStart || a.hunkIndex - b.hunkIndex || a.id.localeCompare(b.id)
  );
  let cursor = 0;

  for (const proposal of ordered) {
    const range = resolveProposalRange(content, proposal, cursor);
    if (range.start > cursor) {
      segments.push({
        type: "content",
        key: `content:${cursor}:${range.start}`,
        markdown: content.slice(cursor, range.start),
      });
    }

    segments.push({
      type: "proposal",
      key: `proposal:${proposal.id}`,
      proposal,
      conflict: range.conflict,
    });
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < content.length) {
    segments.push({
      type: "content",
      key: `content:${cursor}:end`,
      markdown: content.slice(cursor),
    });
  }

  return segments;
}

function proposalDiffLabel(proposal: DocumentProposal) {
  return proposal.classification || `Proposal ${proposal.hunkIndex + 1}`;
}

// Person attribution for a document proposal: prefer the workspace user behind
// the change (avatar + display name), fall back to the agent/MCP label, and
// finally to a neutral placeholder. Mirrors the review panel's resolvePerson so
// every diff surface credits the same person.
type DiffPerson = { label: string; avatarUrl: string | null };

function resolveProposalPerson(
  proposal: DocumentProposal,
  usersById: Map<string, WorkspaceUser>
): DiffPerson {
  if (proposal.authorUserId) {
    const user = usersById.get(proposal.authorUserId);
    if (user) return { label: user.label, avatarUrl: user.avatarUrl };
  }
  if (proposal.authorAgentLabel) return { label: proposal.authorAgentLabel, avatarUrl: null };
  return { label: "Someone", avatarUrl: null };
}

function diffPersonInitial(label: string) {
  const trimmed = label.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

// Avatar + display name chip. Used both in the inline diff hover toolbar and
// under each diff title in the review rail.
function DiffPersonBadge({
  person,
  className,
  labelClassName,
  compact = false,
}: {
  person: DiffPerson;
  className?: string;
  labelClassName?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar size="sm" className={cn("shrink-0", compact ? "size-4!" : "size-5!")}>
        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt={person.label} /> : null}
        <AvatarFallback className={compact ? "text-[8px]!" : "text-[10px]!"}>
          {diffPersonInitial(person.label)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "truncate font-medium text-[var(--creed-text-secondary)]",
          compact ? "text-[12px]" : "text-[12px]",
          labelClassName
        )}
      >
        {person.label}
      </span>
    </span>
  );
}

// Floating per-diff toolbar shown on hover (or when the diff is the active one).
// Built from phrasing content (spans + buttons) so it stays valid whether it's
// dropped inside a block-level diff card or an inline hunk that lives in a
// paragraph. Mirrors the review pill: person, proposal title, +/- count, then
// comment / reject / accept.
function DiffHoverToolbar({
  proposal,
  person,
  stats,
  active,
  busy,
  commentCount,
  onResolve,
  onStartComment,
}: {
  proposal: DocumentProposal;
  person: DiffPerson;
  stats: { added: number; removed: number };
  active: boolean;
  busy: boolean;
  commentCount: number;
  onResolve: (proposalId: string, action: "accept" | "reject") => Promise<void>;
  onStartComment: (proposalId: string) => void;
}) {
  const label = proposalDiffLabel(proposal);
  const toolbarRef = useRef<HTMLSpanElement | null>(null);

  // Keep the floating toolbar inside the visible editor column. The sidebar can
  // animate in/out without a window resize, so observe the scroll column and
  // diff body and reclamp while their widths change.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    let frame: number | null = null;
    const position = () => {
      frame = null;
      el.style.transform = "translateX(0px)";
      const rect = el.getBoundingClientRect();
      const container = el.closest("[data-document-diff-body]") as HTMLElement | null;
      const scroller = el.closest("[data-file-export-scroll]") as HTMLElement | null;
      const containerRect = container?.getBoundingClientRect();
      const scrollerRect = scroller?.getBoundingClientRect();
      const gutter = 8;
      const bounds = {
        left: Math.max(containerRect?.left ?? 0, scrollerRect?.left ?? 0),
        right: Math.min(
          containerRect?.right ?? window.innerWidth,
          scrollerRect?.right ?? window.innerWidth
        ),
      };
      let shift = 0;
      if (rect.right > bounds.right - gutter) shift = bounds.right - gutter - rect.right;
      if (rect.left + shift < bounds.left + gutter) shift = bounds.left + gutter - rect.left;
      el.style.transform = `translateX(${Math.round(shift)}px)`;
    };
    const schedulePosition = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(position);
    };
    schedulePosition();
    const observer = new ResizeObserver(schedulePosition);
    const container = el.closest("[data-document-diff-body]") as HTMLElement | null;
    const scroller = el.closest("[data-file-export-scroll]") as HTMLElement | null;
    if (container) observer.observe(container);
    if (scroller) observer.observe(scroller);
    window.addEventListener("resize", schedulePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedulePosition);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [label, stats.added, stats.removed]);

  return (
    <span
      ref={toolbarRef}
      data-file-export-hidden
      className={cn(
        // `bottom-full` seats the toolbar above the diff row; the `pb-2` gap is
        // part of this (hoverable) element rather than a margin, so there's no
        // empty dead zone between the row and the pill - moving the cursor up
        // from the row into the toolbar keeps it open. Anchored left; a JS
        // clamp above nudges it back in when a right-edge diff would overflow.
        "pointer-events-none absolute bottom-full left-0 z-30 inline-flex select-none whitespace-nowrap pb-2 opacity-0 transition-opacity duration-150 group-hover/document-diff:pointer-events-auto group-hover/document-diff:opacity-100",
        active && "pointer-events-auto opacity-100"
      )}
    >
      <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 shadow-[0_10px_30px_rgba(28,28,26,0.16)]">
        <DiffPersonBadge
          person={person}
          className="pl-1.5"
          labelClassName="max-w-[112px] text-[var(--creed-text-primary)]"
        />
        <span className="hidden max-w-[140px] truncate text-[12px] text-[var(--creed-text-tertiary)] md:inline">
          {label}
        </span>
        <span className="text-[var(--creed-text-tertiary)]">·</span>
        <span className="inline-flex items-center gap-1 pr-1">
          <DiffBadge tone="added" count={stats.added} size="md" />
          <DiffBadge tone="removed" count={stats.removed} size="md" />
        </span>
        <button
          type="button"
          onClick={() => onStartComment(proposal.id)}
          aria-label={commentCount > 0 ? `${commentCount} comments on this diff` : "Comment on this diff"}
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1 rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-text-primary)]",
            commentCount > 0 ? "w-auto px-1.5 text-[12px] font-medium tabular-nums" : "w-7"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {commentCount > 0 ? <span>{commentCount}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => void onResolve(proposal.id, "reject")}
          disabled={busy}
          aria-label="Reject this diff"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Reject</span>
        </button>
        <button
          type="button"
          onClick={() => void onResolve(proposal.id, "accept")}
          disabled={busy}
          aria-label="Accept this diff"
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2563eb] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Accept</span>
        </button>
      </span>
    </span>
  );
}

function RenderedMarkdownSegment({ markdown }: { markdown: string }) {
  const html = useMemo(() => markdownToRichHtml(markdown), [markdown]);
  if (!markdown.trim() || !html.trim()) return null;

  return (
    <div
      className="creed-rendered-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DocumentProposalInlineDiff({
  proposal,
  conflict,
  active,
  person,
  busy,
  commentCount,
  onResolve,
  onStartComment,
  onHover,
}: {
  proposal: DocumentProposal;
  conflict: boolean;
  active: boolean;
  person: DiffPerson;
  busy: boolean;
  commentCount: number;
  onResolve: (proposalId: string, action: "accept" | "reject") => Promise<void>;
  onStartComment: (proposalId: string) => void;
  onHover: () => void;
}) {
  const parts = useMemo(
    () =>
      computeDiffParts(markdownToRichHtml(proposal.hunkBefore), markdownToRichHtml(proposal.hunkAfter)),
    [proposal.hunkAfter, proposal.hunkBefore]
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <div
      data-document-diff-proposal-id={proposal.id}
      data-active={active ? "true" : "false"}
      data-conflict={conflict ? "true" : "false"}
      data-has-comments={commentCount > 0 ? "true" : "false"}
      onMouseEnter={onHover}
      // No block background wash: the diff is signalled entirely by the
      // add/remove (or amber conflict) word tokens, which brighten on hover
      // and when the diff is the active/selected one (see globals.css).
      className="group/document-diff relative -mx-3 scroll-mt-32 rounded-md px-3 py-1.5"
    >
      {/* Hover toolbar - appears above the diff on hover or when this diff is
          the active/selected one. */}
      <DiffHoverToolbar
        proposal={proposal}
        person={person}
        stats={stats}
        active={active}
        busy={busy}
        commentCount={commentCount}
        onResolve={onResolve}
        onStartComment={onStartComment}
      />

      <div className="creed-diff-block">
        {parts.length === 0 ? (
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
  );
}

// True when a Markdown slice carries block-level structure (heading, list,
// table, code fence, blockquote, rule, or a blank-line paragraph break). Such
// slices must render as their own block so tables/headings keep their shape;
// everything else flows inline so a single edited sentence stays on one line.
function isBlockMarkdownSlice(markdown: string): boolean {
  if (/\n[ \t]*\n/.test(markdown)) return true;
  return /(^|\n)[ \t]*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\||-{3,}\s*$)/.test(markdown);
}

// Collapse a slice's internal whitespace to single spaces while preserving a
// single leading/trailing space, so inline runs keep word separation without
// dragging the document's raw newlines into the flow.
function inlineMarkdownText(markdown: string): string {
  if (!markdown) return "";
  const trimmed = markdown.trim();
  if (!trimmed) return /\s/.test(markdown) ? " " : "";
  const leading = /^\s/.test(markdown) ? " " : "";
  const trailing = /\s$/.test(markdown) ? " " : "";
  return `${leading}${trimmed.replace(/\s+/g, " ")}${trailing}`;
}

// Split a content slice into ordered flow parts so the diff renders like the
// editor/preview: the leading run of prose stays inline (continuing the
// paragraph a neighbouring hunk lives in), genuine block content (tables,
// headings, lists, code, rules, blockquotes) breaks out into its own rendered
// block, and every later paragraph starts a fresh inline run. Without this a
// slice such as " royalty model.\n\n| table |" is treated as one block because
// it contains a table, which drops the "royalty model." paragraph tail onto its
// own row and swallows the space joining it to the preceding hunk. Splitting on
// blank lines is fence-aware so fenced code is never cut in half, and the raw
// substrings are preserved so the word-separating spaces around hunks survive.
type ContentFlowPart = { kind: "inline" | "block"; markdown: string; newParagraph: boolean };

function splitContentFlow(markdown: string): ContentFlowPart[] {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const chunks: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push(buffer.join("\n"));
    buffer = [];
  };

  for (const line of normalized.split("\n")) {
    if (line.trim().startsWith("```")) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();

  // The slice opens on a paragraph break (a blank line before its first prose),
  // so its first chunk begins a new paragraph instead of continuing the
  // preceding hunk's sentence.
  const opensOnBlank = /^[^\S\n]*\n[^\S\n]*\n/.test(normalized);

  return chunks.map((chunk, index) => ({
    kind: isBlockMarkdownSlice(chunk) ? "block" : "inline",
    markdown: chunk,
    newParagraph: index === 0 ? opensOnBlank : true,
  }));
}

// Inline variant of DocumentProposalInlineDiff: renders a hunk's add/remove
// spans as inline elements so the change stays within the surrounding
// paragraph instead of becoming its own stacked block. Keeps the
// data-document-diff-proposal-id / data-active hooks so hover + active
// highlighting continues to work.
function InlineDocumentProposalHunk({
  proposal,
  conflict,
  active,
  person,
  busy,
  commentCount,
  onResolve,
  onStartComment,
  onHover,
}: {
  proposal: DocumentProposal;
  conflict: boolean;
  active: boolean;
  person: DiffPerson;
  busy: boolean;
  commentCount: number;
  onResolve: (proposalId: string, action: "accept" | "reject") => Promise<void>;
  onStartComment: (proposalId: string) => void;
  onHover: () => void;
}) {
  const parts = useMemo(
    () =>
      computeDiffParts(
        markdownToRichHtml(proposal.hunkBefore),
        markdownToRichHtml(proposal.hunkAfter)
      ),
    [proposal.hunkAfter, proposal.hunkBefore]
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <span
      data-document-diff-proposal-id={proposal.id}
      data-active={active ? "true" : "false"}
      data-conflict={conflict ? "true" : "false"}
      data-has-comments={commentCount > 0 ? "true" : "false"}
      onMouseEnter={onHover}
      // No block wash: the change reads through its add/remove (or amber
      // conflict) word tokens, which brighten on hover / when active. `relative`
      // anchors the hover toolbar without disturbing the surrounding text flow.
      className="creed-diff-inline group/document-diff relative"
    >
      <DiffHoverToolbar
        proposal={proposal}
        person={person}
        stats={stats}
        active={active}
        busy={busy}
        commentCount={commentCount}
        onResolve={onResolve}
        onStartComment={onStartComment}
      />
      {parts.map((part, index) => {
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
      })}
    </span>
  );
}

function DocumentProposalDiffBody({
  content,
  proposals,
  busyProposal,
  activeProposalId,
  usersById,
  proposalCommentCounts,
  diffSidebarOpen,
  onToggleDiffSidebar,
  onResolve,
  onResolveMany,
  onStartComment,
  onClearActive,
}: {
  content: string;
  proposals: DocumentProposal[];
  busyProposal: string | null;
  activeProposalId: string | null;
  usersById: Map<string, WorkspaceUser>;
  proposalCommentCounts: Map<string, number>;
  diffSidebarOpen: boolean;
  onToggleDiffSidebar: () => void;
  onResolve: (proposalId: string, action: "accept" | "reject") => Promise<void>;
  onResolveMany: (proposalIds: string[], action: "accept" | "reject") => Promise<void>;
  onStartComment: (proposalId: string) => void;
  onClearActive: () => void;
}) {
  const segments = useMemo(
    () => buildDocumentDiffSegments(content, proposals),
    [content, proposals]
  );
  const anyBusy = Boolean(busyProposal);

  // Selected proposals: the set of diff hunks currently covered by either a
  // text selection or a gutter block-selection. When non-empty, the bottom bar
  // swaps its "Accept all / Reject all" for an "Accept / Reject selected"
  // action over exactly this set.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  // Diff gutter block-selection: dragging in the left gutter (outside any
  // block) highlights whole diff blocks rather than sweeping text. These refs
  // hold the in-progress drag state and the elements currently washed so they
  // can be cleared cleanly.
  const blockSelActiveRef = useRef(false);
  const blockSelectingRef = useRef(false);
  const blockAnchorIdxRef = useRef<number | null>(null);
  const selectedBlockElsRef = useRef<HTMLElement[]>([]);
  // Visible six-dot handle for the diff: appears next to the hovered block so
  // the reader can click to select it or drag to select several.
  const lastHandleIndexRef = useRef<number | null>(null);
  const [blockHandle, setBlockHandle] = useState<{
    top: number;
    left: number;
    index: number;
  } | null>(null);

  useEffect(() => {
    lastHandleIndexRef.current = null;
    setBlockHandle(null);
  }, [diffSidebarOpen]);

  // Per-proposal +/- token counts, keyed by id, so the selection popup can sum
  // exactly the hunks the selection intersects without recomputing per event.
  const statsByProposal = useMemo(() => {
    const map = new Map<string, { added: number; removed: number }>();
    for (const proposal of proposals) {
      const parts = computeDiffParts(
        markdownToRichHtml(proposal.hunkBefore),
        markdownToRichHtml(proposal.hunkAfter)
      );
      map.set(proposal.id, summarizeDiff(parts));
    }
    return map;
  }, [proposals]);

  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    let raf: number | null = null;

    const recompute = () => {
      raf = null;
      // A gutter block-selection is driving the selection - don't let a
      // (deliberately cleared) text range clobber it.
      if (blockSelActiveRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        for (const el of selectedBlockElsRef.current) {
          el.classList.remove("creed-block-selected");
        }
        selectedBlockElsRef.current = [];
        blockSelActiveRef.current = false;
        setSelectedProposalIds([]);
        return;
      }
      const range = sel.getRangeAt(0);
      for (const el of selectedBlockElsRef.current) {
        el.classList.remove("creed-block-selected");
      }
      selectedBlockElsRef.current = [];
      blockSelActiveRef.current = false;
      if (!container.contains(range.commonAncestorContainer)) {
        setSelectedProposalIds([]);
        return;
      }
      const ids: string[] = [];
      for (const block of Array.from(container.children) as HTMLElement[]) {
        if (!range.intersectsNode(block)) continue;
        if (block.matches("[data-document-diff-proposal-id]")) {
          const id = block.getAttribute("data-document-diff-proposal-id");
          if (id && !ids.includes(id)) ids.push(id);
        }
        block.querySelectorAll<HTMLElement>("[data-document-diff-proposal-id]").forEach((el) => {
          const id = el.getAttribute("data-document-diff-proposal-id");
          if (id && !ids.includes(id) && range.intersectsNode(el)) ids.push(id);
        });
      }
      setSelectedProposalIds(ids);
    };

    const onSelectionChange = () => {
      if (raf !== null) return;
      raf = window.requestAnimationFrame(recompute);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [statsByProposal]);

  // Clear the diff block-selection wash from every element currently marked.
  const clearBlockWash = useCallback(() => {
    for (const el of selectedBlockElsRef.current) {
      el.classList.remove("creed-block-selected");
    }
    selectedBlockElsRef.current = [];
    blockSelActiveRef.current = false;
  }, []);

  // Index of the top-level diff block whose vertical band contains clientY.
  const childIndexAtY = useCallback((clientY: number): number | null => {
    const container = bodyRef.current;
    if (!container) return null;
    return blockIndexAtY(Array.from(container.children) as HTMLElement[], clientY);
  }, []);

  // Wash blocks [lo, hi] and collect the proposals they cover.
  const applyBlockSelection = useCallback(
    (startIdx: number, endIdx: number) => {
      const container = bodyRef.current;
      if (!container) return;
      const children = Array.from(container.children) as HTMLElement[];
      clearBlockWash();
      const { ids, blocks } = proposalIdsInBlockRange(children, startIdx, endIdx);
      for (const el of blocks) el.classList.add("creed-block-selected");
      selectedBlockElsRef.current = blocks;
      blockSelActiveRef.current = true;
      setSelectedProposalIds(ids);
    },
    [clearBlockWash]
  );

  // Start a block selection/drag at a block index (from the handle or gutter).
  // Extension + release are handled by the document listeners below.
  const startBlockDrag = useCallback(
    (index: number) => {
      window.getSelection()?.removeAllRanges();
      blockSelectingRef.current = true;
      blockAnchorIdxRef.current = index;
      applyBlockSelection(index, index);
    },
    [applyBlockSelection]
  );

  // Document-level wiring: hover to reveal the six-dot handle, drag (from the
  // handle or either outside gutter) to extend a whole-block selection, and
  // clear on an outside click.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;

    const hitBounds = () => {
      const scroller = container.closest<HTMLElement>("[data-file-export-scroll]");
      const rect = container.getBoundingClientRect();
      const scrollerRect = scroller?.getBoundingClientRect();
      return {
        rect,
        left: scrollerRect?.left ?? rect.left - 200,
        right: scrollerRect?.right ?? rect.right + 200,
      };
    };

    const hideHandle = () => {
      if (lastHandleIndexRef.current !== null) lastHandleIndexRef.current = null;
      setBlockHandle(null);
    };

    const positionHandle = (clientY: number) => {
      const index = childIndexAtY(clientY);
      if (index === null) {
        if (lastHandleIndexRef.current !== null) {
          lastHandleIndexRef.current = null;
          setBlockHandle(null);
        }
        return;
      }
      const children = Array.from(container.children) as HTMLElement[];
      const rect = children[index].getBoundingClientRect();
      const lineH = parseFloat(getComputedStyle(children[index]).lineHeight);
      const firstLine = Number.isFinite(lineH)
        ? Math.min(lineH, rect.height)
        : Math.min(rect.height, 28);
      lastHandleIndexRef.current = index;
      setBlockHandle({
        index,
        top: Math.round(rect.top + firstLine / 2 - 12),
        left: Math.round(rect.left - 26),
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      if (blockSelectingRef.current && blockAnchorIdxRef.current !== null) {
        const idx = childIndexAtY(event.clientY);
        if (idx !== null) applyBlockSelection(blockAnchorIdxRef.current, idx);
        return;
      }
      const { rect, left, right } = hitBounds();
      const withinRow =
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom &&
        event.clientX >= left &&
        event.clientX <= right;
      if (withinRow) positionHandle(event.clientY);
      else hideHandle();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-diff-selection-popup]")) return;
      // The visible handle wires its own mousedown (React) - don't double-fire.
      if (target?.closest("[data-diff-block-handle]")) return;
      const { rect, left, right } = hitBounds();
      const inGutter =
        (event.clientX < rect.left || event.clientX > rect.right) &&
        event.clientX >= left &&
        event.clientX <= right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inGutter) {
        if (selectedBlockElsRef.current.length > 0) {
          clearBlockWash();
          setSelectedProposalIds([]);
        }
        return;
      }
      const idx = childIndexAtY(event.clientY);
      if (idx === null) return;
      event.preventDefault();
      startBlockDrag(idx);
    };

    const onMouseUp = () => {
      blockSelectingRef.current = false;
      blockAnchorIdxRef.current = null;
    };

    const onScrollOrResize = () => hideHandle();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      clearBlockWash();
    };
  }, [childIndexAtY, applyBlockSelection, startBlockDrag, clearBlockWash]);

  async function resolveSelected(action: "accept" | "reject") {
    const targets = selectedProposalIds.filter((id) => statsByProposal.has(id));
    if (targets.length === 0) return;
    clearBlockWash();
    setSelectedProposalIds([]);
    setBlockHandle(null);
    window.getSelection()?.removeAllRanges();
    await onResolveMany(targets, action);
  }


  // Group consecutive inline segments (unchanged text + inline hunks) into a
  // single flowing paragraph so an edited sentence reads continuously. Only
  // genuine block content (headings, tables, lists, multi-paragraph slices,
  // block-level hunks) breaks the run into its own block.
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let run: React.ReactNode[] = [];
    let runIndex = 0;
    // When a callout's body is split by a hunk, the raw content slice before
    // the hunk ends mid-callout-line (a dangling `>` opener). Rendering that
    // slice on its own would drop an empty callout box above the diff. Instead
    // we flag the inline run as a callout body and re-wrap it in a
    // `creed-callout` blockquote on flush, so the diff renders *inside* the
    // callout exactly as the editor shows it.
    let runInCallout = false;

    const flushRun = () => {
      if (run.length === 0) {
        runInCallout = false;
        return;
      }
      const body = <p>{run}</p>;
      out.push(
        <div key={`run:${runIndex}`} className="creed-rendered-markdown">
          {runInCallout ? <blockquote className="creed-callout">{body}</blockquote> : body}
        </div>
      );
      run = [];
      runIndex += 1;
      runInCallout = false;
    };

    segments.forEach((segment, segmentIndex) => {
      if (segment.type === "content") {
        const parts = splitContentFlow(segment.markdown);
        // The slice ends mid-callout-line (no terminating newline) and a hunk
        // follows: the callout body continues into that proposal segment.
        const calloutContinues =
          segments[segmentIndex + 1]?.type === "proposal" &&
          /(?:^|\n)[ \t]*>[^\n]*$/.test(segment.markdown.replace(/\r\n/g, "\n"));
        parts.forEach((part, partIndex) => {
          if (part.kind === "block") {
            const isLast = partIndex === parts.length - 1;
            if (isLast && calloutContinues && part.markdown.trimStart().startsWith(">")) {
              flushRun();
              runInCallout = true;
              const body = inlineMarkdownText(part.markdown.replace(/^[ \t]*>[ \t]?/gm, ""));
              if (body) run.push(<span key={`${segment.key}:${partIndex}`}>{body}</span>);
              return;
            }
            flushRun();
            out.push(
              <RenderedMarkdownSegment key={`${segment.key}:${partIndex}`} markdown={part.markdown} />
            );
            return;
          }
          if (part.newParagraph) flushRun();
          const text = inlineMarkdownText(part.markdown);
          if (text) run.push(<span key={`${segment.key}:${partIndex}`}>{text}</span>);
        });
        return;
      }

      const proposal = segment.proposal;
      const blockHunk =
        isBlockMarkdownSlice(proposal.hunkBefore) || isBlockMarkdownSlice(proposal.hunkAfter);
      // Inside an open callout run, keep the hunk inline so it stays within the
      // callout body; a block break here would close the callout prematurely
      // and strand the diff below an empty box again.
      if (blockHunk && !runInCallout) {
        flushRun();
        out.push(
          <DocumentProposalInlineDiff
            key={segment.key}
            proposal={proposal}
            conflict={segment.conflict}
            active={activeProposalId === proposal.id}
            person={resolveProposalPerson(proposal, usersById)}
            busy={busyProposal === proposal.id}
            commentCount={proposalCommentCounts.get(proposal.id) ?? 0}
            onResolve={onResolve}
            onStartComment={onStartComment}
            onHover={onClearActive}
          />
        );
      } else {
        run.push(
          <InlineDocumentProposalHunk
            key={segment.key}
            proposal={proposal}
            conflict={segment.conflict}
            active={activeProposalId === proposal.id}
            person={resolveProposalPerson(proposal, usersById)}
            busy={busyProposal === proposal.id}
            commentCount={proposalCommentCounts.get(proposal.id) ?? 0}
            onResolve={onResolve}
            onStartComment={onStartComment}
            onHover={onClearActive}
          />
        );
      }
    });

    flushRun();
    return out;
  }, [
    segments,
    activeProposalId,
    busyProposal,
    usersById,
    proposalCommentCounts,
    onResolve,
    onStartComment,
    onClearActive,
  ]);

  async function resolveAll(action: "accept" | "reject") {
    await onResolveMany(proposals.map((proposal) => proposal.id), action);
  }

  // Live-derived selection contents: filter out any selected proposals that
  // have since been resolved (so the aggregate count/± updates as the user
  // accepts or rejects), and re-sum the +/- across whatever remains.
  const popupActiveIds = selectedProposalIds.filter((id) => statsByProposal.has(id));
  const popupStats = popupActiveIds.reduce(
    (acc, id) => {
      const stat = statsByProposal.get(id);
      if (stat) {
        acc.added += stat.added;
        acc.removed += stat.removed;
      }
      return acc;
    },
    { added: 0, removed: 0 }
  );

  return (
    <>
      <div
        ref={bodyRef}
        className="space-y-4 md:space-y-5"
        data-document-diff-body
        // Carry the document's accent (the editor uses `#2563EB`) so callouts
        // and other accent-driven blocks render in the doc's blue here too,
        // instead of falling back to the default amber `--section-accent-*`.
        style={
          {
            "--section-accent": "#2563EB",
            "--section-accent-tint": "rgba(37, 99, 235, 0.11)",
            "--section-accent-border": "rgba(37, 99, 235, 0.12)",
            "--section-accent-bar": "rgba(37, 99, 235, 0.82)",
          } as CSSProperties
        }
      >
        {nodes}
      </div>
      {blockHandle ? (
        <button
          type="button"
          data-diff-block-handle
          data-file-export-hidden
          aria-label="Select block"
          // Pointer capture guarantees this element keeps receiving pointermove
          // for the whole drag - even as the cursor travels over other blocks -
          // so dragging reliably extends the block selection.
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            window.getSelection()?.removeAllRanges();
            blockAnchorIdxRef.current = blockHandle.index;
            blockSelectingRef.current = true;
            applyBlockSelection(blockHandle.index, blockHandle.index);
          }}
          onPointerMove={(event) => {
            if (!blockSelectingRef.current || blockAnchorIdxRef.current === null) return;
            const idx = childIndexAtY(event.clientY);
            if (idx !== null) applyBlockSelection(blockAnchorIdxRef.current, idx);
          }}
          onPointerUp={(event) => {
            blockSelectingRef.current = false;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          className="creed-drag-handle"
          style={{ display: "flex", top: blockHandle.top, left: blockHandle.left }}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
            <circle cx="3.25" cy="3.25" r="1.35" fill="currentColor" />
            <circle cx="8.75" cy="3.25" r="1.35" fill="currentColor" />
            <circle cx="3.25" cy="8" r="1.35" fill="currentColor" />
            <circle cx="8.75" cy="8" r="1.35" fill="currentColor" />
            <circle cx="3.25" cy="12.75" r="1.35" fill="currentColor" />
            <circle cx="8.75" cy="12.75" r="1.35" fill="currentColor" />
          </svg>
        </button>
      ) : null}
      {proposals.length > 0 ? (
        <div data-file-export-hidden className="sticky bottom-4 z-[60] mt-10 flex justify-center">
          {popupActiveIds.length > 0 ? (
            // A selection is active: replace the Accept-all / Reject-all bar
            // with an Accept / Reject action scoped to exactly the selected
            // proposals. `select-none` + preventDefault keep the underlying
            // selection intact while the buttons are clicked.
            <div
              data-diff-selection-popup
              onMouseDown={(event) => event.preventDefault()}
              className="inline-flex flex-nowrap select-none items-center gap-1 whitespace-nowrap rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_14px_40px_rgba(28,28,26,0.16)]"
            >
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={diffSidebarOpen}
                aria-label={diffSidebarOpen ? "Hide diff cards" : "Show diff cards"}
                title={diffSidebarOpen ? "Hide diff cards" : "Show diff cards"}
                className={cn(
                  "h-8 w-8 rounded-md p-0 text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
                  diffSidebarOpen && "text-[var(--creed-accent)] hover:text-[var(--creed-accent)]"
                )}
                onClick={onToggleDiffSidebar}
              >
                <FileStack className="h-3.5 w-3.5" />
              </Button>
              <span className="h-5 w-px bg-[var(--creed-border)]" />
              <span className="pl-2 text-[13px] font-medium text-[var(--creed-text-primary)]">
                {popupActiveIds.length}{" "}
                {popupActiveIds.length === 1 ? "proposal" : "proposals"}
              </span>
              <span className="text-[var(--creed-text-tertiary)]">·</span>
              <span className="inline-flex items-center gap-1 px-1">
                <DiffBadge tone="added" count={popupStats.added} size="md" />
                <DiffBadge tone="removed" count={popupStats.removed} size="md" />
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={anyBusy}
                className="h-8 gap-1 rounded-md px-2.5 text-sm text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                onClick={() => void resolveSelected("reject")}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                size="sm"
                disabled={anyBusy}
                className="h-8 gap-1 rounded-md bg-[var(--creed-accent)] px-3 text-sm text-white hover:bg-[var(--creed-accent-hover)]"
                onClick={() => void resolveSelected("accept")}
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </Button>
            </div>
          ) : (
            <div
              onMouseDown={(event) => event.preventDefault()}
              className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_14px_40px_rgba(28,28,26,0.16)]"
            >
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={diffSidebarOpen}
                aria-label={diffSidebarOpen ? "Hide diff cards" : "Show diff cards"}
                title={diffSidebarOpen ? "Hide diff cards" : "Show diff cards"}
                className={cn(
                  "h-8 w-8 rounded-md p-0 text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
                  diffSidebarOpen && "text-[var(--creed-accent)] hover:text-[var(--creed-accent)]"
                )}
                onClick={onToggleDiffSidebar}
              >
                <FileStack className="h-3.5 w-3.5" />
              </Button>
              <span className="h-5 w-px bg-[var(--creed-border)]" />
              <Button
                variant="ghost"
                size="sm"
                disabled={anyBusy}
                className="h-8 gap-1 rounded-md px-2.5 text-sm text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                onClick={() => void resolveAll("reject")}
              >
                <X className="h-3.5 w-3.5" />
                Reject all
              </Button>
              <Button
                size="sm"
                disabled={anyBusy}
                className="h-8 gap-1 rounded-md bg-[var(--creed-accent)] px-3 text-sm text-white hover:bg-[var(--creed-accent-hover)]"
                onClick={() => void resolveAll("accept")}
              >
                <Check className="h-3.5 w-3.5" />
                Accept all
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </>
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
    indentSection,
    outdentSection,
    renameSection,
    setSectionAccent,
    duplicateSection,
    deleteSection,
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
  const [documentSections, setDocumentSections] = useState<CreedSection[]>([]);
  const [documentContentHtml, setDocumentContentHtml] = useState(() =>
    sharedDocument ? documentMarkdownToHtml(sharedDocument.document.content) : ""
  );
  const [savedDocumentMarkdown, setSavedDocumentMarkdown] = useState(() =>
    sharedDocument ? normalizeDocumentMarkdown(sharedDocument.document.content) : ""
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
  const [documentDiffOpen, setDocumentDiffOpen] = useState(false);
  const [documentDiffSidebarOpen, setDocumentDiffSidebarOpen] = useState(false);
  const [documentPendingProposals, setDocumentPendingProposals] = useState<DocumentProposal[]>([]);
  const [documentPendingProposalsLoading, setDocumentPendingProposalsLoading] = useState(true);
  const [busyDocumentDiffProposal, setBusyDocumentDiffProposal] = useState<string | null>(null);
  const [activeDocumentDiffProposalId, setActiveDocumentDiffProposalId] = useState<string | null>(null);
  // Which diff's comment composer is open in the review rail. Lifted here so the
  // inline hover toolbar's Comment button can open it while the composer itself
  // stays in the rail (where there's room for the textarea).
  const [diffCommentProposalId, setDiffCommentProposalId] = useState<string | null>(null);
  const [savingDocumentProperty, setSavingDocumentProperty] = useState<DocumentPropertyName | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareUrlBusy, setShareUrlBusy] = useState(false);
  const [renameDocumentOpen, setRenameDocumentOpen] = useState(false);
  const [renameDocumentTitle, setRenameDocumentTitle] = useState(
    sharedDocument?.document.title ?? ""
  );
  const [renamingDocument, setRenamingDocument] = useState(false);
  const documentUsers = useMemo(() => sharedDocument?.users ?? [], [sharedDocument]);
  const currentUserId = sharedDocument?.currentUserId ?? null;
  // People you can @mention: everyone except yourself (tagging yourself is a
  // no-op the server strips anyway).
  const mentionableUsers = useMemo(
    () => documentUsers.filter((user) => user.id !== currentUserId),
    [documentUsers, currentUserId]
  );
  // Person attribution lookup for document diffs (avatar + display name under
  // each diff title and in the inline hover toolbar).
  const documentUsersById = useMemo(
    () => new Map(documentUsers.map((user) => [user.id, user])),
    [documentUsers]
  );

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".creed-drag-handle").forEach((handle) => {
      handle.style.display = "none";
    });
  }, [activeDocumentPanel, documentDiffSidebarOpen]);

  useEffect(() => {
    if (!sharedDocument) {
      setCurrentDocument(null);
      setDocumentSections([]);
      setDocumentContentHtml("");
      setSavedDocumentMarkdown("");
      setDocumentComments([]);
      setPendingComments([]);
      setDocumentActivity([]);
      setActiveDocumentPanel(null);
      setActiveDocumentCommentId(null);
      setRenameDocumentOpen(false);
      setRenameDocumentTitle("");
      setShareDialogOpen(false);
      setShareUrl("");
      setDocumentDiffOpen(false);
      setDocumentDiffSidebarOpen(false);
      setDocumentPendingProposals([]);
      setDocumentPendingProposalsLoading(true);
      setBusyDocumentDiffProposal(null);
      setActiveDocumentDiffProposalId(null);
      setDiffCommentProposalId(null);
      return;
    }

    setCurrentDocument(sharedDocument.document);
    setDocumentSections([]);
    setDocumentContentHtml(documentMarkdownToHtml(sharedDocument.document.content));
    setSavedDocumentMarkdown(normalizeDocumentMarkdown(sharedDocument.document.content));
    setDocumentComments(sharedDocument.comments);
    setPendingComments(sharedDocument.pendingComments);
    setDocumentActivity(sharedDocument.activity);
    setActiveDocumentPanel(sharedDocument.activeCommentId ? "comments" : null);
    setActiveDocumentCommentId(sharedDocument.activeCommentId ?? null);
    setReplyingTo(null);
    setReplyBody("");
    setRenameDocumentOpen(false);
    setRenameDocumentTitle(sharedDocument.document.title);
    setDocumentDiffOpen(false);
    setDocumentDiffSidebarOpen(false);
    setDocumentPendingProposals([]);
    setDocumentPendingProposalsLoading(true);
    setBusyDocumentDiffProposal(null);
    setActiveDocumentDiffProposalId(null);
    setDiffCommentProposalId(null);
    setShareUrl(
      sharedDocument.document.publicShareEnabled && sharedDocument.document.publicShareId
        ? `${window.location.origin}/share/${encodeURIComponent(sharedDocument.document.publicShareId)}`
        : ""
    );
  }, [sharedDocument]);

  const documentMarkdown = useMemo(
    () => (documentMode ? documentHtmlToMarkdown(documentContentHtml) : ""),
    [documentContentHtml, documentMode]
  );
  const documentDirty = documentMode && documentMarkdown !== savedDocumentMarkdown;

  useEffect(() => {
    if (!documentMode || documentPendingProposals.length === 0) {
      setDocumentDiffOpen(false);
      setActiveDocumentDiffProposalId(null);
      setDiffCommentProposalId(null);
    }
  }, [documentMode, documentPendingProposals.length]);

  const scrollToDocumentDiffProposal = useCallback((proposalId: string) => {
    setActiveDocumentDiffProposalId(proposalId);
    const selector = `[data-document-diff-proposal-id="${(window.CSS?.escape ?? ((value: string) => value))(proposalId)}"]`;
    editorScrollRef.current
      ?.querySelector<HTMLElement>(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const documentOutline = useMemo(
    () => (documentMode ? documentOutlineFromHtml(documentContentHtml) : []),
    [documentContentHtml, documentMode]
  );
  const documentOutlineSections = useMemo(
    () => documentOutlineToShellSections(documentOutline),
    [documentOutline]
  );

  useEffect(() => {
    if (!documentMode) return;
    const frame = window.requestAnimationFrame(() => {
      const container = editorScrollRef.current;
      if (!container) return;
      const headings = Array.from(
        container.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")
      );
      headings.forEach((heading, index) => {
        const outlineItem = documentOutline[index];
        if (!outlineItem) {
          heading.removeAttribute("data-section-id");
          heading.removeAttribute("data-document-heading-level");
          return;
        }
        heading.id = outlineItem.id;
        heading.dataset.sectionId = outlineItem.id;
        heading.dataset.documentHeadingLevel = String(outlineItem.level);
        heading.classList.add("scroll-mt-24");
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [documentContentHtml, documentMode, documentOutline]);

  const editorSections = useMemo(
    () => (documentMode ? [] : state.sections),
    [documentMode, state.sections]
  );
  const rootDocumentComments = useMemo(
    () => documentComments.filter((comment) => !comment.parentId && !comment.proposalId),
    [documentComments]
  );
  const rootPendingComments = useMemo(
    () => pendingComments.filter((comment) => !comment.parentId && !comment.proposalId),
    [pendingComments]
  );
  const proposalRootCommentsByProposalId = useMemo(() => {
    const map = new Map<string, DocumentComment[]>();
    for (const comment of documentComments) {
      if (!comment.proposalId || comment.parentId) continue;
      map.set(comment.proposalId, [...(map.get(comment.proposalId) ?? []), comment]);
    }
    return map;
  }, [documentComments]);
  const proposalCommentCountsByProposalId = useMemo(() => {
    const map = new Map<string, number>();
    for (const comment of [...documentComments, ...pendingComments]) {
      if (!comment.proposalId || comment.status !== "open") continue;
      map.set(comment.proposalId, (map.get(comment.proposalId) ?? 0) + 1);
    }
    return map;
  }, [documentComments, pendingComments]);
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
  const documentEditorCommentAnchors = useMemo(() => {
    if (!documentMode) return [];
    const documentText = htmlToText(documentContentHtml).toLocaleLowerCase();
    return [...rootDocumentComments, ...rootPendingComments]
      .filter((comment) => {
        if (comment.status !== "open") return false;
        const quote = comment.referenceQuote.trim();
        return quote.length > 0 && documentText.includes(quote.toLocaleLowerCase());
      })
      .map((comment) => ({
        id: comment.id,
        quote: comment.referenceQuote,
        body: comment.body,
        authorLabel: comment.authorLabel,
        status: comment.status,
      }));
  }, [documentContentHtml, documentMode, rootPendingComments, rootDocumentComments]);
  // Archived sections stay in state (so they persist) but are hidden from the
  // editor; the section list renders from this live set.
  const visibleSections = useMemo(
    () => editorSections.filter((section) => !section.archived),
    [editorSections]
  );
  useCreedShellLiveSections(documentMode ? documentOutlineSections : null);
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
  const [renameSectionState, setRenameSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSectionState, setDeleteSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteFileOpen, setDeleteFileOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const documentReviewPanelHeightRef = useRef<number | null>(null);
  const editorView = useEditorView();
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

    container.scrollTo({ top: Math.max(container.scrollTop - delta, 0) });
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

  function updateDocumentSection(sectionId: string, patch: Partial<CreedSection>) {
    setDocumentSections((current) =>
      current.map((section) => section.id === sectionId ? { ...section, ...patch } : section)
    );
  }

  function renameCurrentSection(sectionId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (documentMode) {
      updateDocumentSection(sectionId, { name: trimmedName });
    } else {
      renameSection(sectionId, trimmedName);
    }
  }

  function deleteCurrentSection(sectionId: string) {
    if (documentMode) {
      setDocumentSections((current) => current.filter((section) => section.id !== sectionId));
    } else {
      deleteSection(sectionId);
    }
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

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  async function loadPublicShareLink() {
    if (!currentDocument) {
      return "";
    }

    try {
      setShareUrlBusy(true);
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/public-link`,
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        document?: SharedDocument;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not create a public link.");
      }
      if (payload.document) {
        setCurrentDocument(payload.document);
      }
      setShareUrl(payload.url);
      return payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the public link.");
      return "";
    } finally {
      setShareUrlBusy(false);
    }
  }

  function openPublicShareDialog() {
    setShareDialogOpen(true);
    if (!shareUrl) {
      void loadPublicShareLink();
    }
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

  function handleExportPdf() {
    const exportName =
      documentMode && currentDocument
        ? currentDocument.path.split("/").pop()?.replace(/\.[^.]+$/, "") || currentDocument.title
        : "creed";
    const previousTitle = window.document.title;

    window.document.title = `${exportName}.pdf`;
    markActionComplete("pdf");

    const restoreTitle = () => {
      window.document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(restoreTitle, 1000);
    }, 120);
  }

  async function handleImportFile(file: File) {
    try {
      setImportBusy(true);
      setCopiedAction(null);

      const markdown = await file.text();
      if (documentMode) {
        setDocumentContentHtml(documentMarkdownToHtml(markdown));
        toast.success(`Imported ${file.name}`);
        markActionComplete("import");
        return;
      }

      const parsed = parseCreedMarkdown(markdown);

      if (parsed.sections.length === 0) {
        throw new Error(parsed.warnings[0] ?? "Could not import this markdown file");
      }

      await importSections(parsed.sections);
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
        setDocumentContentHtml(documentMarkdownToHtml(payload.document.content));
        setSavedDocumentMarkdown(normalizeDocumentMarkdown(payload.document.content));
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

  async function resolveDocumentDiffProposal(proposalId: string, action: "accept" | "reject") {
    if (!currentDocument) {
      return;
    }

    try {
      setBusyDocumentDiffProposal(proposalId);
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/proposals/${encodeURIComponent(proposalId)}/${action}`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { document?: SharedDocument; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Could not ${action} the proposal.`);
      }

      setDocumentPendingProposals((rows) => {
        const next = rows.filter((proposal) => proposal.id !== proposalId);
        if (next.length === 0) {
          setDocumentDiffOpen(false);
          setDocumentDiffSidebarOpen(false);
        }
        return next;
      });
      setActiveDocumentDiffProposalId((current) => current === proposalId ? null : current);

      if (action === "accept" && payload.document) {
        setCurrentDocument(payload.document);
        setDocumentContentHtml(documentMarkdownToHtml(payload.document.content));
        setSavedDocumentMarkdown(normalizeDocumentMarkdown(payload.document.content));
        await reloadDocumentActivity(payload.document.id);
      } else {
        await reloadDocumentActivity(currentDocument.id);
      }

      setReviewRefreshKey((key) => key + 1);
      toast.success(action === "accept" ? "Proposal accepted" : "Proposal rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
    } finally {
      setBusyDocumentDiffProposal(null);
    }
  }

  async function resolveDocumentDiffProposals(proposalIds: string[], action: "accept" | "reject") {
    if (!currentDocument) {
      return;
    }

    const ids = Array.from(new Set(proposalIds.filter(Boolean)));
    if (ids.length === 0) {
      return;
    }

    try {
      setBusyDocumentDiffProposal("__bulk__");
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(currentDocument.id)}/proposals/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, proposalIds: ids }),
        }
      );
      const payload = (await response.json()) as { document?: SharedDocument; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Could not ${action} the proposals.`);
      }

      setDocumentPendingProposals((rows) => {
        const resolved = new Set(ids);
        const next = rows.filter((proposal) => !resolved.has(proposal.id));
        if (next.length === 0) {
          setDocumentDiffOpen(false);
          setDocumentDiffSidebarOpen(false);
        }
        return next;
      });
      setActiveDocumentDiffProposalId((current) => current && ids.includes(current) ? null : current);

      if (action === "accept" && payload.document) {
        setCurrentDocument(payload.document);
        setDocumentContentHtml(documentMarkdownToHtml(payload.document.content));
        setSavedDocumentMarkdown(normalizeDocumentMarkdown(payload.document.content));
        await reloadDocumentActivity(payload.document.id);
      } else {
        await reloadDocumentActivity(currentDocument.id);
      }

      setReviewRefreshKey((key) => key + 1);
      toast.success(
        action === "accept"
          ? ids.length === 1 ? "Proposal accepted" : "Proposals accepted"
          : ids.length === 1 ? "Proposal rejected" : "Proposals rejected"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the proposals.`);
    } finally {
      setBusyDocumentDiffProposal(null);
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
      setCurrentDocument(payload.document);
      setSavedDocumentMarkdown(normalizeDocumentMarkdown(savedDocumentMarkdown));
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
      setDocumentDiffOpen(false);
      setDocumentDiffSidebarOpen(false);
      setActiveDocumentPanel("comments");
      setActiveDocumentCommentId(payload.comment.id);
    }
    await reloadDocumentActivity(currentDocument.id);
  }

  async function createDocumentCommentForProposal(proposal: DocumentProposal, bodyValue: string) {
    if (!currentDocument) {
      return;
    }
    const body = bodyValue.trim();
    if (!body) {
      return;
    }
    const quote = htmlToText(markdownToRichHtml(proposal.hunkBefore || proposal.hunkAfter))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    const response = await fetch(`/api/app/documents/${encodeURIComponent(currentDocument.id)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        parentId: null,
        proposalId: proposal.id,
        referenceQuote: quote || null,
        mentionedUserIds: [],
      }),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Could not add comment."));
    }
    const payload = (await response.json()) as { comment?: DocumentComment };
    if (payload.comment) {
      setDocumentComments((rows) => [...rows, payload.comment!]);
      toast.success("Comment added");
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
      onSectionSelect: handleSectionSelect,
      onProposalSelect: handleProposalSelect,
    }),
    [handleSectionSelect, handleProposalSelect]
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
          | { type: "proposal"; proposalId: string };

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
  }, [handleSectionSelect, handleProposalSelect]);

  return (
    <>
      <div
        data-file-export-shell
        className="relative flex h-full min-h-0 bg-[var(--creed-surface)] transition-colors duration-200"
      >
        <div className="min-w-0 flex-1">
          <div
            ref={editorScrollRef}
            data-file-export-scroll
            className="h-full overflow-y-auto overscroll-contain creed-scrollbar"
          >
            <div
              data-file-export-content
              className="mx-auto px-4 py-6 pb-28 md:px-12 md:py-10 md:pb-10 xl:px-16"
              style={{
                maxWidth: EDITOR_WIDTH_PX[editorView.width],
                // Scoped var consumed by `.ProseMirror` font-size (globals.css)
                // so only editor content scales, not the header chrome.
                "--editor-font-scale": String(EDITOR_FONT_SCALE[editorView.textScale]),
              } as CSSProperties}
            >
              <div data-file-export-title>
                {documentMode ? currentDocument?.title ?? "Document" : `${state.user.name} / Creed`}
              </div>
              <div
                data-file-sticky-header
                data-file-export-hidden
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
                          if (documentDiffOpen) {
                            setDocumentDiffOpen(false);
                            setDocumentDiffSidebarOpen(false);
                            setActiveDocumentPanel("comments");
                            return;
                          }
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
                          if (documentDiffOpen) {
                            setDocumentDiffOpen(false);
                            setDocumentDiffSidebarOpen(false);
                            setActiveDocumentPanel("activity");
                            return;
                          }
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
                        {documentMode ? (
                          <AnimatedMenuIconItem
                            icon={SquarePen}
                            showIcon={!renamingDocument}
                            className="text-sm"
                            disabled={renamingDocument || documentSaving}
                            onSelect={(event) => {
                              event.preventDefault();
                              setRenameDocumentTitle(currentDocument?.title ?? "");
                              window.setTimeout(() => setRenameDocumentOpen(true), 0);
                            }}
                          >
                            {renamingDocument ? "Renaming" : "Rename"}
                            {renamingDocument ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                          </AnimatedMenuIconItem>
                        ) : null}
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
                        <AnimatedMenuIconItem
                          icon={FileText}
                          showIcon={copiedAction !== "pdf"}
                          className="text-sm"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleExportPdf();
                          }}
                        >
                          {copiedAction === "pdf" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {copiedAction === "pdf" ? "Exporting" : "Export PDF"}
                        </AnimatedMenuIconItem>
                        {documentMode ? (
                          <AnimatedMenuIconItem
                            icon={Share}
                            showIcon
                            className="text-sm"
                            onSelect={(event) => {
                              event.preventDefault();
                              openPublicShareDialog();
                            }}
                          >
                            Share
                          </AnimatedMenuIconItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5">
                          <div className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--creed-text-tertiary)]">
                            View
                          </div>
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className="text-xs text-[var(--creed-text-secondary)]">Text</span>
                            <div className="grid w-[118px] shrink-0 grid-cols-2 overflow-hidden rounded-md border border-[var(--creed-border)]">
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
                                    "px-0 py-1 text-center text-xs transition-colors",
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
                            <div className="grid w-[118px] shrink-0 grid-cols-2 overflow-hidden rounded-md border border-[var(--creed-border)]">
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
                                    "px-0 py-1 text-center text-xs transition-colors",
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
	                    users={documentUsers}
	                    refreshSignal={reviewRefreshKey}
	                    focusVersionId={focusVersionId}
                    onFocusVersionHandled={() => setFocusVersionId(null)}
                    onHeightChange={handleDocumentReviewPanelHeightChange}
                    diffOpen={documentDiffOpen}
                    onDiffOpenChange={(open) => {
                      setDocumentDiffOpen(open);
                      setDocumentDiffSidebarOpen(false);
                      if (open) {
                        setActiveDocumentPanel(null);
                      }
                    }}
                    onPendingProposalsChange={(proposals) => {
                      setDocumentPendingProposals(proposals);
                      if (proposals.length > 0) setDocumentPendingProposalsLoading(false);
                    }}
                    onPendingProposalsLoadingChange={setDocumentPendingProposalsLoading}
                    onDocumentUpdated={(doc) => {
                      setCurrentDocument(doc);
                      setDocumentContentHtml(documentMarkdownToHtml(doc.content));
                      setSavedDocumentMarkdown(normalizeDocumentMarkdown(doc.content));
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

              {documentMode && documentDiffOpen && currentDocument ? (
                <DocumentProposalDiffBody
                  content={currentDocument.content}
                  proposals={documentPendingProposals}
                  busyProposal={busyDocumentDiffProposal}
                  activeProposalId={activeDocumentDiffProposalId}
                  usersById={documentUsersById}
                  proposalCommentCounts={proposalCommentCountsByProposalId}
                  diffSidebarOpen={documentDiffSidebarOpen}
                  onToggleDiffSidebar={() => {
                    setDocumentDiffSidebarOpen((open) => {
                      if (!open) setActiveDocumentPanel(null);
                      return !open;
                    });
                  }}
                  onResolve={resolveDocumentDiffProposal}
                  onResolveMany={resolveDocumentDiffProposals}
                  onStartComment={(proposalId) => {
                    setActiveDocumentPanel(null);
                    setDocumentDiffSidebarOpen(true);
                    scrollToDocumentDiffProposal(proposalId);
                    setDiffCommentProposalId(proposalId);
                  }}
                  onClearActive={() => setActiveDocumentDiffProposalId(null)}
                />
              ) : documentMode && currentDocument ? (
                <div data-document-block-editor className="scroll-mt-24">
                  <RichTextEditor
                    sectionId={`document-${currentDocument.id}`}
                    content={documentContentHtml}
                    readOnly={documentLocked}
                    accentColor="#2563EB"
                    onChange={setDocumentContentHtml}
                    commentUsers={mentionableUsers}
                    onCreateComment={createDocumentCommentFromEditor}
                    comments={documentEditorCommentAnchors}
                    activeCommentId={activeDocumentCommentId}
	                    onSelectComment={(commentId) => {
	                      setDocumentDiffOpen(false);
	                      setDocumentDiffSidebarOpen(false);
	                      setActiveDocumentPanel("comments");
	                      setActiveDocumentCommentId(commentId);
	                    }}
                    enableReferences
                    allowHeading1
                    enableBlockHandle
                  />
                </div>
              ) : (
                <>
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
	                          comments={documentMode ? [...rootDocumentComments, ...rootPendingComments] : []}
                          activeCommentId={activeDocumentCommentId}
                          commentUsers={documentMode ? mentionableUsers : []}
                          onCreateComment={
                            documentMode ? createDocumentCommentFromEditor : undefined
                          }
                          onSelectComment={
                            documentMode
	                              ? (commentId) => {
	                                  setDocumentDiffOpen(false);
	                                  setDocumentDiffSidebarOpen(false);
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
                        No content yet
                      </div>
                      <div className="max-w-sm text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                        Start writing in the editor to build this document.
                      </div>
                    </div>
                  ) : null}

                  {normalizedPendingProposals.filter((p) => p.draft.kind === "new-section").length > 0 ? (
                    <div data-file-export-hidden className="mt-10 space-y-3 md:mt-16">
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
                </>
              )}

            </div>
          </div>
        </div>

        {documentMode ? (
          <div data-file-export-hidden>
            <AnimatePresence initial={false}>
              {documentDiffOpen && documentDiffSidebarOpen && activeDocumentPanel === null ? (
                <DocumentDiffRail
                  key="diff-cards"
                  open
                  proposals={documentPendingProposals}
                  loading={documentPendingProposalsLoading}
                  busyProposal={busyDocumentDiffProposal}
                  activeProposalId={activeDocumentDiffProposalId}
                  usersById={documentUsersById}
                  proposalCommentsById={proposalRootCommentsByProposalId}
                  proposalCommentCounts={proposalCommentCountsByProposalId}
                  mentionLabels={documentUsers.map((user) => user.label)}
                  commentingProposalId={diffCommentProposalId}
                  onCommentingProposalIdChange={setDiffCommentProposalId}
                  onNavigate={scrollToDocumentDiffProposal}
                  onResolve={resolveDocumentDiffProposal}
                  onComment={createDocumentCommentForProposal}
                  onClose={() => setDocumentDiffSidebarOpen(false)}
                />
              ) : null}
              {activeDocumentPanel ? (
                <DocumentCollaborationRail
                  key="document-collaboration"
                  panel={activeDocumentPanel}
                  comments={rootDocumentComments}
                  pendingComments={rootPendingComments}
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
              ) : null}
            </AnimatePresence>
          </div>
        ) : (
          <div data-file-export-hidden>
            <ActivityRail
              activity={state.activity}
              proposals={state.proposals}
              sections={state.sections}
              open={activityOpen}
              onClose={() => setActivityOpen(false)}
            />
          </div>
        )}

      </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Share document</DialogTitle>
            <DialogDescription>
              Anyone with this link can read the document and add comments with a name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-[12px] font-medium text-[var(--creed-text-secondary)]">
              Public link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={shareUrl || (shareUrlBusy ? "Creating link..." : "")}
                placeholder="Create a public link"
                className="h-10 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px]"
              />
              <Button
                type="button"
                className="h-10 rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                disabled={!shareUrl || shareUrlBusy}
                onClick={() => {
                  if (shareUrl) void copyValue("share", shareUrl);
                }}
              >
                {shareUrlBusy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : copiedAction === "share" ? (
                  <AnimatedCheckmark />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copiedAction === "share" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setShareDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                renameCurrentSection(renameSectionState.id, renameSectionState.name);
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
                renameCurrentSection(renameSectionState.id, renameSectionState.name);
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
                deleteCurrentSection(deleteSectionState.id);
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
  onChangeRichText,
  onRename,
  onSetAccent,
  onDuplicate,
  onDelete,
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
  onChangeRichText: (content: string) => void;
  onRename: () => void;
  onSetAccent: (accent: AccentKey) => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
          data-file-export-hidden
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
                      data-file-export-hidden
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

          <div data-file-export-hidden>
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
        </div>

        {proposals.length > 0 ? (
          <div data-file-export-hidden className="mb-4 space-y-3">
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
            commentUsers={commentUsers}
            onCreateComment={onCreateComment}
            comments={sectionCommentAnchors}
            activeCommentId={activeCommentId}
            onSelectComment={onSelectComment}
            enableReferences={enableReferences}
          />
        </div>

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

// One shared shell for every document side rail (diff, comments, activity).
// Keeping the width, border, slide animation, and header treatment in a single
// place means "Proposed changes", "Comments", and "Activity" line up
// pixel-for-pixel - the diff panel reuses this instead of declaring its own
// <aside>. Content is passed as children; each rail only owns its body.
const DOCUMENT_SIDEBAR_WIDTH = 384;

function DocumentSidebarShell({
  open,
  title,
  subtitle,
  headerAccessory,
  onClose,
  closeLabel = "Close panel",
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  headerAccessory?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  return (
    <motion.aside
      initial={{
        width: 0,
        opacity: 0,
        x: 10,
      }}
      animate={{
        width: open ? DOCUMENT_SIDEBAR_WIDTH : 0,
        opacity: open ? 1 : 0,
        x: open ? 0 : 10,
      }}
      exit={{
        width: 0,
        opacity: 0,
        x: 10,
      }}
      transition={{
        duration: 0.16,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:h-full lg:shrink-0 lg:shadow-none",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{
        maxWidth: `min(92vw, ${DOCUMENT_SIDEBAR_WIDTH}px)`,
        willChange: "width, opacity, transform",
      }}
    >
      {/* Inner width is clamped to the aside's clipped width so a fixed 384px
          body never spills past the panel edge (which used to clip the Accept
          button on narrow / scaled viewports). */}
      <div
        className="flex h-full flex-col"
        style={{ width: `min(${DOCUMENT_SIDEBAR_WIDTH}px, 92vw)` }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--creed-border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--creed-text-primary)]">
                {title}
              </h2>
              {headerAccessory}
            </div>
            {subtitle ? (
              <p className="mt-1 text-[12px] leading-5 text-[var(--creed-text-tertiary)]">{subtitle}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1.5 shrink-0 text-[var(--creed-text-tertiary)] hover:text-[var(--creed-text-primary)]"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </motion.aside>
  );
}

function DocumentDiffRail({
  open,
  proposals,
  loading,
  busyProposal,
  activeProposalId,
  usersById,
  proposalCommentsById,
  proposalCommentCounts,
  mentionLabels,
  commentingProposalId,
  onCommentingProposalIdChange,
  onNavigate,
  onResolve,
  onComment,
  onClose,
}: {
  open: boolean;
  proposals: DocumentProposal[];
  loading: boolean;
  busyProposal: string | null;
  activeProposalId: string | null;
  usersById: Map<string, WorkspaceUser>;
  proposalCommentsById: Map<string, DocumentComment[]>;
  proposalCommentCounts: Map<string, number>;
  mentionLabels: string[];
  commentingProposalId: string | null;
  onCommentingProposalIdChange: (proposalId: string | null) => void;
  onNavigate: (proposalId: string) => void;
  onResolve: (proposalId: string, action: "accept" | "reject") => Promise<void>;
  onComment: (proposal: DocumentProposal, body: string) => Promise<void>;
  onClose: () => void;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [commentingBusy, setCommentingBusy] = useState(false);
  const commentBoxRef = useRef<HTMLTextAreaElement | null>(null);

  // When a proposal's composer opens (from the sidebar Comment button or the
  // in-editor diff toolbar, which both set `commentingProposalId`), glide the
  // rail so that proposal's card sits at the very top of the viewport, then
  // focus the composer. Uses a hand-rolled easeOutCubic tween on the
  // ScrollArea viewport (~320ms) rather than native smooth scroll so the
  // motion is quick but smooth and consistent across browsers.
  useEffect(() => {
    if (!commentingProposalId) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const box = commentBoxRef.current;
      if (!box) return;
      const card =
        box.closest<HTMLElement>("[data-diff-rail-card]") ?? box;
      const viewport = box.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        const cardRect = card.getBoundingClientRect();
        const viewRect = viewport.getBoundingClientRect();
        const topGutter = 16;
        const maxTop = viewport.scrollHeight - viewport.clientHeight;
        const target = Math.max(
          0,
          Math.min(viewport.scrollTop + (cardRect.top - viewRect.top) - topGutter, maxTop)
        );
        const start = viewport.scrollTop;
        const delta = target - start;
        if (Math.abs(delta) > 1) {
          const duration = 320;
          const startedAt = performance.now();
          const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
          const step = (now: number) => {
            if (cancelled) return;
            const progress = Math.min(1, (now - startedAt) / duration);
            viewport.scrollTop = start + delta * easeOutCubic(progress);
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      } else {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // preventScroll so focus doesn't jump the viewport and fight the tween.
      box.focus({ preventScroll: true });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [commentingProposalId]);

  async function submitComment(proposal: DocumentProposal) {
    const body = commentBody.trim();
    if (!body || commentingBusy) return;
    try {
      setCommentingBusy(true);
      await onComment(proposal, body);
      setCommentBody("");
      onCommentingProposalIdChange(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment.");
    } finally {
      setCommentingBusy(false);
    }
  }

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const proposal of proposals) {
      const stats = summarizeDiff(
        computeDiffParts(
          markdownToRichHtml(proposal.hunkBefore),
          markdownToRichHtml(proposal.hunkAfter)
        )
      );
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }, [proposals]);
  const showLoading = loading && proposals.length === 0;

  return (
    <DocumentSidebarShell
      open={open}
      title="Proposed changes"
      subtitle={
        showLoading
          ? "Loading proposals..."
          : proposals.length === 1
          ? "1 proposal awaiting review"
          : `${proposals.length} proposals awaiting review`
      }
      closeLabel="Hide diff"
      onClose={onClose}
      headerAccessory={
        proposals.length ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <DiffBadge tone="added" count={totals.added} size="md" />
            <DiffBadge tone="removed" count={totals.removed} size="md" />
          </span>
        ) : null
      }
    >
      <ScrollArea className="h-full">
        <div className="space-y-1.5 px-3 py-3">
            {showLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full bg-[var(--creed-surface-raised)]" />
                      <span className="h-3 w-24 rounded bg-[var(--creed-surface-raised)]" />
                    </div>
                    <span className="h-3 w-14 rounded bg-[var(--creed-surface-raised)]" />
                  </div>
                  <div className="mt-2 h-3 w-4/5 rounded bg-[var(--creed-surface-raised)]" />
                  <div className="mt-2 flex justify-end gap-1.5 border-t border-[var(--creed-border)]/50 pt-2">
                    <span className="h-6 w-14 rounded-md bg-[var(--creed-surface-raised)]" />
                    <span className="h-6 w-14 rounded-md bg-[var(--creed-surface-raised)]" />
                  </div>
                </div>
              ))
            ) : proposals.length ? (
              proposals.map((proposal) => {
                const label = proposalDiffLabel(proposal);
                const stats = summarizeDiff(
                  computeDiffParts(
                    markdownToRichHtml(proposal.hunkBefore),
                    markdownToRichHtml(proposal.hunkAfter)
                  )
                );
                const busy = busyProposal === proposal.id;
                const conflict = proposal.conflictStatus === "conflict";
                const active = activeProposalId === proposal.id;
                const commenting = commentingProposalId === proposal.id;
                const person = resolveProposalPerson(proposal, usersById);
                const proposalComments = proposalCommentsById.get(proposal.id) ?? [];
                const commentCount = proposalCommentCounts.get(proposal.id) ?? 0;

                return (
                  <div
                    key={proposal.id}
                    data-diff-rail-card={proposal.id}
                    className={cn(
                      "group/diff rounded-[10px] border bg-[var(--creed-surface)] p-2.5 transition-colors duration-150",
                      conflict
                        ? "border-[color-mix(in_srgb,var(--creed-danger)_45%,var(--creed-border))] bg-[color-mix(in_srgb,var(--creed-danger)_6%,var(--creed-surface))]"
                        : active
                          ? "border-[color-mix(in_srgb,var(--creed-accent)_60%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--creed-accent)_25%,transparent)]"
                          : "border-[var(--creed-border)] hover:border-[var(--creed-border-strong)]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate(proposal.id)}
                      className="flex w-full items-start justify-between gap-2.5 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <DiffPersonBadge
                          person={person}
                          compact
                          labelClassName="text-[var(--creed-text-primary)]"
                        />
                        <div className="mt-1.5 break-words text-[11.5px] font-medium leading-4 text-[var(--creed-text-secondary)]">
                          {label}
                        </div>
                        {conflict ? (
                          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--creed-danger)]">
                            <AlertTriangle className="h-3 w-3" />
                            Conflict — review before accepting
                          </div>
                        ) : null}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 pt-0.5">
                        <DiffBadge tone="added" count={stats.added} size="card" />
                        <DiffBadge tone="removed" count={stats.removed} size="card" />
                      </span>
                    </button>
                    <div className="mt-2 flex items-center gap-1 border-t border-[var(--creed-border)]/50 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-6 gap-1 rounded-md text-[11.5px]",
                          commentCount > 0 ? "px-1.5 font-medium tabular-nums" : "w-6 px-0",
                          commenting
                            ? "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
                            : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                        )}
                        disabled={commentingBusy}
                        aria-label={commentCount > 0 ? `${commentCount} comments on this diff` : "Comment on this diff"}
                        onClick={() => {
                          onNavigate(proposal.id);
                          onCommentingProposalIdChange(commentingProposalId === proposal.id ? null : proposal.id);
                          setCommentBody("");
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {commentCount > 0 ? <span>{commentCount}</span> : null}
                      </Button>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 rounded-md px-2 text-[11.5px] text-[var(--creed-text-secondary)] hover:bg-[color-mix(in_srgb,var(--creed-danger)_12%,transparent)] hover:text-[var(--creed-danger)]"
                          disabled={busy}
                          onClick={() => void onResolve(proposal.id, "reject")}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 gap-1 rounded-md bg-[var(--creed-accent)] px-2 text-[11.5px] font-medium text-white shadow-none hover:bg-[var(--creed-accent-hover)]"
                          disabled={busy}
                          onClick={() => void onResolve(proposal.id, "accept")}
                        >
                          {busy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Accept
                        </Button>
                      </div>
                    </div>
                    {proposalComments.length ? (
                      <div className="mt-2 space-y-2 px-0.5">
                        {proposalComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="text-left"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--creed-text-tertiary)]">
                              <span className="truncate font-medium text-[var(--creed-text-secondary)]">
                                {comment.authorLabel}
                              </span>
                              <span className="shrink-0">{formatDocumentTimestamp(comment.createdAt)}</span>
                            </div>
                            <div className="mt-1 text-[12px] leading-5 text-[var(--creed-text-primary)]">
                              <MentionText text={comment.body} mentionLabels={mentionLabels} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {commenting ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          ref={commentBoxRef}
                          value={commentBody}
                          onChange={(event) => setCommentBody(event.target.value)}
                          placeholder="Comment on this change"
                          className="min-h-16 resize-none rounded-lg border-[var(--creed-border)] bg-[var(--creed-background)] text-[12px]"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 text-[12px]"
                            disabled={commentingBusy}
                            onClick={() => {
                              onCommentingProposalIdChange(null);
                              setCommentBody("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
                            disabled={!commentBody.trim() || commentingBusy}
                            onClick={() => void submitComment(proposal)}
                          >
                            {commentingBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                            Save comment
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--creed-surface-raised)]">
                  <Check className="h-5 w-5 text-[var(--creed-text-tertiary)]" />
                </div>
                <div className="mt-3 text-[13px] font-medium text-[var(--creed-text-primary)]">
                  All caught up
                </div>
                <div className="mt-1 max-w-[240px] text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                  No proposals left to review.
                </div>
              </div>
            )}
        </div>
      </ScrollArea>
    </DocumentSidebarShell>
  );
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
    <DocumentSidebarShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      headerAccessory={
        panel === "comments" && openCount > 0 ? (
          <span className="rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--creed-text-secondary)]">
            {openCount} open
          </span>
        ) : null
      }
    >
      {panel === "comments" ? (
        <ScrollArea className="h-full">
          <div className="space-y-2.5 px-4 py-4">
              {pendingComments.length ? (
                <div className="space-y-2 rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--creed-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--creed-accent)_4%,transparent)] p-3">
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
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--creed-surface-raised)]">
                    <MessageSquare className="h-5 w-5 text-[var(--creed-text-tertiary)]" />
                  </div>
                  <div className="mt-3 text-[13px] font-medium text-[var(--creed-text-primary)]">
                    No comments yet
                  </div>
                  <div className="mt-1 max-w-[240px] text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                    Highlight any text in the document and click the comment button to add the first one.
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              {activity.length ? (
                <div className="space-y-0.5">
                  {activity.map((event) => {
                    const metadata = event.metadata as Record<string, unknown> | undefined;
                    const versionId =
                      typeof metadata?.versionId === "string" ? metadata.versionId : null;
                    const clickable = Boolean(versionId && onOpenVersion);
                    const body = (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium text-[var(--creed-text-primary)]">
                            {event.actorLabel}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[10.5px] tabular-nums text-[var(--creed-text-tertiary)]">
                            {clickable ? (
                              <History className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            ) : null}
                            {formatDocumentTimestamp(event.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[12px] leading-[1.5] text-[var(--creed-text-secondary)]">
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
                        className="group block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--creed-surface-raised)]"
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={event.id} className="rounded-lg px-2.5 py-2">
                        {body}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--creed-surface-raised)]">
                    <History className="h-5 w-5 text-[var(--creed-text-tertiary)]" />
                  </div>
                  <div className="mt-3 text-[13px] font-medium text-[var(--creed-text-primary)]">
                    No activity yet
                  </div>
                  <div className="mt-1 max-w-[240px] text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                    Changes from you and your agents will show up here.
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
    </DocumentSidebarShell>
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
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
        tone === "danger" && "hover:bg-[color-mix(in_srgb,var(--creed-danger)_12%,transparent)] hover:text-[var(--creed-danger)]"
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
        "group/comment block w-full rounded-[14px] border bg-[var(--creed-surface)] p-3.5 text-left transition-colors",
        active
          ? "border-[color-mix(in_srgb,var(--creed-accent)_60%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--creed-accent)_25%,transparent)]"
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
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--creed-success)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--creed-success)]">
            <Check className="h-3 w-3" />
            Resolved
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[10px] font-medium text-[var(--creed-text-secondary)]">
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
          className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-[color-mix(in_srgb,var(--creed-danger)_10%,transparent)] px-2.5 py-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="text-[12px] text-[var(--creed-danger)]">Delete this comment?</span>
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
              className="h-7 bg-[var(--creed-danger)] px-3 text-[12px] text-white hover:bg-[color-mix(in_srgb,var(--creed-danger)_88%,black)]"
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
        <div className="mt-2.5 space-y-2.5 border-l border-[var(--creed-border)] pl-3">
          {replies.map((reply) => (
            <div key={reply.id}>
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
