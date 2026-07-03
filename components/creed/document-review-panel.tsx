"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { diffWords } from "diff";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, GitDiff, History, LoaderCircle, RotateCcw, X } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { DiffBadge, summarizeDiff } from "@/components/creed/inline-proposal-diff";
import {
  diffMarkdownSections,
  markdownToReviewText,
  sectionChangeLabel,
  type SectionChange,
  type SectionChangeStatus,
} from "@/lib/document-section-diff";
import type { WorkspaceUser } from "@/lib/document-collaboration";
import type { SharedDocument } from "@/lib/shared-documents";
import { markdownToRichHtml } from "@/lib/rich-text";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// Supabase-only review surface for a shared document. Mirrors the personal-file
// ReviewPill: a compact summary pill (total +/- and "N proposals") with a
// Show/Hide diff toggle that controls the document body's diff mode.
// Proposal bodies render through the same Markdown-to-rich-HTML path as the
// editor so tables and diagrams stay legible. Every proposal/version is
// attributed to the person behind it (avatar + name), not the model/MCP label.
// The append-only version history sits below and groups accepted proposal hunks
// by their family id.

type ActorType = "human" | "agent";

type SectionStatus = "added" | "removed" | "modified" | "unchanged";
type HunkStatus = "added" | "removed" | "modified";
type HunkConflictStatus = "clean" | "conflict" | "resolved";

export type DocumentProposal = {
  id: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  kind: "document-hunk";
  content: string;
  summary: string;
  baseRevision: number;
  status: string;
  createdAt: string;
  familyId: string;
  hunkKey: string;
  hunkIndex: number;
  hunkStatus: HunkStatus;
  hunkBefore: string;
  hunkAfter: string;
  hunkBeforeStart: number;
  hunkBeforeEnd: number;
  hunkAfterStart: number;
  hunkAfterEnd: number;
  hunkPrefix: string;
  hunkSuffix: string;
  classification: string;
  conflictStatus: HunkConflictStatus;
};

type VersionChangeHunk = {
  key: string;
  index: number;
  status: HunkStatus;
  before: string;
  after: string;
  classification: string;
};

type DocumentVersion = {
  id: string;
  revision: number;
  content?: string;
  changeHunks?: VersionChangeHunk[];
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
  sourceProposalId: string | null;
  createdAt: string;
};

type EditOutcomeResponse = {
  outcome?: "applied" | "proposed";
  document?: SharedDocument;
  error?: string;
};

type Person = {
  label: string;
  avatarUrl: string | null;
};

function relativeTime(iso: string) {
  const deltaMs = Math.max(Date.now() - new Date(iso).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function initialsFor(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

// Person attribution: avatar + name. We monitor the workspace from a people
// perspective, so even an agent-authored change is credited to the person whose
// connection made it; the model/MCP label is only a last-resort fallback.
function PersonBadge({ person }: { person: Person }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar size="sm" className="h-5 w-5 shrink-0">
        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt={person.label} /> : null}
        <AvatarFallback className="text-[10px]">{initialsFor(person.label)}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium text-[var(--creed-text-primary)]">{person.label}</span>
    </span>
  );
}

function splitTableCells(row: string) {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableDelimiterRow(line: string | undefined) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return splitTableCells(trimmed).every((cell) => /^:?-+:?$/.test(cell));
}

function hasStructuredMarkdown(md: string) {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed.toLowerCase() === "```mermaid") return true;
    if (trimmed.includes("|") && isTableDelimiterRow(lines[index + 1])) return true;
  }
  return false;
}

function hasMarkdownTable(md: string) {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed.includes("|") && isTableDelimiterRow(lines[index + 1])) return true;
  }
  return false;
}

type MarkdownTableBlock = {
  kind: "table";
  header: string[];
  rows: string[][];
};

type MarkdownTextBlock = {
  kind: "text";
  text: string;
};

type MarkdownDiffBlock = MarkdownTextBlock | MarkdownTableBlock;

function parseMarkdownDiffBlocks(md: string): MarkdownDiffBlock[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownDiffBlock[] = [];
  let index = 0;
  let inCodeBlock = false;
  let textLines: string[] = [];

  function flushText() {
    if (textLines.length === 0) return;
    const text = textLines.join("\n").trim();
    if (text) blocks.push({ kind: "text", text });
    textLines = [];
  }

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      textLines.push(line);
      index += 1;
      continue;
    }

    if (!inCodeBlock && trimmed.includes("|") && isTableDelimiterRow(lines[index + 1])) {
      flushText();
      const tableRows = [line, lines[index + 1] ?? ""];
      index += 2;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const nextTrimmed = next.trim();
        if (!nextTrimmed || !nextTrimmed.includes("|") || nextTrimmed.startsWith("```")) break;
        tableRows.push(next);
        index += 1;
      }
      blocks.push({
        kind: "table",
        header: splitTableCells(tableRows[0] ?? ""),
        rows: tableRows.slice(2).map(splitTableCells),
      });
      continue;
    }

    textLines.push(line);
    index += 1;
  }

  flushText();
  return blocks;
}

type AlignedItem = {
  beforeIndex: number | null;
  afterIndex: number | null;
};

function alignByExactMatch<T>(before: T[], after: T[], keyFor: (item: T) => string): AlignedItem[] {
  const beforeKeys = before.map(keyFor);
  const afterKeys = after.map(keyFor);
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array.from({ length: after.length + 1 }, () => 0)
  );

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[beforeIndex][afterIndex] =
        beforeKeys[beforeIndex] === afterKeys[afterIndex]
          ? lengths[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1]);
    }
  }

  const exactMatches: AlignedItem[] = [];
  let beforeCursor = 0;
  let afterCursor = 0;
  while (beforeCursor < before.length && afterCursor < after.length) {
    if (beforeKeys[beforeCursor] === afterKeys[afterCursor]) {
      exactMatches.push({ beforeIndex: beforeCursor, afterIndex: afterCursor });
      beforeCursor += 1;
      afterCursor += 1;
    } else if (lengths[beforeCursor + 1][afterCursor] >= lengths[beforeCursor][afterCursor + 1]) {
      beforeCursor += 1;
    } else {
      afterCursor += 1;
    }
  }

  const aligned: AlignedItem[] = [];
  let previousBefore = 0;
  let previousAfter = 0;

  for (const match of exactMatches) {
    const beforeSegmentEnd = match.beforeIndex ?? previousBefore;
    const afterSegmentEnd = match.afterIndex ?? previousAfter;
    const beforeSegmentLength = beforeSegmentEnd - previousBefore;
    const afterSegmentLength = afterSegmentEnd - previousAfter;
    const pairedLength = Math.min(beforeSegmentLength, afterSegmentLength);

    for (let offset = 0; offset < pairedLength; offset += 1) {
      aligned.push({ beforeIndex: previousBefore + offset, afterIndex: previousAfter + offset });
    }
    for (let offset = pairedLength; offset < beforeSegmentLength; offset += 1) {
      aligned.push({ beforeIndex: previousBefore + offset, afterIndex: null });
    }
    for (let offset = pairedLength; offset < afterSegmentLength; offset += 1) {
      aligned.push({ beforeIndex: null, afterIndex: previousAfter + offset });
    }

    aligned.push(match);
    previousBefore = (match.beforeIndex ?? previousBefore) + 1;
    previousAfter = (match.afterIndex ?? previousAfter) + 1;
  }

  const beforeSegmentLength = before.length - previousBefore;
  const afterSegmentLength = after.length - previousAfter;
  const pairedLength = Math.min(beforeSegmentLength, afterSegmentLength);
  for (let offset = 0; offset < pairedLength; offset += 1) {
    aligned.push({ beforeIndex: previousBefore + offset, afterIndex: previousAfter + offset });
  }
  for (let offset = pairedLength; offset < beforeSegmentLength; offset += 1) {
    aligned.push({ beforeIndex: previousBefore + offset, afterIndex: null });
  }
  for (let offset = pairedLength; offset < afterSegmentLength; offset += 1) {
    aligned.push({ beforeIndex: null, afterIndex: previousAfter + offset });
  }

  return aligned;
}

function rowKey(row: string[]) {
  return row.map((cell) => cell.trim()).join("\u001f");
}

function CellDiffChunks({ before, after }: { before: string; after: string }) {
  if (before === after) return <>{after || before}</>;
  return <DiffChunks parts={diffWords(before, after)} />;
}

function diffCellTone(before: string | undefined, after: string | undefined): RichDiffTone {
  if (before === undefined) return "added";
  if (after === undefined) return "removed";
  return before === after ? "neutral" : "added";
}

function diffCellClass(tone: RichDiffTone) {
  if (tone === "added") {
    return "bg-[color-mix(in_srgb,var(--creed-success)_10%,transparent)]";
  }
  if (tone === "removed") {
    return "bg-[color-mix(in_srgb,var(--creed-danger)_10%,transparent)]";
  }
  return "";
}

function TableDiff({ before, after }: { before: MarkdownTableBlock; after: MarkdownTableBlock }) {
  const columns = useMemo(
    () => alignByExactMatch(before.header, after.header, (cell) => cell.trim()),
    [before.header, after.header]
  );
  const rows = useMemo(() => alignByExactMatch(before.rows, after.rows, rowKey), [before.rows, after.rows]);

  return (
    <div className="overflow-x-auto">
      <table className="creed-table creed-diff-table">
        <tbody>
          <tr>
            {columns.map((column, index) => {
              const beforeCell =
                column.beforeIndex === null ? undefined : before.header[column.beforeIndex];
              const afterCell = column.afterIndex === null ? undefined : after.header[column.afterIndex];
              const tone = diffCellTone(beforeCell, afterCell);
              return (
                <th key={index} className={diffCellClass(tone)}>
                  <CellDiffChunks before={beforeCell ?? ""} after={afterCell ?? ""} />
                </th>
              );
            })}
          </tr>
          {rows.map((row, rowIndex) => {
            const beforeRow = row.beforeIndex === null ? undefined : before.rows[row.beforeIndex];
            const afterRow = row.afterIndex === null ? undefined : after.rows[row.afterIndex];
            const rowTone: RichDiffTone =
              beforeRow === undefined ? "added" : afterRow === undefined ? "removed" : "neutral";
            return (
              <tr
                key={rowIndex}
                className={cn(
                  rowTone === "added"
                    ? "bg-[color-mix(in_srgb,var(--creed-success)_5%,transparent)]"
                    : rowTone === "removed"
                      ? "bg-[color-mix(in_srgb,var(--creed-danger)_5%,transparent)]"
                      : ""
                )}
              >
                {columns.map((column, columnIndex) => {
                  const beforeCell =
                    beforeRow && column.beforeIndex !== null ? beforeRow[column.beforeIndex] : undefined;
                  const afterCell =
                    afterRow && column.afterIndex !== null ? afterRow[column.afterIndex] : undefined;
                  const tone = rowTone === "neutral" ? diffCellTone(beforeCell, afterCell) : rowTone;
                  return (
                    <td key={columnIndex} className={diffCellClass(tone)}>
                      <CellDiffChunks before={beforeCell ?? ""} after={afterCell ?? ""} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderDiffBlockPair(before: MarkdownDiffBlock | undefined, after: MarkdownDiffBlock | undefined, key: string) {
  if (before?.kind === "table" && after?.kind === "table") {
    return <TableDiff key={key} before={before} after={after} />;
  }

  if (before?.kind === "table") {
    return (
      <TableDiff
        key={key}
        before={before}
        after={{ kind: "table", header: [], rows: [] }}
      />
    );
  }

  if (after?.kind === "table") {
    return (
      <TableDiff
        key={key}
        before={{ kind: "table", header: [], rows: [] }}
        after={after}
      />
    );
  }

  return (
    <div key={key} className="whitespace-pre-wrap break-words text-[13px] leading-6">
      <DiffChunks parts={mdDiffParts(before?.text ?? "", after?.text ?? "")} />
    </div>
  );
}

function TableAwareDiff({ before, after }: { before: string; after: string }) {
  const beforeBlocks = useMemo(() => parseMarkdownDiffBlocks(before), [before]);
  const afterBlocks = useMemo(() => parseMarkdownDiffBlocks(after), [after]);
  const aligned = useMemo(
    () =>
      alignByExactMatch(beforeBlocks, afterBlocks, (block) =>
        block.kind === "table" ? `table:${block.header.join("|")}` : `text:${markdownToText(block.text)}`
      ),
    [beforeBlocks, afterBlocks]
  );

  if (aligned.length === 0) {
    return <span className="text-[var(--creed-text-tertiary)]">No textual change</span>;
  }

  return (
    <div className="space-y-3">
      {aligned.map((item, index) =>
        renderDiffBlockPair(
          item.beforeIndex === null ? undefined : beforeBlocks[item.beforeIndex],
          item.afterIndex === null ? undefined : afterBlocks[item.afterIndex],
          String(index)
        )
      )}
    </div>
  );
}

// Strip Markdown syntax down to readable prose so a diff of two Markdown bodies
// reads like the rendered editor, not like raw source. Tables are kept as
// aligned plain text so the old inline diff remains scannable.
function markdownToText(md: string) {
  return markdownToReviewText(md);
}

function mdDiffParts(before: string, after: string) {
  return diffWords(markdownToText(before), markdownToText(after));
}

type DiffPart = ReturnType<typeof mdDiffParts>[number];
type RichDiffTone = "added" | "removed" | "neutral";

function DiffChunks({ parts }: { parts: DiffPart[] }) {
  if (parts.length === 0) {
    return <span className="text-[var(--creed-text-tertiary)]">No textual change</span>;
  }
  return (
    <>
      {parts.map((part, index) => {
        if (part.added) return <span key={index} className="creed-diff-add">{part.value}</span>;
        if (part.removed) return <span key={index} className="creed-diff-remove">{part.value}</span>;
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}

// Rendered diff block: clean prose with add/remove highlighting, matching the
// personal file's `creed-diff-block` look.
function DiffText({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => mdDiffParts(before, after), [before, after]);
  const structured = useMemo(
    () => hasStructuredMarkdown(before) || hasStructuredMarkdown(after),
    [before, after]
  );
  const tableDiff = useMemo(() => hasMarkdownTable(before) || hasMarkdownTable(after), [before, after]);
  return (
    <div
      className={cn(
        "creed-diff-block creed-scrollbar max-h-[360px] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3",
        tableDiff
          ? "whitespace-normal text-[13px] leading-6"
          : structured
            ? "font-[var(--font-geist-mono)] text-[12px] leading-5"
            : "text-[13px] leading-6"
      )}
    >
      {tableDiff ? <TableAwareDiff before={before} after={after} /> : <DiffChunks parts={parts} />}
    </div>
  );
}

let proposalMermaidModule: Promise<typeof import("mermaid").default> | null = null;
function loadProposalMermaid() {
  if (!proposalMermaidModule) {
    proposalMermaidModule = import("mermaid").then((mod) => mod.default);
  }
  return proposalMermaidModule;
}

function isDarkTheme() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

let proposalMermaidRenderSeq = 0;

function RenderedMarkdownPreview({
  markdown,
  tone = "neutral",
  maxHeight = "max-h-[360px]",
}: {
  markdown: string;
  tone?: RichDiffTone;
  maxHeight?: string;
}) {
  const html = useMemo(() => markdownToRichHtml(markdown), [markdown]);
  const elementId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderMermaidBlocks() {
      const root = ref.current;
      if (!root) return;

      const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre[data-type="mermaid"]'));
      if (blocks.length === 0) return;

      const mermaid = await loadProposalMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: isDarkTheme() ? "dark" : "default",
        fontFamily: "inherit",
      });

      for (const [index, block] of blocks.entries()) {
        const source = block.getAttribute("data-source") ?? block.textContent?.trim() ?? "";
        block.setAttribute("data-source", source);
        block.classList.add("creed-proposal-mermaid");
        if (!source) continue;

        try {
          const token = (proposalMermaidRenderSeq += 1);
          const { svg } = await mermaid.render(`creed-proposal-mermaid-${elementId}-${index}-${token}`, source);
          if (cancelled) return;
          const preview = document.createElement("div");
          preview.className = "creed-proposal-mermaid-preview";
          preview.innerHTML = svg;
          block.replaceChildren(preview);
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Invalid diagram syntax";
          const fallback = document.createElement("div");
          fallback.className = "creed-proposal-mermaid-error";
          const title = document.createElement("p");
          title.textContent = "Diagram could not be rendered";
          const detail = document.createElement("pre");
          detail.textContent = message;
          fallback.append(title, detail);
          block.replaceChildren(fallback);
        }
      }
    }

    void renderMermaidBlocks();
    return () => {
      cancelled = true;
    };
  }, [elementId, html]);

  if (!markdown.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--creed-border)] px-3.5 py-3 text-[13px] text-[var(--creed-text-tertiary)]">
        No content
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "creed-rendered-markdown creed-scrollbar overflow-y-auto rounded-lg border px-3.5 py-3 text-[13px] leading-6",
        maxHeight,
        tone === "added"
          ? "creed-rendered-markdown-added"
          : tone === "removed"
            ? "creed-rendered-markdown-removed"
            : "border-[var(--creed-border)] bg-[var(--creed-surface)]"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function RenderedProposalBody({
  before,
  after,
  status,
}: {
  before: string;
  after: string;
  status: SectionStatus;
}) {
  if (status === "added") {
    return (
      <div className="px-3 py-3">
        <RenderedMarkdownPreview markdown={after} tone="added" />
      </div>
    );
  }

  if (status === "removed") {
    return (
      <div className="px-3 py-3">
        <RenderedMarkdownPreview markdown={before} tone="removed" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <DiffText before={before} after={after} />
    </div>
  );
}

const STATUS_DOT: Record<SectionChangeStatus, string> = {
  added: "bg-[var(--creed-success)]",
  removed: "bg-[var(--creed-danger)]",
  modified: "bg-[var(--creed-accent)]",
  unchanged: "bg-[var(--creed-text-tertiary)]",
};

// One section row within a whole-document (version-history) grouped diff.
function SectionChangeRow({
  change,
  open,
  onToggle,
}: {
  change: SectionChange;
  open: boolean;
  onToggle: () => void;
}) {
  const parts = useMemo(() => mdDiffParts(change.before, change.after), [change.before, change.after]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const label = sectionChangeLabel(change);

  return (
    <div className="rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[change.status])} />
        <span className="truncate text-[13px] text-[var(--creed-text-primary)]">{label}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
          <DiffBadge tone="added" count={stats.added} />
          <DiffBadge tone="removed" count={stats.removed} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="creed-diff-block creed-scrollbar max-h-[240px] overflow-y-auto px-3.5 py-2.5 text-[13px] leading-6">
              <DiffChunks parts={parts} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Groups a whole-content diff by Markdown headings for larger version-history
// entries.
function SectionGroupedDiff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffMarkdownSections(before, after), [before, after]);
  const changed = useMemo(() => changes.filter((change) => change.status !== "unchanged"), [changes]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenKey(changed.length === 1 ? changed[0].key : null);
  }, [changed]);

  if (changed.length === 0) {
    return <DiffText before={before} after={after} />;
  }

  if (changed.length === 1) {
    return <DiffText before={changed[0].before} after={changed[0].after} />;
  }

  return (
    <div className="space-y-1.5">
      {changed.map((change) => (
        <SectionChangeRow
          key={change.key}
          change={change}
          open={openKey === change.key}
          onToggle={() => setOpenKey((current) => (current === change.key ? null : change.key))}
        />
      ))}
    </div>
  );
}

function versionImpactLabel(before: string, after: string) {
  const changed = diffMarkdownSections(before, after).filter((change) => change.status !== "unchanged");
  if (changed.length === 0) return "No visible change";
  if (changed.length === 1) return "1 change";
  return `${changed.length} changes`;
}

function versionHunkImpactLabel(hunks: VersionChangeHunk[]) {
  if (hunks.length === 0) return "No visible change";
  if (hunks.length === 1) return hunks[0]?.classification || "1 change";
  return `${hunks.length} changes`;
}

function summarizeVersionHunks(hunks: VersionChangeHunk[]) {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    const stats = summarizeDiff(mdDiffParts(hunk.before, hunk.after));
    added += stats.added;
    removed += stats.removed;
  }
  return { added, removed };
}

function VersionHunkDiffList({ hunks }: { hunks: VersionChangeHunk[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenKey(hunks.length === 1 ? hunks[0]?.key ?? null : null);
  }, [hunks]);

  if (hunks.length === 0) {
    return (
      <div className="rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-3 py-2 text-[13px] text-[var(--creed-text-secondary)]">
        No visible change
      </div>
    );
  }

  if (hunks.length === 1) {
    const hunk = hunks[0];
    return hunk ? (
      <RenderedProposalBody before={hunk.before} after={hunk.after} status={hunk.status} />
    ) : null;
  }

  return (
    <div className="space-y-1.5">
      {hunks.map((hunk, index) => {
        const key = hunk.key || `version-hunk-${index}`;
        const open = openKey === key;
        const stats = summarizeDiff(mdDiffParts(hunk.before, hunk.after));
        return (
          <div
            key={key}
            className="overflow-hidden rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)]"
          >
            <button
              type="button"
              onClick={() => setOpenKey((current) => (current === key ? null : key))}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--creed-surface-raised)]"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
                {hunk.classification || `Change ${index + 1}`}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <DiffBadge tone="added" count={stats.added} size="md" />
                <DiffBadge tone="removed" count={stats.removed} size="md" />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-[var(--creed-border)] px-3 py-3">
                    <RenderedProposalBody
                      before={hunk.before}
                      after={hunk.after}
                      status={hunk.status}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function DocumentReviewPanel({
  documentId,
  revision,
  users,
  refreshSignal,
  onDocumentUpdated,
  focusVersionId,
  onFocusVersionHandled,
  onHeightChange,
  diffOpen = false,
  onDiffOpenChange,
  onPendingProposalsChange,
}: {
  documentId: string;
  revision: number;
  users: WorkspaceUser[];
  refreshSignal?: number;
  onDocumentUpdated: (document: SharedDocument) => void;
  focusVersionId?: string | null;
  onFocusVersionHandled?: () => void;
  onHeightChange?: (height: number) => void;
  diffOpen?: boolean;
  onDiffOpenChange?: (open: boolean) => void;
  onPendingProposalsChange?: (proposals: DocumentProposal[]) => void;
}) {
  const [proposals, setProposals] = useState<DocumentProposal[]>([]);
  const [acceptedProposals, setAcceptedProposals] = useState<DocumentProposal[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [versionContents, setVersionContents] = useState<Record<string, string>>({});
  const [loadingVersion, setLoadingVersion] = useState<string | null>(null);
  const [versionContentErrors, setVersionContentErrors] = useState<Record<string, string>>({});
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [revertingVersion, setRevertingVersion] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onHeightChange) return;
    const node = rootRef.current;
    if (!node) {
      onHeightChange(0);
      return;
    }

    const notify = () => {
      onHeightChange(Math.ceil(node.getBoundingClientRect().height));
    };

    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(node);

    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [onHeightChange]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  useEffect(() => {
    onPendingProposalsChange?.(proposals);
    if (proposals.length === 0 && diffOpen) {
      onDiffOpenChange?.(false);
    }
  }, [diffOpen, onDiffOpenChange, onPendingProposalsChange, proposals]);

  const resolvePerson = useCallback(
    (authorUserId: string | null, agentLabel: string | null): Person => {
      if (authorUserId) {
        const user = usersById.get(authorUserId);
        if (user) return { label: user.label, avatarUrl: user.avatarUrl };
      }
      if (agentLabel) return { label: agentLabel, avatarUrl: null };
      return { label: "Someone", avatarUrl: null };
    },
    [usersById]
  );

  const refreshProposals = useCallback(async () => {
    try {
      const proposalsRes = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}/proposals`, {
        cache: "no-store",
      });
      if (proposalsRes.ok) {
        const payload = (await proposalsRes.json()) as { proposals?: DocumentProposal[] };
        setProposals(payload.proposals ?? []);
      }
    } catch {
      // Non-fatal: leave the last known list in place.
    }
  }, [documentId]);

  const refreshAcceptedProposals = useCallback(async () => {
    try {
      const proposalsRes = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/proposals?status=accepted`,
        { cache: "no-store" }
      );
      if (proposalsRes.ok) {
        const payload = (await proposalsRes.json()) as { proposals?: DocumentProposal[] };
        setAcceptedProposals(payload.proposals ?? []);
      }
    } catch {
      // Non-fatal: leave the last known list in place.
    }
  }, [documentId]);

  const refreshVersions = useCallback(async () => {
    try {
      const versionsRes = await fetch(`/api/app/documents/${encodeURIComponent(documentId)}/versions`, {
        cache: "no-store",
      });
      if (versionsRes.ok) {
        const payload = (await versionsRes.json()) as { versions?: DocumentVersion[] };
        setVersions(payload.versions ?? []);
      }
    } catch {
      // Non-fatal: leave the last known list in place.
    }
  }, [documentId]);

  useEffect(() => {
    void refreshProposals();
    void refreshAcceptedProposals();
    void refreshVersions();
  }, [refreshAcceptedProposals, refreshProposals, refreshVersions, revision, refreshSignal]);

  useEffect(() => {
    let interval: number | null = null;
    function start() {
      stop();
      interval = window.setInterval(() => void refreshProposals(), 5_000);
    }
    function stop() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }
    function onFocus() {
      void refreshProposals();
      void refreshAcceptedProposals();
      void refreshVersions();
      start();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refreshProposals();
        void refreshAcceptedProposals();
        void refreshVersions();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAcceptedProposals, refreshProposals, refreshVersions]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`document-proposals-${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creed_document_proposals",
          filter: `document_id=eq.${documentId}`,
        },
        () => {
          void refreshProposals();
          void refreshAcceptedProposals();
          void refreshVersions();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [documentId, refreshAcceptedProposals, refreshProposals, refreshVersions]);

  const loadVersionContent = useCallback(
    async (versionId: string) => {
      if (Object.prototype.hasOwnProperty.call(versionContents, versionId)) return;
      setLoadingVersion(versionId);
      setVersionContentErrors((current) => {
        const next = { ...current };
        delete next[versionId];
        return next;
      });
      try {
        const response = await fetch(
          `/api/app/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as { version?: DocumentVersion; error?: string };
        if (!response.ok || !payload.version) {
          throw new Error(payload.error || "Could not load this version.");
        }
        setVersionContents((current) => ({
          ...current,
          [versionId]: payload.version?.content ?? "",
        }));
      } catch (error) {
        setVersionContentErrors((current) => ({
          ...current,
          [versionId]: error instanceof Error ? error.message : "Could not load this version.",
        }));
      } finally {
        setLoadingVersion((current) => (current === versionId ? null : current));
      }
    },
    [documentId, versionContents]
  );

  const loadVersionPair = useCallback(
    async (versionId: string) => {
      const index = versions.findIndex((version) => version.id === versionId);
      if (index === -1) return;
      const previousId = versions[index + 1]?.id;
      await Promise.all([
        loadVersionContent(versionId),
        previousId ? loadVersionContent(previousId) : Promise.resolve(),
      ]);
    },
    [loadVersionContent, versions]
  );

  const toggleVersion = useCallback(
    (versionId: string) => {
      setExpandedVersion((current) => {
        const next = current === versionId ? null : versionId;
        const target = next ? versions.find((version) => version.id === next) : null;
        if (next && !target?.changeHunks?.length) void loadVersionPair(next);
        return next;
      });
    },
    [loadVersionPair, versions]
  );

  // When an activity item asks to focus a version, open history, expand that
  // version's diff, load the body pair, and scroll it into view.
  useEffect(() => {
    if (!focusVersionId) return;
    const target = versions.find((version) => version.id === focusVersionId);
    if (!target) return;
    setHistoryOpen(true);
    setExpandedVersion(focusVersionId);
    if (!target.changeHunks?.length) void loadVersionPair(focusVersionId);
    const timer = window.setTimeout(() => {
      const selector = `[data-version-row="${(window.CSS?.escape ?? ((v: string) => v))(focusVersionId)}"]`;
      rootRef.current?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusVersionHandled?.();
    }, 340);
    return () => window.clearTimeout(timer);
  }, [focusVersionId, loadVersionPair, versions, onFocusVersionHandled]);

  const resolveProposal = useCallback(
    async (id: string, action: "accept" | "reject") => {
      setBusyProposal(id);
      try {
        const init: RequestInit = { method: "POST" };
        const response = await fetch(
          `/api/app/documents/${encodeURIComponent(documentId)}/proposals/${encodeURIComponent(id)}/${action}`,
          init
        );
        const payload = (await response.json()) as EditOutcomeResponse;
        if (!response.ok) {
          throw new Error(payload.error || `Could not ${action} the proposal.`);
        }
        if (action === "accept" && payload.document) {
          onDocumentUpdated(payload.document);
        }
        toast.success(action === "accept" ? "Proposal accepted" : "Proposal rejected");
        await Promise.all([refreshProposals(), refreshAcceptedProposals(), refreshVersions()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
      } finally {
        setBusyProposal(null);
      }
    },
    [documentId, onDocumentUpdated, refreshAcceptedProposals, refreshProposals, refreshVersions]
  );

  async function revertTo(versionId: string) {
    setRevertingVersion(versionId);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/revert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: revision }),
        }
      );
      const payload = (await response.json()) as EditOutcomeResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not revert.");
      }
      if (payload.outcome === "applied" && payload.document) {
        onDocumentUpdated(payload.document);
        toast.success("Reverted to the selected version");
      } else {
        toast.success("Revert proposed for review");
      }
      await Promise.all([refreshProposals(), refreshAcceptedProposals(), refreshVersions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revert.");
    } finally {
      setRevertingVersion(null);
    }
  }

  const hasProposals = proposals.length > 0;

  if (!hasProposals && versions.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="mt-5 space-y-3">
      {hasProposals ? (
        <DocumentReviewPill
          proposals={proposals}
          diffOpen={diffOpen}
          busyProposal={busyProposal}
          onDiffOpenChange={onDiffOpenChange}
          onResolve={resolveProposal}
        />
      ) : null}

      {versions.length > 0 ? (
        <DocumentVersionHistoryPill
          versions={versions}
          acceptedProposals={acceptedProposals}
          historyOpen={historyOpen}
          expandedVersion={expandedVersion}
          versionContents={versionContents}
          loadingVersion={loadingVersion}
          versionContentErrors={versionContentErrors}
          revertingVersion={revertingVersion}
          resolvePerson={resolvePerson}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onToggleVersion={toggleVersion}
          onRevert={(versionId) => void revertTo(versionId)}
        />
      ) : null}
    </div>
  );
}

type ProposalHistoryFamily = {
  id: string;
  proposals: DocumentProposal[];
  versions: DocumentVersion[];
  latestVersion: DocumentVersion;
};

type VersionHistoryItem =
  | { type: "family"; family: ProposalHistoryFamily }
  | { type: "version"; version: DocumentVersion; versionIndex: number };

function buildVersionHistoryItems(
  versions: DocumentVersion[],
  acceptedProposals: DocumentProposal[]
): VersionHistoryItem[] {
  const acceptedById = new Map(acceptedProposals.map((proposal) => [proposal.id, proposal]));
  const familyMap = new Map<string, ProposalHistoryFamily>();

  for (const version of versions) {
    if (!version.sourceProposalId) continue;
    const proposal = acceptedById.get(version.sourceProposalId);
    if (!proposal) continue;

    const family =
      familyMap.get(proposal.familyId) ??
      ({
        id: proposal.familyId,
        proposals: [],
        versions: [],
        latestVersion: version,
      } satisfies ProposalHistoryFamily);
    family.proposals.push(proposal);
    family.versions.push(version);
    if (version.revision > family.latestVersion.revision) {
      family.latestVersion = version;
    }
    familyMap.set(proposal.familyId, family);
  }

  for (const family of familyMap.values()) {
    family.proposals.sort((a, b) => a.hunkIndex - b.hunkIndex || a.id.localeCompare(b.id));
    family.versions.sort((a, b) => b.revision - a.revision);
  }

  const emittedFamilies = new Set<string>();
  const items: VersionHistoryItem[] = [];
  versions.forEach((version, versionIndex) => {
    const proposal = version.sourceProposalId ? acceptedById.get(version.sourceProposalId) : null;
    if (!proposal) {
      items.push({ type: "version", version, versionIndex });
      return;
    }
    if (emittedFamilies.has(proposal.familyId)) return;
    const family = familyMap.get(proposal.familyId);
    if (!family) return;
    emittedFamilies.add(proposal.familyId);
    items.push({ type: "family", family });
  });

  return items;
}

function DocumentVersionHistoryPill({
  versions,
  acceptedProposals,
  historyOpen,
  expandedVersion,
  versionContents,
  loadingVersion,
  versionContentErrors,
  revertingVersion,
  resolvePerson,
  onToggleHistory,
  onToggleVersion,
  onRevert,
}: {
  versions: DocumentVersion[];
  acceptedProposals: DocumentProposal[];
  historyOpen: boolean;
  expandedVersion: string | null;
  versionContents: Record<string, string>;
  loadingVersion: string | null;
  versionContentErrors: Record<string, string>;
  revertingVersion: string | null;
  resolvePerson: (authorUserId: string | null, agentLabel: string | null) => Person;
  onToggleHistory: () => void;
  onToggleVersion: (versionId: string) => void;
  onRevert: (versionId: string) => void;
}) {
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const historyItems = useMemo(
    () => buildVersionHistoryItems(versions, acceptedProposals),
    [acceptedProposals, versions]
  );

  function toggleFamily(familyId: string) {
    setOpenFamilyId((current) => {
      const next = current === familyId ? null : familyId;
      if (next !== familyId) setActiveProposalId(null);
      return next;
    });
  }

  function toggleHistoryProposal(proposalId: string) {
    setActiveProposalId((current) => (current === proposalId ? null : proposalId));
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <button
          type="button"
          onClick={onToggleHistory}
          aria-expanded={historyOpen}
          className="group/trigger inline-flex h-7 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-[var(--creed-text-secondary)] outline-none transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
        >
          <History
            className={cn(
              "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-colors duration-200 group-hover/trigger:text-[var(--creed-text-primary)]",
              historyOpen ? "text-[var(--creed-text-primary)]" : ""
            )}
          />
          <span className="hidden sm:inline">Version history</span>
          <span className="sm:hidden">History</span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span>
            <span className="sm:hidden">{versions.length}</span>
            <span className="hidden sm:inline">
              {versions.length === 1 ? "1 version" : `${versions.length} versions`}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/trigger:text-[var(--creed-text-primary)]",
              historyOpen ? "rotate-0 text-[var(--creed-text-primary)]" : "-rotate-90"
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {historyOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="creed-scrollbar max-h-[60vh] divide-y divide-[var(--creed-border)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
              {historyItems.map((item) => {
                if (item.type === "family") {
                  return (
                    <ProposalFamilyRow
                      key={item.family.id}
                      family={item.family}
                      person={resolvePerson(
                        item.family.latestVersion.authorUserId,
                        item.family.latestVersion.authorAgentLabel
                      )}
                      open={openFamilyId === item.family.id}
                      activeProposalId={activeProposalId}
                      isCurrent={versions[0]?.id === item.family.latestVersion.id}
                      reverting={revertingVersion === item.family.latestVersion.id}
                      onToggle={() => toggleFamily(item.family.id)}
                      onToggleProposal={toggleHistoryProposal}
                      onRevert={() => onRevert(item.family.latestVersion.id)}
                    />
                  );
                }

                const previousVersion = versions[item.versionIndex + 1];
                return (
                  <VersionRow
                    key={item.version.id}
                    version={item.version}
                    content={versionContents[item.version.id]}
                    previousContent={previousVersion ? versionContents[previousVersion.id] : ""}
                    hasPreviousVersion={Boolean(previousVersion)}
                    loadError={
                      versionContentErrors[item.version.id] ||
                      (previousVersion ? versionContentErrors[previousVersion.id] : undefined)
                    }
                    person={resolvePerson(item.version.authorUserId, item.version.authorAgentLabel)}
                    isCurrent={item.versionIndex === 0}
                    expanded={expandedVersion === item.version.id}
                    loading={
                      loadingVersion === item.version.id ||
                      (previousVersion ? loadingVersion === previousVersion.id : false)
                    }
                    reverting={revertingVersion === item.version.id}
                    onToggle={() => onToggleVersion(item.version.id)}
                    onRevert={() => onRevert(item.version.id)}
                  />
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// The compact review summary: one rounded pill showing total +/- and proposal
// count. Show/Hide diff toggles the document body's in-place diff mode.
function DocumentReviewPill({
  proposals,
  diffOpen,
  busyProposal,
  onDiffOpenChange,
  onResolve,
}: {
  proposals: DocumentProposal[];
  diffOpen: boolean;
  busyProposal: string | null;
  onDiffOpenChange?: (open: boolean) => void;
  onResolve: (id: string, action: "accept" | "reject") => Promise<void>;
}) {
  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const proposal of proposals) {
      const stats = summarizeDiff(mdDiffParts(proposal.hunkBefore, proposal.hunkAfter));
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }, [proposals]);

  const anyBusy = proposals.some((proposal) => busyProposal === proposal.id);

  async function resolveAll(action: "accept" | "reject") {
    // Sequentially, so each hunk applies against the revision the previous
    // acceptance produced.
    for (const proposal of proposals) {
      await onResolve(proposal.id, action);
    }
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <div className="inline-flex h-7 items-center gap-2 px-2.5 text-sm font-medium text-[var(--creed-text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={totals.added} size="md" />
            <DiffBadge tone="removed" count={totals.removed} size="md" />
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span>{proposals.length === 1 ? "1 proposal" : `${proposals.length} proposals`}</span>
        </div>
        <SimpleTooltip label={diffOpen ? "Hide diff" : "Show diff"}>
          <button
            type="button"
            onClick={() => onDiffOpenChange?.(!diffOpen)}
            aria-label={diffOpen ? "Hide diff" : "Show diff"}
            aria-expanded={diffOpen}
            aria-pressed={diffOpen}
            disabled={!onDiffOpenChange}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50",
              diffOpen
                ? "bg-[#dbeafe] text-[#2563eb] hover:bg-[#bfdbfe] dark:bg-[#1e3a8a]/45 dark:text-[#93c5fd] dark:hover:bg-[#1e40af]/55"
                : "text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
            )}
          >
            <GitDiff className="h-3.5 w-3.5" />
          </button>
        </SimpleTooltip>
        <button
          type="button"
          onClick={() => void resolveAll("reject")}
          disabled={anyBusy}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reject all</span>
        </button>
        <button
          type="button"
          onClick={() => void resolveAll("accept")}
          disabled={anyBusy}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2563eb] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Accept all</span>
        </button>
      </div>

    </div>
  );
}

function proposalHistoryLabel(proposal: DocumentProposal) {
  return proposal.classification || `Proposal ${proposal.hunkIndex + 1}`;
}

function ProposalFamilyRow({
  family,
  person,
  open,
  activeProposalId,
  isCurrent,
  reverting,
  onToggle,
  onToggleProposal,
  onRevert,
}: {
  family: ProposalHistoryFamily;
  person: Person;
  open: boolean;
  activeProposalId: string | null;
  isCurrent: boolean;
  reverting: boolean;
  onToggle: () => void;
  onToggleProposal: (proposalId: string) => void;
  onRevert: () => void;
}) {
  const activeProposal =
    open && activeProposalId ? family.proposals.find((proposal) => proposal.id === activeProposalId) : null;
  const proposalsToShow = activeProposal ? [activeProposal] : family.proposals;
  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const proposal of family.proposals) {
      const stats = summarizeDiff(mdDiffParts(proposal.hunkBefore, proposal.hunkAfter));
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }, [family.proposals]);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <PersonBadge person={person} />
          <span className="shrink-0 text-[13px] text-[var(--creed-text-primary)]">made changes</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
            {family.proposals.length === 1 ? "1 proposal" : `${family.proposals.length} proposals`}
          </span>
          <span className="hidden shrink-0 text-[var(--creed-text-tertiary)] sm:inline">
            · {relativeTime(family.latestVersion.createdAt)}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <DiffBadge tone="added" count={totals.added} size="md" />
            <DiffBadge tone="removed" count={totals.removed} size="md" />
          </span>
        </button>
        {isCurrent ? (
          <span className="shrink-0 rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--creed-text-secondary)]">
            Current
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            disabled={reverting}
            onClick={onRevert}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="divide-y divide-[var(--creed-border)]">
              {proposalsToShow.map((proposal) => {
                const selected = activeProposalId === proposal.id;
                const stats = summarizeDiff(mdDiffParts(proposal.hunkBefore, proposal.hunkAfter));
                return (
                  <div key={proposal.id}>
                    <button
                      type="button"
                      onClick={() => onToggleProposal(proposal.id)}
                      aria-expanded={selected}
                      className="flex w-full items-center gap-2 px-6 py-2 text-left text-sm transition-colors hover:bg-[var(--creed-surface-raised)]"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
                          selected ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
                        {proposalHistoryLabel(proposal)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5">
                        <DiffBadge tone="added" count={stats.added} size="md" />
                        <DiffBadge tone="removed" count={stats.removed} size="md" />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {selected ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-3">
                            <RenderedProposalBody
                              before={proposal.hunkBefore}
                              after={proposal.hunkAfter}
                              status={proposal.hunkStatus}
                            />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function VersionRow({
  version,
  content,
  previousContent,
  hasPreviousVersion,
  loadError,
  person,
  isCurrent,
  expanded,
  loading,
  reverting,
  onToggle,
  onRevert,
}: {
  version: DocumentVersion;
  content?: string;
  previousContent?: string;
  hasPreviousVersion: boolean;
  loadError?: string;
  person: Person;
  isCurrent: boolean;
  expanded: boolean;
  loading: boolean;
  reverting: boolean;
  onToggle: () => void;
  onRevert: () => void;
}) {
  const storedHunks = useMemo(() => version.changeHunks ?? [], [version.changeHunks]);
  const hasStoredHunks = storedHunks.length > 0;
  const hasContent = typeof content === "string" && (!hasPreviousVersion || typeof previousContent === "string");
  const before = previousContent ?? "";
  const after = content ?? "";
  const parts = useMemo(
    () => (!hasStoredHunks && hasContent ? mdDiffParts(before, after) : []),
    [after, before, hasContent, hasStoredHunks]
  );
  const stats = useMemo(
    () => (hasStoredHunks ? summarizeVersionHunks(storedHunks) : summarizeDiff(parts)),
    [hasStoredHunks, parts, storedHunks]
  );
  const impactLabel = useMemo(
    () =>
      hasStoredHunks
        ? versionHunkImpactLabel(storedHunks)
        : hasContent
          ? versionImpactLabel(before, after)
          : `Revision ${version.revision}`,
    [after, before, hasContent, hasStoredHunks, storedHunks, version.revision]
  );

  return (
    <div data-version-row={version.id}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
          <PersonBadge person={person} />
          <span className="max-w-[12rem] shrink-0 truncate text-[13px] text-[var(--creed-text-primary)]">
            {impactLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
            {version.summary || `Revision ${version.revision}`}
          </span>
          <span className="hidden shrink-0 text-[var(--creed-text-tertiary)] sm:inline">
            · {relativeTime(version.createdAt)}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            {hasStoredHunks || hasContent ? (
              <>
                <DiffBadge tone="added" count={stats.added} size="md" />
                <DiffBadge tone="removed" count={stats.removed} size="md" />
              </>
            ) : null}
          </span>
        </button>
        {isCurrent ? (
          <span className="shrink-0 rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--creed-text-secondary)]">
            Current
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            disabled={reverting}
            onClick={onRevert}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="px-3 py-3">
              {loadError ? (
                <div className="rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-3 py-2 text-[13px] text-[#b91c1c] dark:text-[#f87171]">
                  {loadError}
                </div>
              ) : hasStoredHunks ? (
                <VersionHunkDiffList hunks={storedHunks} />
              ) : hasContent ? (
                <SectionGroupedDiff before={before} after={after} />
              ) : (
                <div className="inline-flex items-center gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-3 py-2 text-[13px] text-[var(--creed-text-secondary)]">
                  <LoaderCircle className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Loading version
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
