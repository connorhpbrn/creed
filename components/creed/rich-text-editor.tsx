"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Extension, type Editor, type Range } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { EditorContent, useEditor } from "@tiptap/react";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { DOMSerializer } from "@tiptap/pm/model";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  AtSign,
  Bookmark,
  Embed,
  List,
  ListOrdered,
  LoaderCircle,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  PlusSquare,
  Strikethrough,
  Tag,
  Table,
  TreeStructure,
  FileText,
  Folder,
  Plus,
  Delete,
} from "@/components/ui/phosphor-icons";
import { InlineTagMark } from "@/components/creed/extensions/inline-tag";
import { MermaidBlock } from "@/components/creed/extensions/mermaid-block";
import {
  DocReferenceCard,
  DocReferenceInline,
} from "@/components/creed/extensions/doc-reference";
import {
  UrlBookmarkCard,
  UrlEmbed,
  UrlMentionInline,
} from "@/components/creed/extensions/url-reference";
import { isHttpUrl } from "@/lib/url-reference";
import {
  ensureReferenceIndex,
  searchReferences,
  type DocumentReferenceEntry,
} from "@/lib/document-reference-index";
import {
  CommentHighlight,
  commentHighlightPluginKey,
} from "@/components/creed/extensions/comment-highlight";
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
import type { WorkspaceUser } from "@/lib/document-collaboration";
import { MentionText } from "@/components/creed/mention-text";
import { MentionTextarea } from "@/components/creed/mention-textarea";
import { cn } from "@/lib/utils";

const slashPluginKey = new PluginKey("creedSlashCommand");
const mentionPluginKey = new PluginKey("creedReferenceMention");

const ReadOnlySelectionGuard = Extension.create({
  name: "readOnlySelectionGuard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(transaction) {
          return !transaction.docChanged;
        },
      }),
    ];
  },
});

// Escape user text before interpolating it into section-body HTML. Mirrors the
// helper used by the write API / creed-data serializers so promoted selections
// can't inject markup into a new section's content.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  y: number;
  placeAbove: boolean;
  bottomOffset?: number;
};

// The `@` reference search menu shares the slash menu's positioning maths but
// carries resolved document/folder entries instead of editor commands.
type MentionMenuState = {
  query: string;
  items: DocumentReferenceEntry[];
  x: number;
  y: number;
  placeAbove: boolean;
  bottomOffset?: number;
};

type SelectionToolbarState = {
  // Viewport-relative position; toolbar is rendered with `position: fixed` so
  // it isn't affected by parent transforms or scroll containers.
  x: number;
  y: number;
  /** When true, the toolbar sits below the selection (selection hugs viewport top). */
  placeBelow: boolean;
  /** When true, an atom node (mermaid, embed, card) is selected - show only the
   * relevant actions (comment / make section), not text formatting. */
  nodeSelection: boolean;
};

// Anchored composer that appears when the user clicks the comment button in
// the selection toolbar. It holds the captured quote and a fixed viewport
// position so it survives the selection being lost once the editor blurs.
type CommentDraftState = {
  quote: string;
  x: number;
  y: number;
  placeBelow: boolean;
  showAuthorNameInput: boolean;
};

// A comment surfaced inside the editor: enough to highlight the anchored text,
// show a hover preview, and route clicks back to the sidebar thread.
export type EditorCommentAnchor = {
  id: string;
  quote: string;
  body: string;
  authorLabel: string;
  status: "open" | "resolved";
};

type CommentHoverState = {
  id: string;
  x: number;
  y: number;
};

type RichTextEditorProps = {
  sectionId: string;
  content: string;
  readOnly?: boolean;
  placeholder?: string;
  accentColor?: string;
  density?: "default" | "continuation";
  onChange: (content: string) => void;
  onAddSectionAfter?: (mode: "sibling" | "child") => void;
  // Whether this section can still hold a nested child (its depth is below
  // MAX_SECTION_DEPTH). Gates the "New subsection" slash command so the menu
  // never offers a nesting level the tree can't represent.
  canAddSubsection?: boolean;
  // Promotes the current text selection into a brand-new section placed after
  // this one. When provided, the selection toolbar shows a "Make section"
  // button: the first line of the selection becomes the section name, the rest
  // becomes its body, and the selected text is removed from this section.
  onCreateSectionFromSelection?: (input: { name: string; content?: string }) => void;
  // Workspace members available to @mention from the in-editor comment
  // composer. Only supplied in document mode.
  commentUsers?: WorkspaceUser[];
  // Creates a comment anchored to the current text selection. When provided,
  // the selection toolbar shows a comment button. Resolves once the comment
  // has been persisted so the popup can close.
  onCreateComment?: (input: {
    quote: string;
    body: string;
    mentionedUserIds: string[];
  }) => Promise<void> | void;
  // Enables the selection/comment toolbar while the editor is otherwise
  // read-only. Document-changing transactions remain blocked.
  allowReadOnlyComments?: boolean;
  commentAuthorName?: string;
  onCommentAuthorNameChange?: (value: string) => void;
  requireCommentAuthorName?: boolean;
  // Comments anchored inside this section - painted as highlights and shown on
  // hover. Empty outside document mode.
  comments?: EditorCommentAnchor[];
  // The comment currently focused in the sidebar; its highlight is emphasised
  // and scrolled into view.
  activeCommentId?: string | null;
  // Fired when a highlight is clicked, routing the user to the sidebar thread.
  onSelectComment?: (commentId: string) => void;
  // Enables document/folder references: the `@` search, the "Reference
  // document" slash command, and the inline-chip / full-width-card nodes. Only
  // turned on in the shared document workspace.
  enableReferences?: boolean;
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
  replaceBlock = false
) {
  const targetRange = replaceBlock
    ? {
        from: editor.state.selection.$from.before(editor.state.selection.$from.depth),
        to: editor.state.selection.$from.after(editor.state.selection.$from.depth),
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

  const haystack = [command.title, command.description, ...(command.keywords ?? [])]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function RichTextEditor({
  sectionId,
  content,
  readOnly = false,
  placeholder = "Write something useful for your future agents.",
  accentColor = "#6B7280",
  density = "default",
  onChange,
  onAddSectionAfter,
  canAddSubsection = false,
  onCreateSectionFromSelection,
  commentUsers = [],
  onCreateComment,
  allowReadOnlyComments = false,
  commentAuthorName = "",
  onCommentAuthorNameChange,
  requireCommentAuthorName = false,
  comments = [],
  activeCommentId = null,
  onSelectComment,
  enableReferences = false,
}: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track the most recent HTML we emitted so the content-sync effect can
  // skip the round-trip getHTML() / setContent() when the parent rerenders
  // with the same string we just sent it. Without this every keystroke
  // serializes the entire ProseMirror doc twice.
  const lastEmittedHtmlRef = useRef<string | null>(content);
  // A short history of HTML strings this editor has emitted (or been given as
  // initial content). The content-sync effect uses it to distinguish a genuine
  // external content change from a *stale echo* of our own state - the parent
  // re-rendering with a value we already moved past while an onChange (deferred
  // via startTransition) is still in flight. Applying such an echo would revert
  // a just-inserted node (e.g. a document reference chip) until the transition
  // committed, causing it to flicker/disappear. Bounded so it can't grow.
  const emittedHtmlHistoryRef = useRef<string[]>([content]);
  const slashItemsRef = useRef<SlashCommand[]>([]);
  const slashIndexRef = useRef(0);
  const slashSelectRef = useRef<((item: SlashCommand) => void) | null>(null);
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const mentionItemsRef = useRef<DocumentReferenceEntry[]>([]);
  const mentionIndexRef = useRef(0);
  const mentionSelectRef = useRef<((item: DocumentReferenceEntry) => void) | null>(null);
  const [mentionState, setMentionState] = useState<MentionMenuState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const [tableToolbar, setTableToolbar] = useState<{ x: number; y: number; placeBelow: boolean } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkPicker, setLinkPicker] = useState<
    { url: string; from: number; to: number; x: number; y: number } | null
  >(null);
  const [commentDraft, setCommentDraft] = useState<CommentDraftState | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentHover, setCommentHover] = useState<CommentHoverState | null>(null);
  const commentHoverTimer = useRef<number | null>(null);
  const commentsEnabled = Boolean(onCreateComment);
  const readOnlyCommentsEnabled = readOnly && allowReadOnlyComments && commentsEnabled;
  const commentSelectionEnabled = commentsEnabled && (!readOnly || allowReadOnlyComments);
  const editorEditable = !readOnly || readOnlyCommentsEnabled;
  const router = useRouter();
  // Stable navigation callback handed to the reference node views so a click
  // on a chip / card routes via the SPA router instead of a full page load.
  const openReference = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );
  // External URLs open in a new tab (they are not in-app routes).
  const openUrl = useCallback((url: string) => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);
  // Live editor handle for imperative use inside editorProps callbacks (paste),
  // which run before the `editor` const is assigned.
  const editorRef = useRef<Editor | null>(null);
  // Load the reference index up-front (idempotent) so the `@` menu has data by
  // the time the user opens it.
  useEffect(() => {
    if (enableReferences) {
      void ensureReferenceIndex();
    }
  }, [enableReferences]);
  const editorThemeStyle = useMemo(
    () =>
      ({
        "--section-accent": accentColor,
        "--section-accent-tint": withAlpha(accentColor, 0.11),
        "--section-accent-border": withAlpha(accentColor, 0.12),
        "--section-accent-bar": withAlpha(accentColor, 0.82),
      }) as CSSProperties,
    [accentColor]
  );

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
            .setTextSelection({ from: startPos, to: startPos + placeholder.length })
            .run();
        },
      },
      {
        title: "Heading 2",
        description: "Section heading",
        icon: Heading2,
        keywords: ["heading", "title", "h2"],
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
      },
      {
        title: "Heading 3",
        description: "Subsection heading",
        icon: Heading3,
        keywords: ["heading", "subtitle", "h3"],
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
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
        title: "Tag",
        description: "Inline tag",
        icon: Tag,
        keywords: ["tag", "chip", "label", "hashtag"],
        run: (editor, range) => {
          // Insert a styled placeholder pill with "tag" selected; typing
          // replaces it and inherits the mark (inclusive: true), so the
          // result looks identical whether you used /tag or typed `#`.
          const placeholder = "tag";
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "text",
              text: placeholder,
              marks: [{ type: "creedInlineTag", attrs: { value: placeholder } }],
            })
            .setTextSelection({
              from: range.from,
              to: range.from + placeholder.length,
            })
            .run();
        },
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
            true
          ),
      },
      ...(enableReferences
        ? [
            {
              title: "Reference document",
              description: "Link a document or folder",
              icon: FileText,
              keywords: ["reference", "link", "document", "folder", "mention", "@"],
              run: (editor: Editor, range: Range) => {
                // Delete the slash range and drop an `@` so the reference
                // search menu opens - one code path for `/` and `@`.
                editor.chain().focus().deleteRange(range).insertContent("@").run();
              },
            },
          ]
        : []),
      {
        title: "Mermaid diagram",
        description: "Flow, sequence or graph diagram",
        icon: TreeStructure,
        keywords: ["mermaid", "diagram", "flowchart", "flow", "sequence", "graph", "chart", "visualize", "visualization"],
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).setMermaidBlock().run(),
      },
      {
        title: "Table",
        description: "Rows and columns grid",
        icon: Table,
        keywords: ["table", "grid", "rows", "columns", "spreadsheet", "matrix"],
        run: (editor, range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
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
            true
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
            true
          ),
      },
      {
        title: "New section",
        description: "Add section below",
        icon: PlusSquare,
        keywords: ["new section", "add section", "insert section", "sibling"],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).run();
          onAddSectionAfter?.("sibling");
        },
      },
      ...(canAddSubsection
        ? [
            {
              title: "New subsection",
              description: "Add nested section",
              icon: TreeStructure,
              keywords: ["new subsection", "add subsection", "nested", "child", "indent"],
              run: (editor: Editor, range: Range) => {
                editor.chain().focus().deleteRange(range).run();
                onAddSectionAfter?.("child");
              },
            },
          ]
        : []),
    ],
    [onAddSectionAfter, canAddSubsection, enableReferences]
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

  const updateSlashMenu = useCallback(
    (props: SuggestionProps<SlashCommand, SlashCommand>) => {
    // Keep the ref in sync as the items themselves change - synchronous
    // update before the state setter so handleSlashKeyDown sees the fresh
    // list even if Enter fires inside the same tick.
    slashItemsRef.current = props.items;
    if (readOnly || !containerRef.current || !props.clientRect) {
      setSlashState(null);
      return;
    }

    const clientRect = props.clientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    if (!clientRect) {
      setSlashState(null);
      return;
    }

    const estimatedMenuHeight = Math.min((Math.max(props.items.length, 1) * 64) + 56, 420);
    const viewportBottomSpace = window.innerHeight - clientRect.bottom;
    const placeAbove = viewportBottomSpace < estimatedMenuHeight + 24;

    setSlashState({
      query: props.query,
      items: props.items,
      x: clientRect.left - containerRect.left,
      y: placeAbove
        ? clientRect.top - containerRect.top - 10
        : clientRect.bottom - containerRect.top + 10,
      placeAbove,
      bottomOffset: placeAbove
        ? Math.max(containerRect.height - (clientRect.top - containerRect.top - 10), 0)
        : undefined,
    });
    },
    [readOnly]
  );

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
      setSlashIndex((current) => (current === 0 ? items.length - 1 : current - 1));
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
                commands.filter((command) => matchesSlashCommand(command, query)),
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
                    props.items.length === 0 ? 0 : Math.min(current, props.items.length - 1)
                  );
                  updateSlashMenu(props);
                },
                onKeyDown: (props) => handleSlashKeyDown(props),
                onExit: () => {
                  slashSelectRef.current = null;
                  setSlashIndex(0);
                  setSlashState(null);
                },
              }),
            }),
          ];
        },
      }),
    [commands, updateSlashMenu]
  );

  // ---- Reference `@` search menu ----------------------------------------
  // Mirrors the slash command plumbing but selects a document/folder to embed
  // as an inline chip. Synchronous refs keep Enter picking from the freshest
  // filtered list (see the slash comment above for the race this avoids).
  useEffect(() => {
    mentionIndexRef.current = mentionIndex;
  }, [mentionIndex]);

  const updateMentionMenu = useCallback(
    (props: SuggestionProps<DocumentReferenceEntry, DocumentReferenceEntry>) => {
      mentionItemsRef.current = props.items;
      if (readOnly || !containerRef.current || !props.clientRect) {
        setMentionState(null);
        return;
      }

      const clientRect = props.clientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      if (!clientRect) {
        setMentionState(null);
        return;
      }

      const estimatedMenuHeight = Math.min(Math.max(props.items.length, 1) * 52 + 44, 360);
      const viewportBottomSpace = window.innerHeight - clientRect.bottom;
      const placeAbove = viewportBottomSpace < estimatedMenuHeight + 24;

      setMentionState({
        query: props.query,
        items: props.items,
        x: clientRect.left - containerRect.left,
        y: placeAbove
          ? clientRect.top - containerRect.top - 10
          : clientRect.bottom - containerRect.top + 10,
        placeAbove,
        bottomOffset: placeAbove
          ? Math.max(containerRect.height - (clientRect.top - containerRect.top - 10), 0)
          : undefined,
      });
    },
    [readOnly]
  );

  function handleMentionKeyDown({ event, view }: SuggestionKeyDownProps) {
    const items = mentionItemsRef.current;
    if (!items.length) {
      if (event.key === "Escape") {
        exitSuggestion(view, mentionPluginKey);
        return true;
      }
      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionIndex((current) => (current + 1) % items.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((current) => (current === 0 ? items.length - 1 : current - 1));
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const safeIndex = Math.min(mentionIndexRef.current, items.length - 1);
      const item = items[Math.max(safeIndex, 0)];
      if (item) {
        mentionSelectRef.current?.(item);
      }
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      exitSuggestion(view, mentionPluginKey);
      return true;
    }
    return false;
  }

  function selectMentionItem(item: DocumentReferenceEntry) {
    mentionSelectRef.current?.(item);
  }

  const mentionExtension = useMemo(
    () =>
      Extension.create({
        name: "reference-mention",
        addProseMirrorPlugins() {
          return [
            Suggestion<DocumentReferenceEntry, DocumentReferenceEntry>({
              editor: this.editor,
              pluginKey: mentionPluginKey,
              char: "@",
              allowSpaces: true,
              startOfLine: false,
              items: ({ query }) => searchReferences(query),
              command: ({ editor, range, props }) => {
                // Insert the chip in place of the `@query` and continue typing
                // after it with a trailing space.
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .insertDocReferenceInline({ refKind: props.kind, refSlug: props.slug })
                  .insertContent(" ")
                  .run();
              },
              render: () => ({
                onStart: (props) => {
                  mentionSelectRef.current = props.command;
                  setMentionIndex(0);
                  void ensureReferenceIndex();
                  updateMentionMenu(props);
                },
                onUpdate: (props) => {
                  mentionSelectRef.current = props.command;
                  setMentionIndex((current) =>
                    props.items.length === 0 ? 0 : Math.min(current, props.items.length - 1)
                  );
                  updateMentionMenu(props);
                },
                onKeyDown: (props) => handleMentionKeyDown(props),
                onExit: () => {
                  mentionSelectRef.current = null;
                  setMentionIndex(0);
                  setMentionState(null);
                },
              }),
            }),
          ];
        },
      }),
    [updateMentionMenu]
  );

  // Extensions enabling document/folder references. Registered only in the
  // shared document workspace so the personal-context profile editor stays
  // free of workspace-document coupling.
  const referenceExtensions = useMemo(
    () =>
      enableReferences
        ? [
            DocReferenceInline.configure({ onOpen: openReference }),
            DocReferenceCard.configure({ onOpen: openReference }),
            mentionExtension,
          ]
        : [],
    [enableReferences, openReference, mentionExtension]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: editorEditable,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
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
      InlineTagMark,
      MermaidBlock,
      UrlMentionInline.configure({ onOpen: openUrl }),
      UrlBookmarkCard.configure({ onOpen: openUrl }),
      UrlEmbed.configure({ onOpen: openUrl }),
      TableKit.configure({
        table: {
          resizable: true,
          HTMLAttributes: { class: "creed-table" },
        },
      }),
      CommentHighlight,
      ...(readOnlyCommentsEnabled ? [ReadOnlySelectionGuard] : []),
      slashCommandExtension,
      ...referenceExtensions,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          density === "continuation"
            ? "continuation-editor pb-0 text-[var(--creed-text-primary)]"
            : "pb-2 text-[var(--creed-text-primary)]",
      },
      handleKeyDown: (view, event) => {
        if (readOnly) {
          return false;
        }

        if (event.key !== "Backspace") {
          return false;
        }

        const { state } = view;
        const { selection } = state;

        if (selection instanceof NodeSelection && selection.node.type.name === "horizontalRule") {
          event.preventDefault();
          view.dispatch(state.tr.deleteSelection().scrollIntoView());
          return true;
        }

        if (!selection.empty) {
          return false;
        }

        const { $from } = selection;

        if ($from.depth === 0 || $from.parentOffset !== 0 || !$from.parent.isTextblock) {
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
          state.tr.delete(previousNodeStart, previousNodeStart + previousNode.nodeSize).scrollIntoView()
        );
        return true;
      },
      handlePaste: (view, event) => {
        // Pasting a bare URL (no selection) inserts a plain link and opens a
        // small picker to convert it to a mention / bookmark / embed. Pasting
        // a URL over a selection just links the selection (Notion behaviour).
        if (readOnly) return false;
        const text = event.clipboardData?.getData("text/plain")?.trim();
        if (!text || /\s/.test(text) || !isHttpUrl(text)) return false;
        const instance = editorRef.current;
        if (!instance) return false;

        const { from, empty } = view.state.selection;
        event.preventDefault();

        if (!empty) {
          instance.chain().focus().extendMarkRange("link").setLink({ href: text }).run();
          return true;
        }

        instance
          .chain()
          .focus()
          .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href: text } }] })
          .run();

        const coords = view.coordsAtPos(from);
        setLinkPicker({ url: text, from, to: from + text.length, x: coords.left, y: coords.bottom });
        return true;
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      lastEmittedHtmlRef.current = html;
      const history = emittedHtmlHistoryRef.current;
      history.push(html);
      if (history.length > 8) history.shift();
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

  // Show the in-table controls only while the pointer is over a table, anchored
  // above the table's top-right corner. Uses delegated mouseover/mouseout on
  // the editor DOM (tables are ProseMirror-rendered, not React children) and a
  // short hide delay so the pointer can travel from the table onto the bar.
  const hoveredTableRef = useRef<HTMLElement | null>(null);
  const tableHideTimerRef = useRef<number | null>(null);
  // True while the pointer is over the toolbar itself. Checked when the hide
  // timer fires so the bar never vanishes out from under the cursor even if the
  // editor's mouseleave races ahead of the toolbar's mouseenter.
  const overTableToolbarRef = useRef(false);

  const clearTableHideTimer = useCallback(() => {
    if (tableHideTimerRef.current !== null) {
      window.clearTimeout(tableHideTimerRef.current);
      tableHideTimerRef.current = null;
    }
  }, []);

  const scheduleTableToolbarHide = useCallback(() => {
    clearTableHideTimer();
    tableHideTimerRef.current = window.setTimeout(() => {
      // Don't hide if the pointer is resting on the toolbar (ordering-safe).
      if (overTableToolbarRef.current) return;
      hoveredTableRef.current = null;
      setTableToolbar(null);
    }, 260);
  }, [clearTableHideTimer]);

  const positionTableToolbar = useCallback((tableEl: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const tableRect = tableEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const GAP = 6;
    const spaceAbove = tableRect.top - containerRect.top;
    // Prefer just above the table's top-right. When there isn't room above
    // (table hugs the top of the editor) we inset the bar into the table's
    // top-right corner rather than dropping it below the whole table.
    const inset = spaceAbove < 34;
    setTableToolbar({
      // x is the table's right edge; the bar is translated -100% on X so its
      // right edge lines up there (right-anchored).
      x: tableRect.right - containerRect.left,
      y: inset
        ? tableRect.top - containerRect.top + 4
        : tableRect.top - containerRect.top - GAP,
      placeBelow: inset,
    });
  }, []);

  useEffect(() => {
    if (!editor || readOnly) {
      setTableToolbar(null);
      return;
    }
    const editorDom = editor.view.dom as HTMLElement;

    function locateTable(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof HTMLElement) || !editorDom.contains(target)) return null;
      return target.closest(".tableWrapper, table") as HTMLElement | null;
    }

    function handleOver(event: MouseEvent) {
      const tableEl = locateTable(event.target);
      if (tableEl) {
        clearTableHideTimer();
        // Only recompute + re-render when the hovered table actually changes.
        // mouseover bubbles per element, so without this guard moving within a
        // table fires a getBoundingClientRect + setState storm (the jank).
        if (hoveredTableRef.current === tableEl) return;
        hoveredTableRef.current = tableEl;
        positionTableToolbar(tableEl);
      } else if (hoveredTableRef.current) {
        scheduleTableToolbarHide();
      }
    }

    function handleLeave() {
      scheduleTableToolbarHide();
    }

    editorDom.addEventListener("mouseover", handleOver);
    editorDom.addEventListener("mouseleave", handleLeave);
    return () => {
      editorDom.removeEventListener("mouseover", handleOver);
      editorDom.removeEventListener("mouseleave", handleLeave);
      clearTableHideTimer();
    };
  }, [editor, readOnly, positionTableToolbar, scheduleTableToolbarHide, clearTableHideTimer]);

  // Convert the just-pasted plain link into a mention chip, bookmark card, or
  // full-width embed, replacing the recorded link range.
  function convertPastedLink(form: "mention" | "bookmark" | "embed") {
    const picker = linkPicker;
    const instance = editorRef.current;
    if (!picker || !instance) return;
    const chain = instance
      .chain()
      .focus()
      .deleteRange({ from: picker.from, to: picker.to });
    if (form === "mention") chain.insertUrlMention({ url: picker.url });
    else if (form === "bookmark") chain.insertUrlBookmark({ url: picker.url });
    else chain.insertUrlEmbed({ url: picker.url });
    chain.run();
    setLinkPicker(null);
  }

  function syncSelectionToolbar(currentEditor: Editor) {
    if (readOnly && !commentSelectionEnabled) {
      setSelectionToolbar(null);
      return;
    }

    const { state } = currentEditor;
    const { selection } = state;

    const isNodeSelection = selection instanceof NodeSelection;
    // For an atom node (mermaid, embed, reference card) only the comment and
    // make-section actions apply - text formatting does not. Show the reduced
    // bubble only if one of those actions is actually available.
    const hasNodeAction =
      (!readOnly && Boolean(onCreateSectionFromSelection)) || commentSelectionEnabled;

    // Bail for empty selections, focus loss, and node selections with no
    // applicable action. A live text range shows the full bubble.
    if (
      selection.empty ||
      !currentEditor.isFocused ||
      (isNodeSelection && !hasNodeAction)
    ) {
      setSelectionToolbar(null);
      return;
    }

    const SELECTION_GAP = 8;
    const TOOLBAR_HEIGHT = 36;
    const VIEWPORT_PADDING = 8;
    const VIEWPORT_WIDTH = window.innerWidth;
    const VIEWPORT_HEIGHT = window.innerHeight;

    // Prefer the actual DOM selection rect - it's the union of every line's
    // visual rect, so multi-line selections position correctly. Fall back to
    // ProseMirror coordsAtPos when there's no live DOM selection (rare, but
    // can happen during programmatic chains).
    let rect: DOMRect | null = null;
    const domSelection = window.getSelection();
    if (domSelection && domSelection.rangeCount > 0) {
      const domRect = domSelection.getRangeAt(0).getBoundingClientRect();
      if (domRect.width > 0 || domRect.height > 0) {
        rect = domRect;
      }
    }

    if (!rect) {
      const start = currentEditor.view.coordsAtPos(selection.from);
      const end = currentEditor.view.coordsAtPos(selection.to);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      rect = new DOMRect(left, top, right - left, bottom - top);
    }

    // Centre horizontally on the selection's bounding rect, then clamp so the
    // toolbar never crosses the viewport edge - the rendered element uses a
    // -50% translateX, so x is the centre point.
    const centreX = rect.left + rect.width / 2;
    const placeBelow = rect.top - TOOLBAR_HEIGHT - SELECTION_GAP < VIEWPORT_PADDING;
    const y = placeBelow
      ? Math.min(rect.bottom + SELECTION_GAP, VIEWPORT_HEIGHT - TOOLBAR_HEIGHT - VIEWPORT_PADDING)
      : Math.max(rect.top - SELECTION_GAP, VIEWPORT_PADDING + TOOLBAR_HEIGHT);

    // Clamp X so the toolbar stays fully on-screen even when the selection
    // hugs the left/right edge of the viewport. We assume a 320px max width;
    // the actual element is shorter but this gives a safe margin.
    const HALF_WIDTH = 160;
    const x = Math.max(
      VIEWPORT_PADDING + HALF_WIDTH,
      Math.min(centreX, VIEWPORT_WIDTH - VIEWPORT_PADDING - HALF_WIDTH)
    );

    setSelectionToolbar((prev) => {
      if (
        prev &&
        prev.x === x &&
        prev.y === y &&
        prev.placeBelow === placeBelow &&
        prev.nodeSelection === isNodeSelection
      ) {
        return prev;
      }
      return { x, y, placeBelow, nodeSelection: isNodeSelection };
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

    editor.chain().focus().extendMarkRange("link").setLink({ href: linkDraft.trim() }).run();
    setLinkDialogOpen(false);
  }

  // Promote the current selection into its own section. The first non-empty
  // line becomes the section name; any following lines become the body. The
  // selected text is then removed from this section so it isn't duplicated.
  // Describe the currently-selected atom node (mermaid / embed / bookmark /
  // reference card) for the comment + make-section actions: a human label and
  // the node's HTML (so make-section can move the node into a new section).
  function selectedNodeInfo(): { label: string; html: string } | null {
    if (!editor) return null;
    const selection = editor.state.selection;
    if (!(selection instanceof NodeSelection)) return null;
    const node = selection.node;
    const typeName = node.type.name;
    let label = typeName;
    if (typeName === "mermaidBlock") {
      const source = String(node.attrs.source ?? "");
      label = source.split("\n").map((line) => line.trim()).find(Boolean) || "Mermaid diagram";
    } else if (typeName.startsWith("url")) {
      label = String(node.attrs.url ?? "Link");
    } else if (typeName.startsWith("docReference")) {
      label = String(node.attrs.refSlug ?? "Reference");
    }
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const wrap = document.createElement("div");
    wrap.appendChild(serializer.serializeNode(node));
    return { label, html: wrap.innerHTML };
  }

  function makeSectionFromSelection() {
    if (!editor || readOnly || !onCreateSectionFromSelection) {
      return;
    }
    // Atom node selection (mermaid, embed, reference card): promote the node
    // itself into a new section, using a derived label as the title.
    const nodeInfo = selectedNodeInfo();
    if (nodeInfo) {
      const name =
        nodeInfo.label.length > 120 ? `${nodeInfo.label.slice(0, 117)}...` : nodeInfo.label;
      editor.chain().focus().deleteSelection().run();
      setSelectionToolbar(null);
      onCreateSectionFromSelection({ name, content: nodeInfo.html });
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) {
      return;
    }
    // Split on block boundaries so multi-paragraph selections keep their line
    // structure; each resulting line becomes its own paragraph in the body.
    const selectedText = editor.state.doc.textBetween(from, to, "\n", "\n");
    const lines = selectedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return;
    }

    const [nameLine, ...bodyLines] = lines;
    // Keep the section title to a sensible length even if the user highlighted
    // a long paragraph as the first line.
    const name = nameLine.length > 120 ? `${nameLine.slice(0, 117)}...` : nameLine;
    const content =
      bodyLines.length > 0
        ? bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
        : undefined;

    // Remove the promoted text from the source section, then hand the derived
    // name/body up so the parent can insert the new section after this one.
    editor.chain().focus().deleteSelection().run();
    setSelectionToolbar(null);
    onCreateSectionFromSelection({ name, content });
  }

  function openCommentComposer() {
    if (!editor || !commentSelectionEnabled) {
      return;
    }
    const { from, to } = editor.state.selection;
    const quote =
      editor.state.doc.textBetween(from, to, " ").trim() || selectedNodeInfo()?.label || "";
    if (!quote) {
      return;
    }
    // Reuse the selection toolbar's computed position so the composer opens
    // exactly where the user is looking. Fall back to a centred spot.
    const anchor = selectionToolbar ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      placeBelow: true,
    };
    setCommentBody("");
    setCommentDraft({
      quote,
      x: anchor.x,
      y: anchor.y,
      placeBelow: anchor.placeBelow,
      showAuthorNameInput: requireCommentAuthorName && !commentAuthorName.trim(),
    });
    setSelectionToolbar(null);
  }

  function closeCommentComposer() {
    setCommentDraft(null);
    setCommentBody("");
  }

  async function submitComment() {
    if (
      !commentDraft ||
      !onCreateComment ||
      !commentBody.trim() ||
      (requireCommentAuthorName && !commentAuthorName.trim())
    ) {
      return;
    }
    // Mentions are derived from the body text: any workspace member whose
    // "@Label" appears in the comment is mentioned. The @-autocomplete simply
    // inserts that text, so deleting it un-mentions the person.
    const body = commentBody.trim();
    const mentionedUserIds = commentUsers
      .filter((user) => user.label && body.includes(`@${user.label}`))
      .map((user) => user.id);
    try {
      setSavingComment(true);
      await onCreateComment({
        quote: commentDraft.quote,
        body,
        mentionedUserIds,
      });
      closeCommentComposer();
    } finally {
      setSavingComment(false);
    }
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
    function onBlur() {
      // Defer one frame: clicking a toolbar button blurs the editor briefly,
      // we don't want to dismiss the toolbar before the click resolves.
      window.setTimeout(() => {
        if (editor && !editor.isFocused) {
          setSelectionToolbar(null);
        }
      }, 0);
    }
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor]);

  // Push comment anchors + the active id into the highlight plugin whenever
  // they change. This is a meta-only transaction (no doc change) so it never
  // triggers onChange / a save.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(commentHighlightPluginKey, {
        anchors: comments.map((comment) => ({ id: comment.id, quote: comment.quote })),
        activeId: activeCommentId ?? null,
      })
    );
  }, [editor, comments, activeCommentId]);

  // Hover + click behaviour on comment highlights. Delegated on the editor DOM
  // so it works for every decorated span without per-span listeners.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    function clearHoverTimer() {
      if (commentHoverTimer.current !== null) {
        window.clearTimeout(commentHoverTimer.current);
        commentHoverTimer.current = null;
      }
    }

    function findCommentId(target: EventTarget | null): string | null {
      if (!(target instanceof HTMLElement)) return null;
      const el = target.closest("[data-comment-id]");
      return el?.getAttribute("data-comment-id") ?? null;
    }

    function onOver(event: MouseEvent) {
      const id = findCommentId(event.target);
      if (!id) return;
      const el = (event.target as HTMLElement).closest("[data-comment-id]");
      if (!el) return;
      clearHoverTimer();
      const rect = el.getBoundingClientRect();
      setCommentHover({ id, x: rect.left + rect.width / 2, y: rect.top });
    }

    function onOut(event: MouseEvent) {
      const id = findCommentId(event.target);
      if (!id) return;
      // Give the pointer a moment to reach the hover card before dismissing.
      clearHoverTimer();
      commentHoverTimer.current = window.setTimeout(() => setCommentHover(null), 160);
    }

    function onClick(event: MouseEvent) {
      const id = findCommentId(event.target);
      if (id && onSelectComment) {
        onSelectComment(id);
      }
    }

    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    dom.addEventListener("click", onClick);
    return () => {
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
      dom.removeEventListener("click", onClick);
      clearHoverTimer();
    };
  }, [editor, onSelectComment]);

  // When the sidebar focuses a comment that lives in this section, scroll its
  // highlight into view so selecting a thread navigates to the text.
  useEffect(() => {
    if (!editor || !activeCommentId) return;
    if (!comments.some((comment) => comment.id === activeCommentId)) return;
    const container = containerRef.current;
    if (!container) return;
    const raf = window.requestAnimationFrame(() => {
      const el = container.querySelector(
        `[data-comment-id="${CSS.escape(activeCommentId)}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [editor, activeCommentId, comments]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    // Fast path: the parent re-rendered with the exact string we just emitted -
    // no need to serialize + diff the doc, definitely no need to setContent.
    if (content === lastEmittedHtmlRef.current) {
      editor.setEditable(editorEditable);
      return;
    }

    // Stale echo guard: the parent handed us a value we previously emitted (or
    // our initial content) that is now behind the live document - typically an
    // in-flight onChange from a just-applied edit. Re-applying it would clobber
    // the newer editor state (e.g. delete a reference chip the user just
    // inserted), so treat it as a no-op and let the latest onChange settle.
    if (emittedHtmlHistoryRef.current.includes(content)) {
      editor.setEditable(editorEditable);
      return;
    }

    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
      lastEmittedHtmlRef.current = content;
      const history = emittedHtmlHistoryRef.current;
      history.push(content);
      if (history.length > 8) history.shift();
    }

    editor.setEditable(editorEditable);
  }, [content, editor, editorEditable]);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-creed-readonly={readOnly ? "true" : undefined}
      style={editorThemeStyle}
    >
      <AnimatePresence>
        {editor && selectionToolbar && (!readOnly || commentSelectionEnabled) ? (
          <motion.div
            initial={{ opacity: 0, y: selectionToolbar.placeBelow ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: selectionToolbar.placeBelow ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 text-[var(--creed-text-primary)] shadow-[0_6px_20px_rgba(28,28,26,0.10)]",
              selectionToolbar.placeBelow ? "translate-y-0" : "-translate-y-full"
            )}
            style={{ left: selectionToolbar.x, top: selectionToolbar.y }}
            onMouseDown={(event) => {
              // Prevent the editor from blurring when a toolbar button is
              // clicked - keeps the selection alive so the command applies.
              event.preventDefault();
            }}
          >
            {!readOnly && !selectionToolbar.nodeSelection ? (
              <>
                <ToolbarButton
                  active={editor.isActive("heading", { level: 2 })}
                  disabled={editor.isActive("code") || editor.isActive("codeBlock")}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  label="Heading 2"
                >
                  <Heading2 className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  active={editor.isActive("heading", { level: 3 })}
                  disabled={editor.isActive("code") || editor.isActive("codeBlock")}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  label="Heading 3"
                >
                  <Heading3 className="h-3.5 w-3.5" />
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
                  disabled={editor.isActive("code") || editor.isActive("codeBlock")}
                  onClick={toggleLink}
                  label="Link"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </ToolbarButton>
              </>
            ) : null}
            {!readOnly && onCreateSectionFromSelection ? (
              <>
                {!selectionToolbar.nodeSelection ? <ToolbarDivider /> : null}
                <ToolbarButton
                  onClick={makeSectionFromSelection}
                  label="Make section"
                >
                  <PlusSquare className="h-3.5 w-3.5" />
                </ToolbarButton>
              </>
            ) : null}
            {commentSelectionEnabled ? (
              <>
                {!readOnly && (!selectionToolbar.nodeSelection || onCreateSectionFromSelection) ? (
                  <ToolbarDivider />
                ) : null}
                <ToolbarButton
                  onClick={openCommentComposer}
                  label="Comment"
                >
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                </ToolbarButton>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CommentComposerPopover
        draft={commentDraft}
        body={commentBody}
        authorName={commentAuthorName}
        showAuthorNameInput={commentDraft?.showAuthorNameInput ?? false}
        users={commentUsers}
        saving={savingComment}
        onBodyChange={setCommentBody}
        onAuthorNameChange={onCommentAuthorNameChange}
        onSubmit={() => void submitComment()}
        onClose={closeCommentComposer}
      />

      <CommentHoverCard
        hover={commentHover}
        comment={
          commentHover
            ? comments.find((comment) => comment.id === commentHover.id) ?? null
            : null
        }
        mentionLabels={commentUsers.map((user) => user.label)}
        onOpenThread={(id) => {
          setCommentHover(null);
          onSelectComment?.(id);
        }}
        onPointerEnter={() => {
          if (commentHoverTimer.current !== null) {
            window.clearTimeout(commentHoverTimer.current);
            commentHoverTimer.current = null;
          }
        }}
        onPointerLeave={() => setCommentHover(null)}
      />

      <EditorContent editor={editor} />

      {editor && tableToolbar && !readOnly ? (
        <div
          className="absolute z-10 flex w-max flex-nowrap items-center gap-0.5 whitespace-nowrap rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 text-[var(--creed-text-primary)] shadow-[0_6px_20px_rgba(28,28,26,0.10)]"
          style={{
            left: tableToolbar.x,
            top: tableToolbar.y,
            transform: tableToolbar.placeBelow
              ? "translate(-100%, 0)"
              : "translate(-100%, -100%)",
          }}
          onMouseEnter={() => {
            overTableToolbarRef.current = true;
            clearTableHideTimer();
          }}
          onMouseLeave={() => {
            overTableToolbarRef.current = false;
            scheduleTableToolbarHide();
          }}
          onMouseDown={(event) => {
            // Keep the table cell selection alive when a control is pressed.
            event.preventDefault();
          }}
        >
          {/* Transparent bridge over the gap between the bar and the table so
              moving the pointer from the table onto the controls doesn't cross
              a dead zone and dismiss the toolbar. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-full h-3"
          />
          {/* Bridge above too, for the inset (table-hugs-top) placement. */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-full h-3"
          />
          <TableToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Plus className="h-3.5 w-3.5" />
            Row
          </TableToolbarButton>
          <TableToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Plus className="h-3.5 w-3.5" />
            Column
          </TableToolbarButton>
          <ToolbarDivider />
          <TableToolbarButton onClick={() => editor.chain().focus().deleteRow().run()}>
            <Minus className="h-3.5 w-3.5" />
            Row
          </TableToolbarButton>
          <TableToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()}>
            <Minus className="h-3.5 w-3.5" />
            Column
          </TableToolbarButton>
          <ToolbarDivider />
          <TableToolbarButton onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
            <Table className="h-3.5 w-3.5" />
            Header
          </TableToolbarButton>
          <ToolbarDivider />
          <TableToolbarButton onClick={() => editor.chain().focus().deleteTable().run()}>
            <Delete className="h-3.5 w-3.5" />
            Delete
          </TableToolbarButton>
        </div>
      ) : null}

      {linkPicker && !readOnly ? (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setLinkPicker(null)} />
          <div
            className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 text-[var(--creed-text-primary)] shadow-[0_6px_20px_rgba(28,28,26,0.10)]"
            style={{ left: linkPicker.x, top: linkPicker.y + 6 }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <TableToolbarButton onClick={() => setLinkPicker(null)}>
              <Link2 className="h-3.5 w-3.5" />
              Link
            </TableToolbarButton>
            <TableToolbarButton onClick={() => convertPastedLink("mention")}>
              <AtSign className="h-3.5 w-3.5" />
              Mention
            </TableToolbarButton>
            <TableToolbarButton onClick={() => convertPastedLink("bookmark")}>
              <Bookmark className="h-3.5 w-3.5" />
              Bookmark
            </TableToolbarButton>
            <TableToolbarButton onClick={() => convertPastedLink("embed")}>
              <Embed className="h-3.5 w-3.5" />
              Embed
            </TableToolbarButton>
          </div>
        </>
      ) : null}

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
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
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

      <AnimatePresence>
        {slashState && slashState.items.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute z-30 w-[220px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 shadow-[0_8px_24px_rgba(28,28,26,0.08)]"
            style={{
              left: slashState.x,
              top: slashState.placeAbove ? undefined : slashState.y,
              bottom: slashState.placeAbove ? slashState.bottomOffset : undefined,
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
                  <span className="flex-1 truncate font-medium">{command.title}</span>
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
      </AnimatePresence>

      <AnimatePresence>
        {mentionState && mentionState.items.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute z-30 w-[280px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 shadow-[0_8px_24px_rgba(28,28,26,0.08)]"
            style={{
              left: mentionState.x,
              top: mentionState.placeAbove ? undefined : mentionState.y,
              bottom: mentionState.placeAbove ? mentionState.bottomOffset : undefined,
            }}
          >
            {mentionState.items.map((item, index) => {
              const Icon = item.kind === "folder" ? Folder : FileText;
              const isActive = index === mentionIndex;
              const secondary = item.kind === "folder" ? "Folder" : item.path || "Document";

              return (
                <button
                  key={`${sectionId}-${item.kind}-${item.slug}`}
                  type="button"
                  data-active={isActive}
                  className="editor-command-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--creed-text-primary)] transition-colors duration-100"
                  onMouseEnter={() => setMentionIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMentionItem(item);
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="truncate text-[11px] text-[var(--creed-text-tertiary)]">
                      {secondary}
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
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
        active && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--creed-border)]" />;
}

// Labelled control used by the in-table toolbar. Wider than ToolbarButton so
// the icon-plus-text pairs (e.g. "+ Row" vs "- Row") stay unambiguous.
function TableToolbarButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-100 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
    >
      {children}
    </button>
  );
}

// Anchored popup composer for creating a comment against the current text
// selection. Rendered with `position: fixed` like the selection toolbar so it
// is unaffected by scroll containers or parent transforms. Mentions are typed
// inline with `@` autocomplete; there's no quote preview because the anchored
// text stays highlighted in the document instead.
function CommentComposerPopover({
  draft,
  body,
  authorName,
  showAuthorNameInput,
  users,
  saving,
  onBodyChange,
  onAuthorNameChange,
  onSubmit,
  onClose,
}: {
  draft: CommentDraftState | null;
  body: string;
  authorName: string;
  showAuthorNameInput: boolean;
  users: WorkspaceUser[];
  saving: boolean;
  onBodyChange: (value: string) => void;
  onAuthorNameChange?: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!draft) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, onClose]);

  return (
    <AnimatePresence>
      {draft ? (
        <>
          {/* Click-away scrim - transparent so the document stays visible. */}
          <div className="fixed inset-0 z-40" onMouseDown={onClose} />
          <motion.div
            initial={{ opacity: 0, y: draft.placeBelow ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: draft.placeBelow ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "fixed z-50 w-[320px] max-w-[calc(100vw-16px)] -translate-x-1/2 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 text-[var(--creed-text-primary)] shadow-[0_12px_40px_rgba(28,28,26,0.16)]",
              draft.placeBelow ? "translate-y-2" : "-translate-y-[calc(100%+8px)]"
            )}
            style={{ left: draft.x, top: draft.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {showAuthorNameInput ? (
              <Input
                value={authorName}
                onChange={(event) => onAuthorNameChange?.(event.target.value)}
                placeholder="Your name"
                autoFocus
                className="mb-2 h-9 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px]"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
              />
            ) : null}
            <MentionTextarea
              value={body}
              onChange={onBodyChange}
              users={users}
              placeholder={users.length > 0 ? "Add a comment. Type @ to mention someone." : "Add a comment."}
              autoFocus={!showAuthorNameInput}
              className="min-h-20"
              onSubmit={onSubmit}
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-3 text-[13px]" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-[13px]"
                disabled={saving || !body.trim() || (showAuthorNameInput && !authorName.trim())}
                onClick={onSubmit}
              >
                {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Add comment
              </Button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

// Small hover preview shown when the pointer rests on a comment highlight in
// the document. Clicking it opens the full thread in the sidebar.
function CommentHoverCard({
  hover,
  comment,
  mentionLabels,
  onOpenThread,
  onPointerEnter,
  onPointerLeave,
}: {
  hover: CommentHoverState | null;
  comment: EditorCommentAnchor | null;
  mentionLabels: string[];
  onOpenThread: (id: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  return (
    <AnimatePresence>
      {hover && comment ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="fixed z-50 w-[280px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 text-left shadow-[0_12px_40px_rgba(28,28,26,0.16)]"
          style={{ left: hover.x, top: hover.y }}
          onMouseEnter={onPointerEnter}
          onMouseLeave={onPointerLeave}
          onClick={() => onOpenThread(comment.id)}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--creed-text-primary)]">
              {comment.authorLabel}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                comment.status === "resolved"
                  ? "bg-[#F1F5F9] text-[#475569]"
                  : "bg-[#FEF3C7] text-[#92400E]"
              )}
            >
              {comment.status === "resolved" ? "Resolved" : "Open"}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-[var(--creed-text-secondary)]">
            <MentionText text={comment.body} mentionLabels={mentionLabels} />
          </p>
          <span className="mt-2 inline-block text-[11px] font-medium text-[var(--creed-accent)]">
            Open thread
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
