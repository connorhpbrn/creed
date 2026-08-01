"use client";

// Find and replace for the creed file. Press F to find, R to find + replace.
// Enter / Shift+Enter step through matches, Esc closes, and the grip drags the
// widget anywhere on screen.
//
// Matching runs over the RENDERED text (each section's ProseMirror text nodes)
// and highlights via the CSS Custom Highlight API - no DOM mutation, so the
// editors never notice. Replacing parses the section's content HTML and edits
// the SAME text-node stream, so markup can never be corrupted and the nth
// visible match is always the nth replaced match.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useDragControls, useMotionValue } from "motion/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { GripVerticalIcon, type GripVerticalIconHandle } from "@/components/ui/grip-vertical";
import { useCreed } from "@/components/creed/creed-provider";
import { cn } from "@/lib/utils";

const FIND_HIGHLIGHT = "creed-find";
const ACTIVE_HIGHLIGHT = "creed-find-active";
const HIGHLIGHT_STYLE_ID = "creed-find-highlight-styles";
const SEARCH_DEBOUNCE_MS = 120;

const HIGHLIGHT_STYLE_TEXT = `
::highlight(creed-find) {
  background-color: rgba(37, 99, 235, 0.16);
}

::highlight(creed-find-active) {
  background-color: rgba(37, 99, 235, 0.42);
  color: #ffffff;
}

.dark ::highlight(creed-find) {
  background-color: rgba(96, 165, 250, 0.22);
}

.dark ::highlight(creed-find-active) {
  background-color: rgba(96, 165, 250, 0.45);
  color: #0e0e0d;
}
`.trim();

type FindMatch = {
  sectionId: string;
  range: Range;
  // The match's position among this section's matches, in text-node order.
  // Replace uses it to edit the exact same occurrence in the content HTML.
  occurrence: number;
};

const supportsHighlights = () =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

function ensureHighlightStyles() {
  if (typeof document === "undefined" || document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = HIGHLIGHT_STYLE_TEXT;
  document.head.appendChild(style);
}

// Walk a root's text nodes in document order, reporting every case-insensitive
// match as (node, start). Shared shape between the rendered DOM (find) and the
// parsed content HTML (replace) so their occurrence counting always agrees.
function walkTextMatches(
  root: Node,
  term: string,
  onMatch: (node: Text, start: number) => void
) {
  const needle = term.toLowerCase();
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node as Text).data;
    const haystack = text.toLowerCase();
    let from = 0;
    let found = haystack.indexOf(needle, from);
    while (found !== -1) {
      onMatch(node as Text, found);
      from = found + needle.length;
      found = haystack.indexOf(needle, from);
    }
  }
}

function collectMatches(container: HTMLElement, term: string): FindMatch[] {
  const matches: FindMatch[] = [];
  const sections = container.querySelectorAll<HTMLElement>("[data-section-id]");
  for (const section of sections) {
    const sectionId = section.getAttribute("data-section-id") ?? "";
    const editor = section.querySelector<HTMLElement>(".ProseMirror");
    if (!sectionId || !editor) continue;
    let occurrence = 0;
    walkTextMatches(editor, term, (node, start) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + term.length);
      matches.push({ sectionId, range, occurrence });
      occurrence += 1;
    });
  }
  return matches;
}

// Replace occurrences of `term` inside the TEXT of a content HTML string.
// occurrence: a specific index (as counted by collectMatches) or "all".
function replaceInContentHtml(
  content: string,
  term: string,
  replacement: string,
  occurrence: number | "all"
): { next: string; replaced: number } {
  const doc = new DOMParser().parseFromString(content, "text/html");
  let index = 0;
  let replaced = 0;
  const edits: Array<{ node: Text; start: number }> = [];
  walkTextMatches(doc.body, term, (node, start) => {
    if (occurrence === "all" || occurrence === index) {
      edits.push({ node, start });
    }
    index += 1;
  });
  // Apply per node from the END so earlier offsets stay valid, even when the
  // replacement contains the search term.
  for (const edit of edits.reverse()) {
    edit.node.data =
      edit.node.data.slice(0, edit.start) +
      replacement +
      edit.node.data.slice(edit.start + term.length);
    replaced += 1;
  }
  return { next: doc.body.innerHTML, replaced };
}

function clearHighlights() {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(FIND_HIGHLIGHT);
  CSS.highlights.delete(ACTIVE_HIGHLIGHT);
}

export function CreedFindReplace({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const { state, updateRichTextSection } = useCreed();

  const [open, setOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const findInputRef = useRef<HTMLInputElement | null>(null);
  const gripRef = useRef<GripVerticalIconHandle | null>(null);
  const dragControls = useDragControls();
  // Drag offset lives in motion values on the always-mounted component, so the
  // widget reopens exactly where the user left it.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  const openFind = useCallback((withReplace: boolean) => {
    setOpen(true);
    if (withReplace) setReplaceOpen(true);
    // Focus + select on every open (and re-press of F while already open).
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setReplaceOpen(false);
    clearHighlights();
  }, []);

  // F opens find, R opens find + replace. Same guards as the shell's other
  // single-key shortcuts (K, M, A, S): never while typing anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isF = event.key === "f" || event.key === "F";
      const isR = event.key === "r" || event.key === "R";
      if (!isF && !isR) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (!target || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      event.preventDefault();
      openFind(isR);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFind]);

  // Recompute matches when the query or the creed content changes. Debounced
  // for typing; content changes (an edit, a replace) recompute on the next
  // tick so highlights track the live document.
  useEffect(() => {
    if (!open || !query.trim()) {
      setMatches([]);
      clearHighlights();
      return;
    }
    const timeout = window.setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      setMatches(collectMatches(container, query));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [open, query, scrollRef, state.sections]);

  useEffect(() => {
    if (supportsHighlights()) {
      ensureHighlightStyles();
    }
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Paint highlights + keep the active match in view.
  useEffect(() => {
    if (!open || !supportsHighlights()) return;
    if (!matches.length) {
      clearHighlights();
      return;
    }
    const clamped = Math.min(activeIndex, matches.length - 1);
    CSS.highlights.set(FIND_HIGHLIGHT, new Highlight(...matches.map((match) => match.range)));
    CSS.highlights.set(ACTIVE_HIGHLIGHT, new Highlight(matches[clamped].range));

    const element = matches[clamped].range.startContainer.parentElement;
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, matches, open]);

  useEffect(() => clearHighlights, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!matches.length) return;
      setActiveIndex((index) => (index + direction + matches.length) % matches.length);
    },
    [matches.length]
  );

  const replaceCurrent = useCallback(() => {
    const match = matches[Math.min(activeIndex, matches.length - 1)];
    if (!match || !query.trim()) return;
    const section = state.sections.find((candidate) => candidate.id === match.sectionId);
    if (!section) return;
    const { next, replaced } = replaceInContentHtml(
      section.content,
      query,
      replacement,
      match.occurrence
    );
    if (replaced > 0) {
      updateRichTextSection(section.id, next);
      // Drop the now-stale ranges + highlights right away so nothing lingers
      // over changed text; the content change recomputes fresh matches on the
      // next tick, and the active index then points at what was the next match.
      setMatches([]);
      clearHighlights();
    }
  }, [activeIndex, matches, query, replacement, state.sections, updateRichTextSection]);

  const replaceAll = useCallback(() => {
    if (!query.trim() || !matches.length) return;
    const sectionIds = [...new Set(matches.map((match) => match.sectionId))];
    for (const sectionId of sectionIds) {
      const section = state.sections.find((candidate) => candidate.id === sectionId);
      if (!section) continue;
      const { next, replaced } = replaceInContentHtml(section.content, query, replacement, "all");
      if (replaced > 0) updateRichTextSection(sectionId, next);
    }
    // Every match just changed; clear the stale ranges + highlights now and let
    // the content change recompute what (if anything) still matches.
    setMatches([]);
    clearHighlights();
  }, [matches, query, replacement, state.sections, updateRichTextSection]);

  const onFindKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [close, step]
  );

  const onReplaceKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) replaceAll();
        else replaceCurrent();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [close, replaceAll, replaceCurrent]
  );

  const count = useMemo(() => {
    if (!query.trim()) return null;
    if (!matches.length) return "0/0";
    return `${Math.min(activeIndex, matches.length - 1) + 1}/${matches.length}`;
  }, [activeIndex, matches.length, query]);

  const iconButton =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:pointer-events-none disabled:opacity-40";
  const textButton =
    "flex h-7 shrink-0 items-center rounded-[8px] px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:pointer-events-none disabled:opacity-40";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          drag
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          dragElastic={0}
          style={{ x: dragX, y: dragY }}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-6 top-[76px] z-40 w-[360px] max-w-[calc(100vw-3rem)] rounded-[var(--radius-lg)] bg-[var(--creed-surface)] ring-1 ring-foreground/8 shadow-[0_12px_30px_rgba(28,28,26,0.08)]"
        >
          <div className="flex items-center gap-1 p-1.5">
            <button
              type="button"
              aria-label="Move find and replace"
              onPointerDown={(event) => dragControls.start(event)}
              onMouseEnter={() => gripRef.current?.startAnimation()}
              onMouseLeave={() => gripRef.current?.stopAnimation()}
              className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-[var(--creed-text-tertiary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] active:cursor-grabbing"
            >
              <GripVerticalIcon
                ref={gripRef}
                size={14}
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
              />
            </button>
            <input
              ref={findInputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onFindKeyDown}
              placeholder="Find…"
              spellCheck={false}
              autoComplete="off"
              className="h-7 w-full min-w-0 bg-transparent px-1 text-[13px] text-[var(--creed-text-primary)] outline-none placeholder:text-[var(--creed-text-tertiary)]"
            />
            {count ? (
              <span
                className={cn(
                  "shrink-0 px-0.5 text-[11px] tabular-nums",
                  matches.length
                    ? "text-[var(--creed-text-tertiary)]"
                    : "text-[var(--creed-danger)]"
                )}
              >
                {count}
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Previous match"
              onClick={() => step(-1)}
              disabled={!matches.length}
              className={iconButton}
            >
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={() => step(1)}
              disabled={!matches.length}
              className={iconButton}
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button type="button" aria-label="Close" onClick={close} className={iconButton}>
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>

          {replaceOpen ? (
            <div className="flex items-center gap-1 border-t border-[var(--creed-border)] p-1.5 pl-[30px]">
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={onReplaceKeyDown}
                placeholder="Replace with…"
                spellCheck={false}
                autoComplete="off"
                className="h-7 w-full min-w-0 bg-transparent px-1 text-[13px] text-[var(--creed-text-primary)] outline-none placeholder:text-[var(--creed-text-tertiary)]"
              />
              <button
                type="button"
                onClick={replaceCurrent}
                disabled={!matches.length}
                className={textButton}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={!matches.length}
                className={textButton}
              >
                All
              </button>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
