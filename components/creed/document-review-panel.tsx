"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { diffWords } from "diff";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, History, LoaderCircle, MessageSquare, RotateCcw, Send, X } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DiffBadge, summarizeDiff } from "@/components/creed/inline-proposal-diff";
import {
  diffMarkdownSections,
  sectionChangeLabel,
  type SectionChange,
  type SectionChangeStatus,
} from "@/lib/document-section-diff";
import type { WorkspaceUser } from "@/lib/document-collaboration";
import type { DocumentComment } from "@/lib/document-collaboration";
import type { SharedDocument } from "@/lib/shared-documents";
import { markdownToRichHtml } from "@/lib/rich-text";
import { MentionTextarea } from "@/components/creed/mention-textarea";
import { cn } from "@/lib/utils";

// Supabase-only review surface for a shared document. Mirrors the personal-file
// ReviewPill: a compact summary pill (total +/- and "N proposals") that reveals
// the per-section proposals, each showing its own diff and accept/reject.
// Proposal bodies render through the same Markdown-to-rich-HTML path as the
// editor so tables and diagrams stay legible. Every proposal/version is
// attributed to the person behind it (avatar + name), not the model/MCP label.
// The append-only version history sits below with the same section grouping.

type ActorType = "human" | "agent";

type SectionStatus = "added" | "removed" | "modified" | "unchanged";

export type DocumentProposal = {
  id: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  kind: "document-content" | "document-section";
  content: string;
  summary: string;
  baseRevision: number;
  status: string;
  createdAt: string;
  batchId: string | null;
  sectionKey: string | null;
  sectionHeading: string | null;
  sectionLevel: number | null;
  sectionStatus: SectionStatus | null;
  sectionBefore: string | null;
  sectionAfter: string | null;
  sectionProposedIndex: number | null;
  sectionPreviousKey: string | null;
  sectionNextKey: string | null;
};

type ProposalComment = {
  id: string;
  body: string;
  status: "open" | "resolved";
  createdBy: string | null;
  authorLabel: string;
  createdAt: string;
};

type DocumentVersion = {
  id: string;
  revision: number;
  content: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
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

type ResolveProposalOptions = {
  allowStaleSectionUpdate?: boolean;
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

function formatMarkdownTableForDiff(rows: string[]) {
  const parsed = rows.map(splitTableCells);
  const colCount = Math.max(...parsed.map((row) => row.length), 0);
  const widths = Array.from({ length: colCount }, (_unused, index) =>
    Math.max(...parsed.map((row) => row[index]?.length ?? 0), 3)
  );
  return parsed
    .map((row, rowIndex) => {
      if (rowIndex === 1) {
        return `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
      }
      return `| ${widths.map((width, index) => (row[index] ?? "").padEnd(width)).join(" | ")} |`;
    })
    .join("\n");
}

function formatTablesForDiff(md: string) {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let index = 0;
  let inCodeBlock = false;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      index += 1;
      continue;
    }

    if (!inCodeBlock && trimmed.includes("|") && isTableDelimiterRow(lines[index + 1])) {
      const tableRows = [line, lines[index + 1] ?? ""];
      index += 2;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const nextTrimmed = next.trim();
        if (!nextTrimmed || !nextTrimmed.includes("|") || nextTrimmed.startsWith("```")) break;
        tableRows.push(next);
        index += 1;
      }
      out.push(formatMarkdownTableForDiff(tableRows));
      continue;
    }

    out.push(line);
    index += 1;
  }

  return out.join("\n");
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
  return formatTablesForDiff(md)
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/^```mermaid\s*$/gm, "Diagram:")
    .replace(/```[^\n]*\n?/g, "") // fenced code delimiters
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, "") // horizontal rules
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "") // list markers
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)([^*_]+?)\1/g, "$2") // italic
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

// Groups a whole-content diff by the document's Markdown sections (used by
// version history, where a version can span many sections).
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
  if (changed.length === 0) return "No section change";
  if (changed.length === 1) return sectionChangeLabel(changed[0]);
  return `${changed.length} sections`;
}

// The before/after a proposal represents: a section proposal carries its own
// before/after; a legacy whole-content proposal diffs against the live document.
function proposalDiffPair(proposal: DocumentProposal, currentContent: string) {
  if (proposal.kind === "document-section") {
    return { before: proposal.sectionBefore ?? "", after: proposal.sectionAfter ?? "" };
  }
  return { before: currentContent, after: proposal.content };
}

function sectionRowLabel(proposal: DocumentProposal) {
  if (proposal.kind !== "document-section") return "Whole document";
  if ((proposal.sectionLevel ?? 0) === 0 || !proposal.sectionHeading) return "Intro";
  return proposal.sectionHeading;
}

// Person attribution helper for callers outside this module (the document
// editor renders inline proposal cards and needs the same person-first
// resolution the panel uses).
export function resolveProposalPerson(
  users: WorkspaceUser[],
  authorUserId: string | null,
  agentLabel: string | null
): Person {
  if (authorUserId) {
    const user = users.find((candidate) => candidate.id === authorUserId);
    if (user) return { label: user.label, avatarUrl: user.avatarUrl };
  }
  if (agentLabel) return { label: agentLabel, avatarUrl: null };
  return { label: "Someone", avatarUrl: null };
}

// The inline proposal card rendered in the document body at the bottom of the
// section it targets (mirrors the personal file's InlineProposalDiff, but for a
// dynamic document section: person attribution + Markdown-aware rendered diff).
export function InlineDocumentProposal({
  proposal,
  person,
  busy,
  documentId,
  users,
  onCommentPosted,
  onAccept,
  onReject,
}: {
  proposal: DocumentProposal;
  person: Person;
  busy?: boolean;
  documentId: string;
  users: WorkspaceUser[];
  onCommentPosted?: (comment: DocumentComment) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const before = proposal.sectionBefore ?? "";
  const after = proposal.sectionAfter ?? proposal.content;
  const parts = useMemo(() => mdDiffParts(before, after), [before, after]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const status = proposal.sectionStatus ?? "modified";
  const headline =
    status === "added"
      ? "proposed a new section"
      : status === "removed"
        ? "proposed to remove this section"
        : proposal.actorType === "agent"
          ? "proposed an edit"
          : "proposed an update";

  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
          <PersonBadge person={person} />
          <span className="text-[var(--creed-text-tertiary)]">{headline}</span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowComments((value) => !value)}
            aria-expanded={showComments}
            title="Comment on this proposal"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
              showComments ? "text-[var(--creed-text-primary)]" : ""
            )}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2563eb] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </button>
        </div>
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
            <RenderedProposalBody before={before} after={after} status={status} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showComments ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ProposalCommentThread documentId={documentId} proposalId={proposal.id} users={users} onPosted={onCommentPosted} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DocumentReviewPanel({
  documentId,
  revision,
  currentContent,
  users,
  refreshSignal,
  onDocumentUpdated,
  onProposalsChange,
  onCommentPosted,
  focusVersionId,
  onFocusVersionHandled,
  onHeightChange,
}: {
  documentId: string;
  revision: number;
  currentContent: string;
  users: WorkspaceUser[];
  refreshSignal?: number;
  onDocumentUpdated: (document: SharedDocument) => void;
  onProposalsChange?: (proposals: DocumentProposal[]) => void;
  onCommentPosted?: (comment: DocumentComment) => void;
  focusVersionId?: string | null;
  onFocusVersionHandled?: () => void;
  onHeightChange?: (height: number) => void;
}) {
  const [proposals, setProposals] = useState<DocumentProposal[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
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

  // When an activity item asks to focus a version, open history, expand that
  // version's diff, and scroll it into view. Waits for `versions` to load so a
  // just-clicked event resolves once the list is fetched.
  useEffect(() => {
    if (!focusVersionId) return;
    if (!versions.some((version) => version.id === focusVersionId)) return;
    setHistoryOpen(true);
    setExpandedVersion(focusVersionId);
    const timer = window.setTimeout(() => {
      const selector = `[data-version-row="${(window.CSS?.escape ?? ((v: string) => v))(focusVersionId)}"]`;
      rootRef.current?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusVersionHandled?.();
    }, 340);
    return () => window.clearTimeout(timer);
  }, [focusVersionId, versions, onFocusVersionHandled]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

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

  const refresh = useCallback(async () => {
    try {
      const [proposalsRes, versionsRes] = await Promise.all([
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/proposals`, { cache: "no-store" }),
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/versions`, { cache: "no-store" }),
      ]);
      if (proposalsRes.ok) {
        const payload = (await proposalsRes.json()) as { proposals?: DocumentProposal[] };
        setProposals(payload.proposals ?? []);
        onProposalsChange?.(payload.proposals ?? []);
      }
      if (versionsRes.ok) {
        const payload = (await versionsRes.json()) as { versions?: DocumentVersion[] };
        setVersions(payload.versions ?? []);
      }
    } catch {
      // Non-fatal: leave the last known lists in place.
    }
  }, [documentId, onProposalsChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, revision, refreshSignal]);

  useEffect(() => {
    let interval: number | null = null;
    function start() {
      stop();
      interval = window.setInterval(() => void refresh(), 30_000);
    }
    function stop() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }
    function onFocus() {
      void refresh();
      start();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
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
  }, [refresh]);

  const resolveProposal = useCallback(
    async (id: string, action: "accept" | "reject", options: ResolveProposalOptions = {}) => {
      setBusyProposal(id);
      try {
        const init: RequestInit = { method: "POST" };
        if (action === "accept" && options.allowStaleSectionUpdate) {
          init.headers = { "Content-Type": "application/json" };
          init.body = JSON.stringify({ allowStaleSectionUpdate: true });
        }
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
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
      } finally {
        setBusyProposal(null);
      }
    },
    [documentId, onDocumentUpdated, refresh]
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
      await refresh();
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
          currentContent={currentContent}
          documentId={documentId}
          users={users}
          resolvePerson={resolvePerson}
          busyProposal={busyProposal}
          onResolve={resolveProposal}
          onCommentPosted={onCommentPosted}
        />
      ) : null}

      {versions.length > 0 ? (
        <DocumentVersionHistoryPill
          versions={versions}
          historyOpen={historyOpen}
          expandedVersion={expandedVersion}
          revertingVersion={revertingVersion}
          resolvePerson={resolvePerson}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onToggleVersion={(versionId) =>
            setExpandedVersion((current) => (current === versionId ? null : versionId))
          }
          onRevert={(versionId) => void revertTo(versionId)}
        />
      ) : null}
    </div>
  );
}

function DocumentVersionHistoryPill({
  versions,
  historyOpen,
  expandedVersion,
  revertingVersion,
  resolvePerson,
  onToggleHistory,
  onToggleVersion,
  onRevert,
}: {
  versions: DocumentVersion[];
  historyOpen: boolean;
  expandedVersion: string | null;
  revertingVersion: string | null;
  resolvePerson: (authorUserId: string | null, agentLabel: string | null) => Person;
  onToggleHistory: () => void;
  onToggleVersion: (versionId: string) => void;
  onRevert: (versionId: string) => void;
}) {
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
              {versions.map((version, index) => (
                <VersionRow
                  key={version.id}
                  version={version}
                  previousContent={versions[index + 1]?.content ?? ""}
                  person={resolvePerson(version.authorUserId, version.authorAgentLabel)}
                  isCurrent={index === 0}
                  expanded={expandedVersion === version.id}
                  reverting={revertingVersion === version.id}
                  onToggle={() => onToggleVersion(version.id)}
                  onRevert={() => onRevert(version.id)}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// The compact review summary, modelled on the personal-file ReviewPill: a
// rounded pill showing total +/- and "N proposals" that toggles a list of the
// per-section proposals beneath it, plus Reject all / Accept all. Collapsed by
// default so the summary stays small instead of a large always-open box.
function DocumentReviewPill({
  proposals,
  currentContent,
  documentId,
  users,
  resolvePerson,
  busyProposal,
  onResolve,
  onCommentPosted,
}: {
  proposals: DocumentProposal[];
  currentContent: string;
  documentId: string;
  users: WorkspaceUser[];
  resolvePerson: (authorUserId: string | null, agentLabel: string | null) => Person;
  busyProposal: string | null;
  onResolve: (id: string, action: "accept" | "reject", options?: ResolveProposalOptions) => Promise<void>;
  onCommentPosted?: (comment: DocumentComment) => void;
}) {
  const [listOpen, setListOpen] = useState(false);

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const proposal of proposals) {
      const { before, after } = proposalDiffPair(proposal, currentContent);
      const stats = summarizeDiff(mdDiffParts(before, after));
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }, [proposals, currentContent]);

  const anyBusy = proposals.some((proposal) => busyProposal === proposal.id);

  async function resolveAll(action: "accept" | "reject") {
    // Sequentially, so each section applies against the revision the previous
    // acceptance produced (the per-section merge guard handles ordering).
    for (const proposal of proposals) {
      await onResolve(
        proposal.id,
        action,
        action === "accept" ? { allowStaleSectionUpdate: true } : undefined
      );
    }
  }

  // A single proposal needs no roll-up summary: skip the "N proposals" pill
  // (and its Reject all / Accept all) and surface the one proposal row on its
  // own, matching the personal file where one proposal goes straight to its
  // section card.
  if (proposals.length === 1) {
    const proposal = proposals[0];
    return (
      <div className="creed-scrollbar max-h-[60vh] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DocumentReviewPillItem
          proposal={proposal}
          currentContent={currentContent}
          documentId={documentId}
          users={users}
          person={resolvePerson(proposal.authorUserId, proposal.authorAgentLabel)}
          busy={busyProposal === proposal.id}
          onCommentPosted={onCommentPosted}
          onAccept={() => void onResolve(proposal.id, "accept")}
          onReject={() => void onResolve(proposal.id, "reject")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <button
          type="button"
          onClick={() => setListOpen((value) => !value)}
          aria-expanded={listOpen}
          className="group/trigger inline-flex h-7 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-[var(--creed-text-secondary)] outline-none transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
        >
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={totals.added} size="md" />
            <DiffBadge tone="removed" count={totals.removed} size="md" />
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span>{proposals.length === 1 ? "1 proposal" : `${proposals.length} proposals`}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-all duration-200 group-hover/trigger:text-[var(--creed-text-primary)]",
              listOpen ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
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

      <AnimatePresence initial={false}>
        {listOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="creed-scrollbar max-h-[56vh] divide-y divide-[var(--creed-border)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
              {proposals.map((proposal) => (
                <DocumentReviewPillItem
                  key={proposal.id}
                  proposal={proposal}
                  currentContent={currentContent}
                  documentId={documentId}
                  users={users}
                  person={resolvePerson(proposal.authorUserId, proposal.authorAgentLabel)}
                  busy={busyProposal === proposal.id}
                  onCommentPosted={onCommentPosted}
                  onAccept={() => void onResolve(proposal.id, "accept")}
                  onReject={() => void onResolve(proposal.id, "reject")}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// One proposal row inside the pill's reveal: person + section label + diff
// badges; expands to the rendered diff (bottom of the section) with Reject /
// Accept and a comment affordance.
function DocumentReviewPillItem({
  proposal,
  currentContent,
  documentId,
  users,
  person,
  busy,
  onCommentPosted,
  onAccept,
  onReject,
}: {
  proposal: DocumentProposal;
  currentContent: string;
  documentId: string;
  users: WorkspaceUser[];
  person: Person;
  busy: boolean;
  onCommentPosted?: (comment: DocumentComment) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const { before, after } = proposalDiffPair(proposal, currentContent);
  const parts = useMemo(() => mdDiffParts(before, after), [before, after]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const label = sectionRowLabel(proposal);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <PersonBadge person={person} />
          <span className="truncate text-[13px] text-[var(--creed-text-secondary)]">{label}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((value) => !value)}
          aria-expanded={showComments}
          title="Comment on this proposal"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
            showComments ? "text-[var(--creed-text-primary)]" : ""
          )}
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-md px-2 text-sm text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
          disabled={busy}
          onClick={onReject}
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 rounded-md bg-[#2563eb] px-2.5 text-sm text-white hover:bg-[#1d4ed8]"
          disabled={busy}
          onClick={onAccept}
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </Button>
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
            {proposal.kind === "document-section" ? (
              <RenderedProposalBody
                before={before}
                after={after}
                status={proposal.sectionStatus ?? "modified"}
              />
            ) : (
              <RenderedProposalBody before={before} after={after} status="modified" />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showComments ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ProposalCommentThread documentId={documentId} proposalId={proposal.id} users={users} onPosted={onCommentPosted} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// The comment thread anchored to a single proposal. Loaded lazily; open
// comments here are auto-resolved server-side when the proposal is accepted or
// rejected.
function ProposalCommentThread({
  documentId,
  proposalId,
  users,
  onPosted,
}: {
  documentId: string;
  proposalId: string;
  users: WorkspaceUser[];
  onPosted?: (comment: DocumentComment) => void;
}) {
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/comments?proposalId=${encodeURIComponent(proposalId)}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const payload = (await response.json()) as { comments?: ProposalComment[] };
        setComments(payload.comments ?? []);
      }
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
    }
  }, [documentId, proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const text = body.trim();
    if (!text || posting) return;
    // Derive @mentions from the body the same way the normal comment and reply
    // composers do, so the shared notification pipeline fires for proposal
    // comments too (a "@Display Name" in the text mentions that member).
    const mentionedUserIds = users
      .filter((user) => user.label && text.includes(`@${user.label}`))
      .map((user) => user.id);
    setPosting(true);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, proposalId, mentionedUserIds }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Could not add comment.");
      }
      const payload = (await response.json().catch(() => ({}))) as { comment?: DocumentComment };
      setBody("");
      await load();
      // Surface the new comment to the sidebar (reusing the same comment
      // placement as normal comments) without a full page reload.
      if (payload.comment) {
        onPosted?.(payload.comment);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--creed-border)] px-3 py-2.5">
      {loading ? (
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--creed-text-tertiary)]">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div className="text-[12px] text-[var(--creed-text-tertiary)]">
          No comments yet. Ask a question or leave a review note.
        </div>
      ) : (
        comments.map((comment) => {
          const author = comment.createdBy ? usersById.get(comment.createdBy) : undefined;
          const label = author?.label ?? comment.authorLabel;
          return (
            <div key={comment.id} className="flex gap-2">
              <Avatar size="sm" className="mt-0.5 h-5 w-5 shrink-0">
                {author?.avatarUrl ? <AvatarImage src={author.avatarUrl} alt={label} /> : null}
                <AvatarFallback className="text-[10px]">{initialsFor(label)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-[var(--creed-text-secondary)]">
                  <span className="font-medium text-[var(--creed-text-primary)]">{label}</span>
                  <span className="text-[var(--creed-text-tertiary)]">
                    {" · "}
                    {relativeTime(comment.createdAt)}
                    {comment.status === "resolved" ? " · resolved" : ""}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] text-[var(--creed-text-primary)]">
                  {comment.body}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div className="space-y-1.5 pt-1">
        <MentionTextarea
          value={body}
          onChange={setBody}
          users={users}
          placeholder="Comment on this proposal. Use @ to mention someone."
          onSubmit={() => void submit()}
          className="min-h-[52px] rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-2.5 py-1.5 text-[13px]"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1 rounded-md bg-[#2563eb] px-2.5 text-[12px] text-white hover:bg-[#1d4ed8]"
            disabled={posting || !body.trim()}
            onClick={() => void submit()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function VersionRow({
  version,
  previousContent,
  person,
  isCurrent,
  expanded,
  reverting,
  onToggle,
  onRevert,
}: {
  version: DocumentVersion;
  previousContent: string;
  person: Person;
  isCurrent: boolean;
  expanded: boolean;
  reverting: boolean;
  onToggle: () => void;
  onRevert: () => void;
}) {
  const parts = useMemo(
    () => mdDiffParts(previousContent, version.content),
    [previousContent, version.content]
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const impactLabel = useMemo(
    () => versionImpactLabel(previousContent, version.content),
    [previousContent, version.content]
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
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
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
              <SectionGroupedDiff before={previousContent} after={version.content} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
