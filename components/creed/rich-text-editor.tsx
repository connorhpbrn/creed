"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Extension, type Editor, type Range } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionMatch,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { EditorContent, useEditor } from "@tiptap/react";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  PlusSquare,
  Strikethrough,
} from "lucide-react";
import {
  InlineTagMark,
  type SectionTagTarget,
} from "@/components/creed/extensions/inline-tag";
import { TabComplete } from "@/components/creed/extensions/tab-complete";
import {
  SECTION_REFERENCE_PICKER_GAP,
  SECTION_REFERENCE_PICKER_MAX_ROWS,
  SECTION_REFERENCE_PICKER_PADDING,
  SECTION_REFERENCE_PICKER_ROW_HEIGHT,
  SectionReferencePicker,
} from "@/components/creed/section-reference-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { rankMentionSections } from "@/lib/panel/mentions";
import { cn } from "@/lib/utils";

const slashPluginKey = new PluginKey("creedSlashCommand");
const sectionTagPluginKey = new PluginKey("creedSectionTag");
const sectionTagRefocusMetaKey = "creedSectionTagRefocus";

// Pre-bundled curated language set: js/ts/jsx/tsx, python, ruby, go, rust,
// java, c/cpp, cs, php, swift, kotlin, json, yaml, bash, sql, html, css,
// markdown, etc. Auto-detects when no language is specified on the node.
const lowlight = createLowlight(common);

type SlashCommand = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  keywords?: string[];
  run: (editor: Editor, range: Range) => void;
};

type SlashMenuState = {
  query: string;
  items: SlashCommand[];
  x: number;
  placeAbove: boolean;
  top?: number;
  bottomOffset?: number;
};

type SectionTagMenuState = {
  query: string;
  items: SectionTagTarget[];
  x: number;
  placeAbove: boolean;
  top?: number;
  bottomOffset?: number;
  width: number;
};

type SelectionToolbarState = {
  // Viewport-relative position; toolbar is rendered with `position: fixed` so
  // it isn't affected by parent transforms or scroll containers.
  x: number;
  y: number;
  /** When true, the toolbar sits below the selection (selection hugs viewport top). */
  placeBelow: boolean;
};

type RichTextEditorProps = {
  sectionId: string;
  content: string;
  readOnly?: boolean;
  placeholder?: string;
  accentColor?: string;
  sectionTagTargets?: SectionTagTarget[];
  density?: "default" | "continuation";
  onChange: (content: string) => void;
  onAddSectionAfter?: () => void;
};

// Convert a CSS color value (hex or CSS variable reference) into an
// alpha-blended variant. The accent system stores most colours as fixed
// hex strings, but the `mono` accent resolves to a `var(--accent-color-
// mono)` reference so it can theme-swap black ↔ white. parseInt-based
// hex parsing chokes on `var(...)` inputs and silently returns NaN,
// which produced invisible accent bars / tints in mono sections. Falling
// back to a runtime `color-mix(...)` expression keeps both shapes
// working uniformly.
function withAlpha(color: string, alpha: number) {
  if (color.startsWith("#")) {
    const normalized = color.replace("#", "");
    const bigint = Number.parseInt(normalized, 16);
    if (Number.isFinite(bigint)) {
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  // Anything that isn't a parseable hex (CSS vars, named colors, etc.)
  // gets blended via color-mix so the browser does the arithmetic with
  // the resolved colour at paint time.
  const pct = Math.max(0, Math.min(100, Math.round(alpha * 100)));
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function insertContentAndSelect(
  editor: Editor,
  range: Range,
  content: Parameters<Editor["commands"]["insertContentAt"]>[1],
  selectionOffset: number,
  replaceBlock = false,
) {
  const targetRange = replaceBlock
    ? {
        from: editor.state.selection.$from.before(
          editor.state.selection.$from.depth,
        ),
        to: editor.state.selection.$from.after(
          editor.state.selection.$from.depth,
        ),
      }
    : range;

  return editor
    .chain()
    .focus()
    .insertContentAt(targetRange, content, { updateSelection: false })
    .setTextSelection(targetRange.from + selectionOffset)
    .run();
}

function matchesSlashCommand(command: SlashCommand, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    command.title,
    command.description,
    ...(command.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function normalizeSectionReferenceTags(
  html: string,
  targets: SectionTagTarget[],
) {
  if (typeof window === "undefined" || !html.includes("creed-inline-tag")) {
    return html;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return html;

  const targetByNormalized = new Map<string, SectionTagTarget>();
  for (const target of targets) {
    const names = [target.id, target.name];
    for (const name of names) {
      targetByNormalized.set(
        name
          .trim()
          .toLowerCase()
          .replace(/^#/, "")
          .replace(/[\s_-]+/g, ""),
        target,
      );
    }
  }

  root
    .querySelectorAll<HTMLElement>("span.creed-inline-tag")
    .forEach((node) => {
      const rawValue = node.getAttribute("data-tag") ?? node.textContent ?? "";
      const normalized = rawValue
        .trim()
        .toLowerCase()
        .replace(/^#/, "")
        .replace(/[\s_-]+/g, "");
      const target = targetByNormalized.get(normalized);

      if (!target) {
        const fallbackText = (node.textContent?.trim() || rawValue).replace(
          /^#+/,
          "",
        );
        node.replaceWith(document.createTextNode(`#${fallbackText}`));
        return;
      }

      node.setAttribute("data-tag", target.id);
      node.textContent = target.name;
    });

  return root.innerHTML;
}

function findSectionTagSuggestionMatch({
  $position,
}: {
  $position: Parameters<
    NonNullable<Parameters<typeof Suggestion>[0]["findSuggestionMatch"]>
  >[0]["$position"];
}): SuggestionMatch {
  const textBeforeCursor = $position.parent.textBetween(
    0,
    $position.parentOffset,
    "",
    "",
  );
  const match = /(^|\s)#([A-Za-z0-9 _-]*)$/.exec(textBeforeCursor);

  if (!match || match.index === undefined) {
    return null;
  }

  const prefixLength = match[1]?.length ?? 0;
  const text = match[0].slice(prefixLength);
  const from = $position.pos - text.length;
  const to = $position.pos;

  if (from < $position.pos && to >= $position.pos) {
    return {
      range: { from, to },
      query: text.slice(1),
      text,
    };
  }

  return null;
}

export function RichTextEditor({
  sectionId,
  content,
  readOnly = false,
  placeholder = "Write something useful for your future agents.",
  accentColor = "#6B7280",
  sectionTagTargets = [],
  density = "default",
  onChange,
  onAddSectionAfter,
}: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track the most recent HTML we emitted so the content-sync effect can
  // skip the round-trip getHTML() / setContent() when the parent rerenders
  // with the same string we just sent it. Without this every keystroke
  // serializes the entire ProseMirror doc twice.
  const lastEmittedHtmlRef = useRef<string | null>(content);
  const slashItemsRef = useRef<SlashCommand[]>([]);
  const slashSuggestionRef = useRef<SuggestionProps<
    SlashCommand,
    SlashCommand
  > | null>(null);
  const sectionTagItemsRef = useRef<SectionTagTarget[]>([]);
  const sectionTagTargetsRef = useRef<SectionTagTarget[]>(sectionTagTargets);
  const sectionTagQueryRef = useRef("");
  const sectionTagSuggestionRef = useRef<SuggestionProps<
    SectionTagTarget,
    SectionTagTarget
  > | null>(null);
  const slashIndexRef = useRef(0);
  const sectionTagIndexRef = useRef(0);
  const slashSelectRef = useRef<((item: SlashCommand) => void) | null>(null);
  const sectionTagSelectRef = useRef<((item: SectionTagTarget) => void) | null>(
    null,
  );
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [sectionTagState, setSectionTagState] =
    useState<SectionTagMenuState | null>(null);
  const [sectionTagIndex, setSectionTagIndex] = useState(0);
  const [selectionToolbar, setSelectionToolbar] =
    useState<SelectionToolbarState | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [modifierLinkMode, setModifierLinkMode] = useState(false);
  const editorThemeStyle = useMemo(
    () =>
      ({
        "--section-accent": accentColor,
        "--section-accent-tint": withAlpha(accentColor, 0.11),
        "--section-accent-border": withAlpha(accentColor, 0.12),
        "--section-accent-bar": withAlpha(accentColor, 0.82),
      }) as CSSProperties,
    [accentColor],
  );

  useEffect(() => {
    sectionTagTargetsRef.current = sectionTagTargets;
  }, [sectionTagTargets]);

  const commands = useMemo<SlashCommand[]>(
    () => [
      {
        title: "Text",
        description: "Plain paragraph",
        icon: Pilcrow,
        keywords: ["paragraph", "body", "text"],
        run: (editor, range) => {
          // Insert a short Lorem ipsum placeholder so the user sees
          // something happened - and select it so the next keystroke
          // replaces it cleanly.
          const placeholder =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
          const startPos = range.from;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setParagraph()
            .insertContent(placeholder)
            .setTextSelection({
              from: startPos,
              to: startPos + placeholder.length,
            })
            .run();
        },
      },
      {
        title: "Heading 2",
        description: "Section heading",
        icon: Heading2,
        keywords: ["heading", "title", "h2"],
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setHeading({ level: 2 })
            .run(),
      },
      {
        title: "Heading 3",
        description: "Subsection heading",
        icon: Heading3,
        keywords: ["heading", "subtitle", "h3"],
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setHeading({ level: 3 })
            .run(),
      },
      {
        title: "Heading 4",
        description: "Minor heading",
        icon: Heading4,
        keywords: ["heading", "minor", "h4"],
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setHeading({ level: 4 })
            .run(),
      },
      {
        title: "Bullet list",
        description: "Unordered list",
        icon: List,
        keywords: ["list", "bullets", "unordered"],
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).toggleBulletList().run(),
      },
      {
        title: "Numbered list",
        description: "Ordered list",
        icon: ListOrdered,
        keywords: ["ordered", "list", "numbers", "numbered"],
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
      },
      {
        title: "Code block",
        description: "Monospace block",
        icon: Code2,
        keywords: ["code", "snippet", "terminal", "config"],
        run: (editor, range) =>
          insertContentAndSelect(
            editor,
            range,
            {
              type: "codeBlock",
              // Leave language unset so lowlight auto-detects from content
              // as the user types or pastes a snippet.
              attrs: { language: null },
            },
            1,
            true,
          ),
      },
      {
        title: "Callout",
        description: "Highlighted note",
        icon: MessageSquareQuote,
        keywords: ["callout", "note", "tip", "highlight"],
        run: (editor, range) =>
          insertContentAndSelect(
            editor,
            range,
            {
              type: "blockquote",
              content: [{ type: "paragraph" }],
            },
            2,
            true,
          ),
      },
      {
        title: "Divider",
        description: "Section break",
        icon: Minus,
        keywords: ["divider", "separator", "rule"],
        run: (editor, range) =>
          insertContentAndSelect(
            editor,
            range,
            [{ type: "horizontalRule" }, { type: "paragraph" }],
            2,
            true,
          ),
      },
      {
        title: "New section",
        description: "Add section below",
        icon: PlusSquare,
        keywords: ["new section", "add section", "insert section"],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).run();
          onAddSectionAfter?.();
        },
      },
    ],
    [onAddSectionAfter],
  );

  const inlineTagExtension = useMemo(
    () =>
      InlineTagMark.configure({
        getTargets: () => sectionTagTargetsRef.current,
      }),
    [],
  );

  const sectionIdRef = useRef(sectionId);
  useEffect(() => {
    sectionIdRef.current = sectionId;
  }, [sectionId]);

  const tabCompleteExtension = useMemo(
    () =>
      TabComplete.configure({
        getSectionId: () => sectionIdRef.current,
        // The slash menu and # picker own Tab while their popover is open;
        // the ghost never fights them for the key.
        shouldDeferKey: (state) =>
          Boolean(
            slashPluginKey.getState(state)?.active ||
              sectionTagPluginKey.getState(state)?.active,
          ),
      }),
    [],
  );

  // We mirror the slash items + active index into refs *synchronously*
  // inside `updateSlashMenu` (below) and the index setters, instead of via
  // a useEffect. The previous version was racing: if you typed `/h` and
  // pressed Enter very fast, the Suggestion plugin's `onKeyDown` fired
  // before the post-render effect ran, so `slashItemsRef.current` still
  // pointed at the unfiltered items - Enter then tried to run an index
  // that no longer existed in the filtered list, the menu exited, and
  // Tiptap inserted a newline. Synchronous refs make Enter always pick
  // from the freshest items.
  useEffect(() => {
    slashIndexRef.current = slashIndex;
  }, [slashIndex]);

  useEffect(() => {
    sectionTagIndexRef.current = sectionTagIndex;
  }, [sectionTagIndex]);

  const updateSlashMenu = useCallback(
    (props: SuggestionProps<SlashCommand, SlashCommand>) => {
      // Keep the ref in sync as the items themselves change - synchronous
      // update before the state setter so handleSlashKeyDown sees the fresh
      // list even if Enter fires inside the same tick.
      slashItemsRef.current = props.items;
      slashSuggestionRef.current = props;
      if (readOnly || !props.clientRect) {
        setSlashState(null);
        return;
      }

      const clientRect = props.clientRect();

      if (!clientRect) {
        setSlashState(null);
        return;
      }

      if (
        clientRect.bottom < 0 ||
        clientRect.top > window.innerHeight ||
        clientRect.right < 0 ||
        clientRect.left > window.innerWidth
      ) {
        setSlashState(null);
        return;
      }

      const estimatedMenuHeight = Math.min(
        Math.max(props.items.length, 1) * 64 + 56,
        420,
      );
      const viewportBottomSpace = window.innerHeight - clientRect.bottom;
      const placeAbove = viewportBottomSpace < estimatedMenuHeight + 24;
      const menuWidth = 220;
      const left = Math.max(
        8,
        Math.min(clientRect.left, window.innerWidth - menuWidth - 8),
      );

      setSlashState({
        query: props.query,
        items: props.items,
        x: left,
        placeAbove,
        top: placeAbove ? undefined : clientRect.bottom + 10,
        bottomOffset: placeAbove
          ? Math.max(
              window.innerHeight - clientRect.top + 10,
              0,
            )
          : undefined,
      });
    },
    [readOnly],
  );

  useEffect(() => {
    if (!slashState) return;

    function repositionSlashMenu() {
      const props = slashSuggestionRef.current;
      if (!props) {
        setSlashState(null);
        return;
      }
      updateSlashMenu(props);
    }

    window.addEventListener("scroll", repositionSlashMenu, true);
    window.addEventListener("resize", repositionSlashMenu);
    return () => {
      window.removeEventListener("scroll", repositionSlashMenu, true);
      window.removeEventListener("resize", repositionSlashMenu);
    };
  }, [slashState, updateSlashMenu]);

  function handleSlashKeyDown({ event, view }: SuggestionKeyDownProps) {
    const items = slashItemsRef.current;

    if (!items.length) {
      if (event.key === "Escape") {
        exitSuggestion(view, slashPluginKey);
        return true;
      }

      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => (current + 1) % items.length);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) =>
        current === 0 ? items.length - 1 : current - 1,
      );
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // Clamp the active index so a quick `/h<Enter>` after the items
      // shrink can never index past the end of the filtered list.
      const safeIndex = Math.min(slashIndexRef.current, items.length - 1);
      const item = items[Math.max(safeIndex, 0)];

      if (item) {
        slashSelectRef.current?.(item);
      }

      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      exitSuggestion(view, slashPluginKey);
      return true;
    }

    return false;
  }

  function selectSlashItem(item: SlashCommand) {
    slashSelectRef.current?.(item);
  }

  const updateSectionTagMenu = useCallback(
    (props: SuggestionProps<SectionTagTarget, SectionTagTarget>) => {
      sectionTagSuggestionRef.current = props;
      sectionTagItemsRef.current = props.items;
      if (readOnly || !containerRef.current || !props.clientRect) {
        setSectionTagState(null);
        return;
      }

      const clientRect = props.clientRect();
      if (!clientRect) {
        setSectionTagState(null);
        return;
      }
      if (
        clientRect.bottom < 0 ||
        clientRect.top > window.innerHeight ||
        clientRect.right < 0 ||
        clientRect.left > window.innerWidth
      ) {
        setSectionTagState(null);
        return;
      }

      const estimatedMenuHeight =
        Math.min(
          Math.max(props.items.length, 1),
          SECTION_REFERENCE_PICKER_MAX_ROWS,
        ) *
          SECTION_REFERENCE_PICKER_ROW_HEIGHT +
        SECTION_REFERENCE_PICKER_PADDING;
      const viewportBottomSpace = window.innerHeight - clientRect.bottom;
      const placeAbove = viewportBottomSpace < estimatedMenuHeight + 24;
      const pickerWidth = 240;
      const left = Math.max(
        8,
        Math.min(clientRect.left, window.innerWidth - pickerWidth - 8),
      );

      setSectionTagState({
        query: props.query,
        items: props.items,
        x: left,
        placeAbove,
        top: placeAbove
          ? undefined
          : clientRect.bottom + SECTION_REFERENCE_PICKER_GAP,
        bottomOffset: placeAbove
          ? Math.max(
              window.innerHeight -
                clientRect.top +
                SECTION_REFERENCE_PICKER_GAP,
              0,
            )
          : undefined,
        width: pickerWidth,
      });
      sectionTagQueryRef.current = props.query;
    },
    [readOnly],
  );

  useEffect(() => {
    if (!sectionTagState) return;

    function repositionSectionTagMenu() {
      const props = sectionTagSuggestionRef.current;
      if (!props) {
        setSectionTagState(null);
        return;
      }
      updateSectionTagMenu(props);
    }

    window.addEventListener("scroll", repositionSectionTagMenu, true);
    window.addEventListener("resize", repositionSectionTagMenu);
    return () => {
      window.removeEventListener("scroll", repositionSectionTagMenu, true);
      window.removeEventListener("resize", repositionSectionTagMenu);
    };
  }, [sectionTagState, updateSectionTagMenu]);

  function handleSectionTagKeyDown({ event, view }: SuggestionKeyDownProps) {
    const items = sectionTagItemsRef.current;

    if (!items.length) {
      if (event.key === "Escape") {
        exitSuggestion(view, sectionTagPluginKey);
        return true;
      }

      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSectionTagIndex((current) => (current + 1) % items.length);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSectionTagIndex((current) =>
        current === 0 ? items.length - 1 : current - 1,
      );
      return true;
    }

    if (
      event.key === "Enter" ||
      event.key === "Tab" ||
      (event.key === " " && sectionTagQueryRef.current.trim())
    ) {
      event.preventDefault();
      const safeIndex = Math.min(sectionTagIndexRef.current, items.length - 1);
      const item = items[Math.max(safeIndex, 0)];

      if (item) {
        sectionTagSelectRef.current?.(item);
      }

      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      exitSuggestion(view, sectionTagPluginKey);
      return true;
    }

    return false;
  }

  function selectSectionTagItem(item: SectionTagTarget) {
    sectionTagSelectRef.current?.(item);
  }

  const slashCommandExtension = useMemo(
    () =>
      Extension.create({
        name: "slash-command",
        addProseMirrorPlugins() {
          return [
            Suggestion<SlashCommand, SlashCommand>({
              editor: this.editor,
              pluginKey: slashPluginKey,
              char: "/",
              allowSpaces: true,
              startOfLine: true,
              items: ({ query }) =>
                commands.filter((command) =>
                  matchesSlashCommand(command, query),
                ),
              command: ({ editor, range, props }) => {
                props.run(editor, range);
              },
              render: () => ({
                onStart: (props) => {
                  slashSelectRef.current = props.command;
                  setSlashIndex(0);
                  updateSlashMenu(props);
                },
                onUpdate: (props) => {
                  slashSelectRef.current = props.command;
                  setSlashIndex((current) =>
                    props.items.length === 0
                      ? 0
                      : Math.min(current, props.items.length - 1),
                  );
                  updateSlashMenu(props);
                },
                onKeyDown: (props) => handleSlashKeyDown(props),
                onExit: () => {
                  slashSelectRef.current = null;
                  slashSuggestionRef.current = null;
                  setSlashIndex(0);
                  setSlashState(null);
                },
              }),
            }),
          ];
        },
      }),
    [commands, updateSlashMenu],
  );

  const sectionTagExtension = useMemo(
    () =>
      Extension.create({
        name: "section-tag-suggestion",
        addProseMirrorPlugins() {
          return [
            Suggestion<SectionTagTarget, SectionTagTarget>({
              editor: this.editor,
              pluginKey: sectionTagPluginKey,
              char: "#",
              allowSpaces: true,
              allowedPrefixes: null,
              findSuggestionMatch: findSectionTagSuggestionMatch,
              shouldResetDismissed: ({ transaction }) =>
                transaction.selectionSet ||
                Boolean(transaction.getMeta(sectionTagRefocusMetaKey)),
              items: ({ query }) =>
                rankMentionSections(sectionTagTargetsRef.current, query),
              command: ({ editor, range, props }) => {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(
                    range,
                    [
                      {
                        type: "text",
                        text: props.name,
                        marks: [
                          {
                            type: "creedInlineTag",
                            attrs: { value: props.id },
                          },
                        ],
                      },
                      { type: "text", text: " " },
                    ],
                    { updateSelection: false },
                  )
                  .setTextSelection(range.from + props.name.length + 1)
                  .run();
              },
              render: () => ({
                onStart: (props) => {
                  sectionTagSelectRef.current = props.command;
                  setSectionTagIndex(0);
                  updateSectionTagMenu(props);
                },
                onUpdate: (props) => {
                  sectionTagSelectRef.current = props.command;
                  setSectionTagIndex((current) =>
                    props.items.length === 0
                      ? 0
                      : Math.min(current, props.items.length - 1),
                  );
                  updateSectionTagMenu(props);
                },
                onKeyDown: (props) => handleSectionTagKeyDown(props),
                onExit: () => {
                  sectionTagSelectRef.current = null;
                  sectionTagSuggestionRef.current = null;
                  sectionTagQueryRef.current = "";
                  setSectionTagIndex(0);
                  setSectionTagState(null);
                },
              }),
            }),
          ];
        },
      }),
    [updateSectionTagMenu],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
        bulletList: {
          HTMLAttributes: {
            class: "creed-list creed-list-bullet",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "creed-list creed-list-ordered",
          },
        },
        listItem: {
          HTMLAttributes: {
            class: "creed-list-item",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: "creed-callout",
          },
        },
        codeBlock: false,
        link: {
          openOnClick: false,
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        // `null` here defers to lowlight.highlightAuto when the node has no
        // language attribute set, so longer snippets pick up the right
        // grammar without users needing to choose one.
        defaultLanguage: null,
        exitOnTripleEnter: false,
        HTMLAttributes: {
          class: "creed-code-block",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      inlineTagExtension,
      slashCommandExtension,
      sectionTagExtension,
      tabCompleteExtension,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          density === "continuation"
            ? "continuation-editor min-h-[56px] pb-0 text-[var(--creed-text-primary)]"
            : "min-h-[56px] pb-2 text-[var(--creed-text-primary)]",
      },
      handleClick: (_view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) {
          return false;
        }

        const target =
          event.target instanceof Element
            ? event.target
            : event.target instanceof Text
              ? event.target.parentElement
              : null;
        if (!target) {
          return false;
        }

        const link = target.closest<HTMLAnchorElement>("a[href]");
        if (!link) {
          return false;
        }

        event.preventDefault();
        window.open(link.href, "_blank", "noopener,noreferrer");
        return true;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== "Backspace") {
          return false;
        }

        const { state } = view;
        const { selection } = state;

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === "horizontalRule"
        ) {
          event.preventDefault();
          view.dispatch(state.tr.deleteSelection().scrollIntoView());
          return true;
        }

        if (!selection.empty) {
          return false;
        }

        const { $from } = selection;

        if (
          $from.depth === 0 ||
          $from.parentOffset !== 0 ||
          !$from.parent.isTextblock
        ) {
          return false;
        }

        const parentDepth = $from.depth - 1;
        const siblingIndex = $from.index(parentDepth);

        if (siblingIndex === 0) {
          return false;
        }

        const parentNode = $from.node(parentDepth);
        const previousNode = parentNode.child(siblingIndex - 1);

        if (previousNode.type.name !== "horizontalRule") {
          return false;
        }

        const currentBlockStart = $from.before($from.depth);
        const previousNodeStart = currentBlockStart - previousNode.nodeSize;

        event.preventDefault();
        view.dispatch(
          state.tr
            .delete(
              previousNodeStart,
              previousNodeStart + previousNode.nodeSize,
            )
            .scrollIntoView(),
        );
        return true;
      },
    },
    onUpdate({ editor }) {
      const html = normalizeSectionReferenceTags(
        editor.getHTML(),
        sectionTagTargetsRef.current,
      );
      lastEmittedHtmlRef.current = html;
      // Push the parent state update into a transition so React doesn't block
      // the keystroke's paint on the resulting cascade of re-renders.
      // Persistence is already debounced downstream (see creed-provider).
      startTransition(() => {
        onChange(html);
      });
      syncSelectionToolbar(editor);
    },
    onSelectionUpdate({ editor }) {
      syncSelectionToolbar(editor);
    },
  });

  const closeSectionTagMenu = useCallback(() => {
    if (editor) {
      exitSuggestion(editor.view, sectionTagPluginKey);
    }
    sectionTagSelectRef.current = null;
    sectionTagSuggestionRef.current = null;
    sectionTagQueryRef.current = "";
    setSectionTagIndex(0);
    setSectionTagState(null);
  }, [editor]);

  const refreshSectionTagMenu = useCallback(() => {
    if (!editor || readOnly) return;
    window.requestAnimationFrame(() => {
      if (!editor.isFocused) return;
      editor.view.dispatch(
        editor.state.tr.setMeta(sectionTagRefocusMetaKey, true),
      );
    });
  }, [editor, readOnly]);

  useEffect(() => {
    if (!sectionTagState) return;

    function isInsideSectionTagSurface(target: EventTarget | null) {
      if (!(target instanceof Node)) return false;
      return Boolean(
        containerRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest("[data-creed-section-tag-popup]")),
      );
    }

    function onPointerDown(event: PointerEvent) {
      if (!isInsideSectionTagSurface(event.target)) {
        closeSectionTagMenu();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!isInsideSectionTagSurface(event.target)) {
        closeSectionTagMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [closeSectionTagMenu, sectionTagState]);

  useEffect(() => {
    if (!editor || readOnly) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        setModifierLinkMode(true);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        setModifierLinkMode(false);
      }
    }

    function onBlur() {
      setModifierLinkMode(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || readOnly) return;

    function onPointerUp(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-creed-section-tag-popup]")
      ) {
        return;
      }
      refreshSectionTagMenu();
    }

    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [editor, readOnly, refreshSectionTagMenu]);

  function syncSelectionToolbar(currentEditor: Editor) {
    if (readOnly) {
      setSelectionToolbar(null);
      return;
    }

    const { state } = currentEditor;
    const { selection } = state;

    // Bail for empty selections, NodeSelections (drag handles), and any
    // selection where the editor isn't focused - Notion only shows the
    // bubble menu while a *user* selection is live.
    if (selection.empty || !currentEditor.isFocused) {
      setSelectionToolbar(null);
      return;
    }

    const SELECTION_GAP = 8;
    const TOOLBAR_HEIGHT = 36;
    const VIEWPORT_PADDING = 8;
    const VIEWPORT_WIDTH = window.innerWidth;
    const VIEWPORT_HEIGHT = window.innerHeight;

    // Use ProseMirror's selection coordinates as the source of truth. Browser
    // DOM Range rectangles can include odd line boxes inside list items, which
    // makes the toolbar jump far away from the highlighted text.
    let rect: DOMRect | null = null;
    try {
      const start = currentEditor.view.coordsAtPos(selection.from);
      const end = currentEditor.view.coordsAtPos(selection.to);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      rect = new DOMRect(left, top, right - left, bottom - top);
    } catch {
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0) {
        const domRects = Array.from(domSelection.getRangeAt(0).getClientRects())
          .filter((item) => item.width > 0 || item.height > 0);
        rect = domRects[0] ?? null;
      }
    }

    if (!rect) return;

    // Centre horizontally on the selection's bounding rect, then clamp so the
    // toolbar never crosses the viewport edge - the rendered element uses a
    // -50% translateX, so x is the centre point.
    const centreX = rect.left + rect.width / 2;
    const placeBelow =
      rect.top - TOOLBAR_HEIGHT - SELECTION_GAP < VIEWPORT_PADDING;
    const y = placeBelow
      ? Math.min(
          rect.bottom + SELECTION_GAP,
          VIEWPORT_HEIGHT - TOOLBAR_HEIGHT - VIEWPORT_PADDING,
        )
      : Math.max(rect.top - SELECTION_GAP, VIEWPORT_PADDING + TOOLBAR_HEIGHT);

    // Clamp X so the toolbar stays fully on-screen even when the selection
    // hugs the left/right edge of the viewport. We assume a 320px max width;
    // the actual element is shorter but this gives a safe margin.
    const HALF_WIDTH = 160;
    const x = Math.max(
      VIEWPORT_PADDING + HALF_WIDTH,
      Math.min(centreX, VIEWPORT_WIDTH - VIEWPORT_PADDING - HALF_WIDTH),
    );

    setSelectionToolbar((prev) => {
      if (
        prev &&
        prev.x === x &&
        prev.y === y &&
        prev.placeBelow === placeBelow
      ) {
        return prev;
      }
      return { x, y, placeBelow };
    });
  }

  function toggleLink() {
    if (!editor) {
      return;
    }

    const previous = editor.getAttributes("link").href as string | undefined;
    setLinkDraft(previous ?? "");
    setLinkDialogOpen(true);
  }

  function submitLink() {
    if (!editor) {
      return;
    }

    if (!linkDraft.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkDraft.trim() })
      .run();
    setLinkDialogOpen(false);
  }

  // Reposition the bubble menu on scroll/resize so it stays glued to the
  // selection when the page or any scroll container moves under it.
  useEffect(() => {
    if (!editor) return;

    function reposition() {
      if (!editor) return;
      syncSelectionToolbar(editor);
    }

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Hide the toolbar when the editor loses focus so it doesn't linger after
  // the user clicks away (e.g. into a sidebar / dialog).
  useEffect(() => {
    if (!editor) return;
    function onFocus() {
      refreshSectionTagMenu();
    }

    function onBlur() {
      // Defer one frame: clicking a toolbar button blurs the editor briefly,
      // we don't want to dismiss the toolbar before the click resolves.
      window.setTimeout(() => {
        if (editor && !editor.isFocused) {
          setSelectionToolbar(null);
          closeSectionTagMenu();
        }
      }, 0);
    }
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [closeSectionTagMenu, editor, refreshSectionTagMenu]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const normalizedContent = normalizeSectionReferenceTags(
      content,
      sectionTagTargetsRef.current,
    );

    // Fast path: the parent re-rendered with the exact string we just emitted -
    // no need to serialize + diff the doc, definitely no need to setContent.
    if (normalizedContent === lastEmittedHtmlRef.current) {
      editor.setEditable(!readOnly);
      return;
    }

    if (editor.getHTML() !== normalizedContent) {
      editor.commands.setContent(normalizedContent, { emitUpdate: false });
      lastEmittedHtmlRef.current = normalizedContent;
    }

    editor.setEditable(!readOnly);
  }, [content, editor, readOnly]);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-modifier-link-mode={modifierLinkMode ? "true" : undefined}
      style={editorThemeStyle}
    >
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {editor && selectionToolbar && !readOnly ? (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: selectionToolbar.placeBelow ? -4 : 4,
                    scale: 0.98,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: selectionToolbar.placeBelow ? -4 : 4,
                    scale: 0.98,
                  }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 text-[var(--creed-text-primary)] shadow-[0_6px_20px_rgba(28,28,26,0.10)]",
                    selectionToolbar.placeBelow
                      ? "translate-y-0"
                      : "-translate-y-full",
                  )}
                  style={{
                    ...editorThemeStyle,
                    left: selectionToolbar.x,
                    top: selectionToolbar.y,
                  }}
                  onMouseDown={(event) => {
                    // Prevent the editor from blurring when a toolbar button is
                    // clicked - keeps the selection alive so the command applies.
                    event.preventDefault();
                  }}
                >
                  <ToolbarButton
                    active={editor.isActive("heading", { level: 2 })}
                    disabled={
                      editor.isActive("code") || editor.isActive("codeBlock")
                    }
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                    label="Heading 2"
                  >
                    <Heading2 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={editor.isActive("heading", { level: 3 })}
                    disabled={
                      editor.isActive("code") || editor.isActive("codeBlock")
                    }
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                    label="Heading 3"
                  >
                    <Heading3 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={editor.isActive("heading", { level: 4 })}
                    disabled={
                      editor.isActive("code") || editor.isActive("codeBlock")
                    }
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 4 }).run()
                    }
                    label="Heading 4"
                  >
                    <Heading4 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton
                    active={editor.isActive("bold")}
                    disabled={
                      editor.isActive("code") ||
                      !editor.can().chain().focus().toggleBold().run()
                    }
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    label="Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={editor.isActive("italic")}
                    disabled={
                      editor.isActive("code") ||
                      !editor.can().chain().focus().toggleItalic().run()
                    }
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    label="Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={editor.isActive("strike")}
                    disabled={
                      editor.isActive("code") ||
                      !editor.can().chain().focus().toggleStrike().run()
                    }
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    label="Strikethrough"
                  >
                    <Strikethrough className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={editor.isActive("code")}
                    disabled={!editor.can().chain().focus().toggleCode().run()}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    label="Inline code"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton
                    active={editor.isActive("link")}
                    disabled={
                      editor.isActive("code") || editor.isActive("codeBlock")
                    }
                    onClick={toggleLink}
                    label="Link"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <EditorContent editor={editor} />

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {sectionTagState ? (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: sectionTagState.placeAbove ? 4 : -4,
                    scale: 0.98,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: sectionTagState.placeAbove ? 4 : -4,
                    scale: 0.98,
                  }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SectionReferencePicker
                    dataAttribute="data-creed-section-tag-popup"
                    items={sectionTagState.items}
                    activeIndex={sectionTagIndex}
                    onActiveIndexChange={setSectionTagIndex}
                    onSelect={selectSectionTagItem}
                    emptyMessage={
                      sectionTagState.query.trim()
                        ? "No sections match"
                        : undefined
                    }
                    style={{
                      left: sectionTagState.x,
                      width: sectionTagState.width,
                      top: sectionTagState.placeAbove
                        ? undefined
                        : sectionTagState.top,
                      bottom: sectionTagState.placeAbove
                        ? sectionTagState.bottomOffset
                        : undefined,
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Add link</DialogTitle>
            <DialogDescription>
              Paste a URL to create or update the link on the current selection.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder="https://example.com"
            className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitLink();
              }
            }}
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => {
                if (!editor) {
                  return;
                }
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .unsetLink()
                  .run();
                setLinkDialogOpen(false);
              }}
            >
              Remove
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={submitLink}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {slashState && slashState.items.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="fixed z-50 w-[220px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 shadow-[0_8px_24px_rgba(28,28,26,0.08)]"
                  style={{
                    ...editorThemeStyle,
                    left: slashState.x,
                    top: slashState.placeAbove ? undefined : slashState.top,
                    bottom: slashState.placeAbove
                      ? slashState.bottomOffset
                      : undefined,
                  }}
                >
                  {slashState.items.map((command, index) => {
                    const Icon = command.icon;
                    const isActive = index === slashIndex;

                    return (
                      <button
                        key={`${sectionId}-${command.title}`}
                        type="button"
                        data-active={isActive}
                        className="editor-command-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--creed-text-primary)] transition-colors duration-100"
                        onMouseEnter={() => setSlashIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectSlashItem(command);
                        }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" />
                        <span className="flex-1 truncate font-medium">
                          {command.title}
                        </span>
                        {isActive ? (
                          <span className="text-[11px] text-[var(--creed-text-tertiary)]">
                            {command.description}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}

function ToolbarButton({
  active,
  disabled,
  children,
  onClick,
  label,
}: {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-[var(--creed-text-secondary)] transition-colors duration-100 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--creed-text-secondary)]",
        active &&
          "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--creed-border)]" />
  );
}
