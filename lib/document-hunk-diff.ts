import { diffWordsWithSpace } from "diff";
import { markdownToReviewText } from "@/lib/document-section-diff";

export type DocumentHunkStatus = "added" | "removed" | "modified";
export type DocumentHunkConflictStatus = "clean" | "conflict" | "resolved";

export type DocumentHunkChange = {
  key: string;
  index: number;
  status: DocumentHunkStatus;
  before: string;
  after: string;
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
  prefix: string;
  suffix: string;
  classification: string;
  conflictStatus: DocumentHunkConflictStatus;
};

type DiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
};

type PendingHunk = {
  before: string;
  after: string;
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
};

export type HunkApplyResult =
  | { ok: true; content: string }
  | { ok: false; code: "conflict"; error: string };

const CONTEXT_CHARS = 80;
const LABEL_CHARS = 44;

function truncateLabel(text: string) {
  if (text.length <= LABEL_CHARS) return text;
  return `${text.slice(0, LABEL_CHARS - 1).trimEnd()}...`;
}

function truncateHeadingForLabel(heading: string, suffix: string) {
  const cleanHeading = heading.replace(/\s+/g, " ").trim();
  const suffixText = ` ${suffix}`;
  const maxHeadingLength = Math.max(8, LABEL_CHARS - suffixText.length);
  if (cleanHeading.length <= maxHeadingLength) {
    return `${cleanHeading}${suffixText}`;
  }
  return `${cleanHeading.slice(0, maxHeadingLength - 1).trimEnd()}...${suffixText}`;
}

function nearestHeading(content: string, offset: number) {
  const before = content.slice(0, Math.max(0, offset));
  const lines = before.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(lines[index]?.trim() ?? "");
    if (!match) continue;
    const heading = markdownToReviewText(match[2] ?? "").replace(/\s+/g, " ").trim();
    if (heading) return heading;
  }
  return null;
}

function labelSuffix(status: DocumentHunkStatus) {
  if (status === "added") return "add";
  if (status === "removed") return "remove";
  return "update";
}

function classifyHunk(
  hunk: Pick<DocumentHunkChange, "status" | "before" | "after">,
  headingContext: string | null
) {
  if (headingContext) {
    return truncateLabel(truncateHeadingForLabel(headingContext, labelSuffix(hunk.status)));
  }

  if (hunk.status === "added") {
    return "Document add";
  }
  if (hunk.status === "removed") {
    return "Document remove";
  }
  return "Document update";
}

function hunkStatus(before: string, after: string): DocumentHunkStatus {
  if (before.length === 0) return "added";
  if (after.length === 0) return "removed";
  return "modified";
}

export function hunkChangeHasReviewableDiff(
  change: Pick<DocumentHunkChange, "status" | "before" | "after">
) {
  if (change.status === "added") {
    return markdownToReviewText(change.after).length > 0;
  }
  if (change.status === "removed") {
    return markdownToReviewText(change.before).length > 0;
  }
  return markdownToReviewText(change.before) !== markdownToReviewText(change.after);
}

function makeHunk(
  beforeContent: string,
  afterContent: string,
  pending: PendingHunk,
  index: number
): DocumentHunkChange {
  const status = hunkStatus(pending.before, pending.after);
  const key = `hunk:${index}:${pending.beforeStart}:${pending.beforeEnd}:${pending.afterStart}:${pending.afterEnd}`;
  const headingContext =
    status === "added"
      ? nearestHeading(afterContent, pending.afterStart)
      : nearestHeading(beforeContent, pending.beforeStart) ??
        nearestHeading(afterContent, pending.afterStart);
  const hunk: DocumentHunkChange = {
    key,
    index,
    status,
    before: pending.before,
    after: pending.after,
    beforeStart: pending.beforeStart,
    beforeEnd: pending.beforeEnd,
    afterStart: pending.afterStart,
    afterEnd: pending.afterEnd,
    prefix: beforeContent.slice(Math.max(0, pending.beforeStart - CONTEXT_CHARS), pending.beforeStart),
    suffix: beforeContent.slice(pending.beforeEnd, pending.beforeEnd + CONTEXT_CHARS),
    classification: "",
    conflictStatus: "clean",
  };
  return { ...hunk, classification: classifyHunk(hunk, headingContext) };
}

export function diffDocumentHunks(beforeContent: string, afterContent: string): DocumentHunkChange[] {
  const parts = diffWordsWithSpace(beforeContent, afterContent) as DiffPart[];
  const hunks: DocumentHunkChange[] = [];

  let beforeOffset = 0;
  let afterOffset = 0;
  let pending: PendingHunk | null = null;

  const ensurePending = () => {
    pending ??= {
      before: "",
      after: "",
      beforeStart: beforeOffset,
      beforeEnd: beforeOffset,
      afterStart: afterOffset,
      afterEnd: afterOffset,
    };
    return pending;
  };

  const flush = () => {
    if (!pending) return;
    const hunk = makeHunk(beforeContent, afterContent, pending, hunks.length);
    if (hunkChangeHasReviewableDiff(hunk)) {
      hunks.push(hunk);
    }
    pending = null;
  };

  for (const part of parts) {
    const value = part.value;
    if (!part.added && !part.removed) {
      const active = pending as PendingHunk | null;
      if (!active) {
        beforeOffset += value.length;
        afterOffset += value.length;
        continue;
      }
      if (value.trim().length > 0) {
        flush();
        beforeOffset += value.length;
        afterOffset += value.length;
        continue;
      }

      active.before += value;
      active.after += value;
      beforeOffset += value.length;
      afterOffset += value.length;
      active.beforeEnd = beforeOffset;
      active.afterEnd = afterOffset;
      continue;
    }

    const current = ensurePending();
    if (part.removed) {
      current.before += value;
      beforeOffset += value.length;
      current.beforeEnd = beforeOffset;
      continue;
    }

    current.after += value;
    afterOffset += value.length;
    current.afterEnd = afterOffset;
  }

  flush();
  return hunks.map((hunk, index) => ({ ...hunk, index }));
}

function replaceRange(content: string, start: number, end: number, replacement: string) {
  return `${content.slice(0, start)}${replacement}${content.slice(end)}`;
}

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

function uniqueTextRange(
  content: string,
  text: string,
  prefix: string,
  suffix: string
): { start: number; end: number } | null {
  const positions = positionsOf(content, text);
  if (positions.length === 1) {
    const start = positions[0];
    return { start, end: start + text.length };
  }

  const contextual = positions.filter(
    (start) =>
      matchesPrefix(content, start, prefix) && matchesSuffix(content, start + text.length, suffix)
  );
  if (contextual.length !== 1) return null;

  const start = contextual[0];
  return { start, end: start + text.length };
}

function uniqueInsertionRange(
  content: string,
  prefix: string,
  suffix: string
): { start: number; end: number } | null {
  const candidates: number[] = [];

  if (prefix) {
    for (const prefixStart of positionsOf(content, prefix)) {
      const position = prefixStart + prefix.length;
      if (matchesSuffix(content, position, suffix)) {
        candidates.push(position);
      }
    }
  } else if (suffix) {
    for (const suffixStart of positionsOf(content, suffix)) {
      candidates.push(suffixStart);
    }
  }

  const unique = [...new Set(candidates)];
  if (unique.length !== 1) return null;
  return { start: unique[0], end: unique[0] };
}

function directRange(content: string, hunk: DocumentHunkChange) {
  if (hunk.before.length > 0) {
    const direct = content.slice(hunk.beforeStart, hunk.beforeEnd);
    if (direct === hunk.before) {
      return { start: hunk.beforeStart, end: hunk.beforeEnd };
    }
    return null;
  }

  if (
    matchesPrefix(content, hunk.beforeStart, hunk.prefix) &&
    matchesSuffix(content, hunk.beforeStart, hunk.suffix)
  ) {
    return { start: hunk.beforeStart, end: hunk.beforeStart };
  }
  return null;
}

function alreadyApplied(content: string, hunk: DocumentHunkChange) {
  if (hunk.status === "removed") {
    return uniqueInsertionRange(content, hunk.prefix, hunk.suffix) !== null;
  }
  if (hunk.after.length === 0) return false;
  return uniqueTextRange(content, hunk.after, hunk.prefix, hunk.suffix) !== null;
}

export function applyHunkChange(content: string, hunk: DocumentHunkChange): HunkApplyResult {
  const direct = directRange(content, hunk);
  if (direct) {
    return { ok: true, content: replaceRange(content, direct.start, direct.end, hunk.after) };
  }

  if (hunk.before.length > 0) {
    const shifted = uniqueTextRange(content, hunk.before, hunk.prefix, hunk.suffix);
    if (shifted) {
      return { ok: true, content: replaceRange(content, shifted.start, shifted.end, hunk.after) };
    }
  } else {
    const insertion = uniqueInsertionRange(content, hunk.prefix, hunk.suffix);
    if (insertion) {
      return { ok: true, content: replaceRange(content, insertion.start, insertion.end, hunk.after) };
    }
  }

  if (alreadyApplied(content, hunk)) {
    return { ok: true, content };
  }

  return {
    ok: false,
    code: "conflict",
    error: "This change no longer matches the document. Re-review it before accepting.",
  };
}
