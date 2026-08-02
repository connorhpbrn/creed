// Tab autocomplete: explicit-invoke ghost text inside the section editor.
//
// Press Tab once at the caret and one suggestion streams in as inline ghost
// text (a decoration, never document content). Tab again accepts it, Escape
// dismisses it, and any other keystroke dismisses it while keeping the key.
// Cmd/Ctrl+ArrowRight accepts one word at a time. Empty sections get a short
// drafted opening instead of a mid-sentence continuation.
//
// The ghost lives entirely in plugin state + decorations, so it can never
// leak into getHTML(), autosave, presence diffs, or proposals. Accepting
// inserts real text through one transaction (one undo step) and flows down
// the normal onChange path.

import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import {
  sanitizeTabCompletion,
  TAB_MAX_AFTER_CHARS,
  TAB_MAX_BEFORE_CHARS,
  type TabMode,
} from "@/lib/ai/tab";

type TabGhostState = {
  status: "idle" | "loading" | "showing";
  pos: number;
  text: string;
  /** Chars of the streamed completion already accepted into the document, so
   * a late streaming update never re-shows what the user already took. */
  consumed: number;
  requestId: number;
};

type TabGhostMeta =
  | { type: "start"; pos: number; requestId: number }
  | { type: "set"; requestId: number; text: string }
  | { type: "accept"; consumed: number }
  | { type: "clear" };

type TabCompleteOptions = {
  /** Section id sent to the completion endpoint. */
  getSectionId: () => string;
  /** True while another suggestion surface (slash menu, # picker) owns Tab. */
  shouldDeferKey: (state: EditorState) => boolean;
};

const IDLE: TabGhostState = {
  status: "idle",
  pos: 0,
  text: "",
  consumed: 0,
  requestId: 0,
};

export const tabCompletePluginKey = new PluginKey<TabGhostState>(
  "creedTabComplete",
);

function buildHintElement() {
  const hint = document.createElement("span");
  hint.className = "creed-tab-hint";
  hint.contentEditable = "false";
  hint.setAttribute("aria-hidden", "true");
  const tabKey = document.createElement("kbd");
  tabKey.textContent = "Tab";
  const tabLabel = document.createElement("span");
  tabLabel.textContent = "accept";
  const escKey = document.createElement("kbd");
  escKey.textContent = "Esc";
  const escLabel = document.createElement("span");
  escLabel.textContent = "dismiss";
  hint.append(tabKey, tabLabel, escKey, escLabel);
  return hint;
}

function buildGhostWidget(text: string) {
  const wrapper = document.createElement("span");
  wrapper.className = "creed-tab-ghost-wrapper";
  wrapper.contentEditable = "false";
  const ghost = document.createElement("span");
  ghost.className = "creed-tab-ghost";
  ghost.textContent = text;
  wrapper.append(ghost, buildHintElement());
  return wrapper;
}

function buildLoadingWidget() {
  const wrapper = document.createElement("span");
  wrapper.className = "creed-tab-ghost-wrapper";
  wrapper.contentEditable = "false";
  const spinner = document.createElement("span");
  spinner.className = "creed-tab-spinner";
  wrapper.append(spinner);
  return wrapper;
}

// The next accept chunk when stepping word by word: leading whitespace plus
// one word, so repeated presses walk the suggestion naturally.
function nextWordChunk(text: string) {
  const match = /^\s*\S+/.exec(text);
  return match ? match[0] : text;
}

export const TabComplete = Extension.create<TabCompleteOptions>({
  name: "tabComplete",

  // Above the default (100) so Tab reaches this handler before the list
  // item's Tab-to-indent keymap. Suggestion menus still win: shouldDeferKey
  // bails out while the slash or # picker is open.
  priority: 1000,

  addOptions() {
    return {
      getSectionId: () => "",
      shouldDeferKey: () => false,
    };
  },

  addProseMirrorPlugins() {
    const { getSectionId, shouldDeferKey } = this.options;
    const editor = this.editor;

    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      // Dev-only arming beacon: one line per page so "is the feature in this
      // bundle / this tab" is answerable from the console in one glance.
      const w = window as Window & { __creedTabArmed?: boolean };
      if (!w.__creedTabArmed) {
        w.__creedTabArmed = true;
        console.info("[creed] tab autocomplete armed");
      }
    }

    // Request lifecycle lives outside plugin state: aborting a fetch is a
    // side effect, and plugin apply() must stay pure.
    let abortController: AbortController | null = null;
    let requestSeq = 0;
    let destroyed = false;

    const abortInFlight = () => {
      abortController?.abort();
      abortController = null;
    };

    const dispatchMeta = (view: EditorView, meta: TabGhostMeta) => {
      if (destroyed || view.isDestroyed) return;
      view.dispatch(view.state.tr.setMeta(tabCompletePluginKey, meta));
    };

    const clearGhost = (view: EditorView) => {
      abortInFlight();
      const state = tabCompletePluginKey.getState(view.state);
      if (state && state.status !== "idle") {
        dispatchMeta(view, { type: "clear" });
      }
    };

    const acceptChunk = (view: EditorView, chunk: string) => {
      const state = tabCompletePluginKey.getState(view.state);
      if (!state || state.status !== "showing" || !chunk) return;
      const tr = view.state.tr.insertText(chunk, state.pos);
      tr.setMeta(tabCompletePluginKey, {
        type: "accept",
        consumed: chunk.length,
      } satisfies TabGhostMeta);
      tr.setSelection(TextSelection.create(tr.doc, state.pos + chunk.length));
      tr.scrollIntoView();
      view.dispatch(tr);
      // The whole suggestion was consumed; stop paying for the tail.
      const next = tabCompletePluginKey.getState(view.state);
      if (!next || next.status === "idle") abortInFlight();
    };

    const invoke = (view: EditorView) => {
      abortInFlight();
      const requestId = ++requestSeq;
      const { doc, selection } = view.state;
      const pos = selection.from;
      const before = doc.textBetween(0, pos, "\n", "\n");
      const after = doc.textBetween(pos, doc.content.size, "\n", "\n");
      const mode: TabMode = doc.textContent.trim() ? "complete" : "draft";

      dispatchMeta(view, { type: "start", pos, requestId });

      const controller = new AbortController();
      abortController = controller;

      void (async () => {
        let shown = false;
        try {
          const response = await fetch("/api/app/ai/tab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sectionId: getSectionId(),
              before: before.slice(-TAB_MAX_BEFORE_CHARS),
              after: after.slice(0, TAB_MAX_AFTER_CHARS),
              mode,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            let message = "That didn't go through. Try again.";
            try {
              const body = (await response.json()) as { error?: string };
              if (body.error) message = body.error;
            } catch {
              // Keep the fallback message.
            }
            if (requestId === requestSeq) {
              dispatchMeta(view, { type: "clear" });
              toast.error(message);
            }
            return;
          }

          if (!response.body) return;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let raw = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (requestId !== requestSeq) {
              void reader.cancel();
              return;
            }
            raw += decoder.decode(value, { stream: true });
            const text = sanitizeTabCompletion(raw, before);
            if (text) {
              shown = true;
              dispatchMeta(view, { type: "set", requestId, text });
            }
            // A single block is the contract: once the model starts a new
            // line, everything useful has arrived.
            if (raw.includes("\n")) {
              void reader.cancel();
              break;
            }
          }
          raw += decoder.decode();
          if (requestId !== requestSeq) return;
          const text = sanitizeTabCompletion(raw, before);
          if (text) {
            dispatchMeta(view, { type: "set", requestId, text });
          } else if (!shown) {
            // Nothing usable came back; return to idle without ceremony.
            dispatchMeta(view, { type: "clear" });
          }
        } catch (error) {
          if (controller.signal.aborted || requestId !== requestSeq) return;
          dispatchMeta(view, { type: "clear" });
          if (error instanceof Error && error.name !== "AbortError") {
            toast.error("That suggestion didn't load. Try again.");
          }
        } finally {
          if (abortController === controller) abortController = null;
        }
      })();
    };

    return [
      new Plugin<TabGhostState>({
        key: tabCompletePluginKey,
        state: {
          init: () => IDLE,
          apply: (tr, value) => {
            const meta = tr.getMeta(tabCompletePluginKey) as
              | TabGhostMeta
              | undefined;
            if (meta) {
              if (meta.type === "start") {
                return {
                  status: "loading",
                  pos: meta.pos,
                  text: "",
                  consumed: 0,
                  requestId: meta.requestId,
                };
              }
              if (meta.type === "set") {
                if (value.status === "idle" || value.requestId !== meta.requestId) {
                  return value;
                }
                // meta.text is the full completion so far; show only what the
                // user hasn't accepted yet.
                const text = meta.text.slice(value.consumed);
                if (!text) return value;
                return { ...value, status: "showing", text };
              }
              if (meta.type === "accept") {
                if (value.status !== "showing") return value;
                const remaining = value.text.slice(meta.consumed);
                const consumed = value.consumed + meta.consumed;
                if (!remaining) return { ...IDLE, consumed, requestId: value.requestId };
                return {
                  ...value,
                  pos: value.pos + meta.consumed,
                  consumed,
                  text: remaining,
                };
              }
              return IDLE;
            }

            if (value.status === "idle") return value;
            // Any outside document change (typing, undo, an external sync
            // landing through setContent) invalidates the ghost.
            if (tr.docChanged) return IDLE;
            // Moving the caret away orphans the ghost; dismiss it.
            if (tr.selectionSet && tr.selection.from !== value.pos) return IDLE;
            return value;
          },
        },
        view: () => ({
          update: (view, prevState) => {
            // Abort the fetch whenever something other than our own meta
            // (typing, caret moves, external sync) cleared the ghost.
            const prev = tabCompletePluginKey.getState(prevState);
            const next = tabCompletePluginKey.getState(view.state);
            if (prev && next && prev.status !== "idle" && next.status === "idle") {
              abortInFlight();
            }
          },
          destroy: () => {
            destroyed = true;
            abortInFlight();
          },
        }),
        props: {
          decorations(state) {
            const ghost = tabCompletePluginKey.getState(state);
            if (!ghost || ghost.status === "idle") return null;
            const widget = Decoration.widget(
              ghost.pos,
              ghost.status === "loading"
                ? buildLoadingWidget
                : () => buildGhostWidget(ghost.text),
              { side: 1, key: `tab-ghost-${ghost.requestId}-${ghost.status}-${ghost.text.length}` },
            );
            const decorations = [widget];
            // Suppress the empty-editor placeholder while a ghost occupies
            // the first paragraph, so the two never overlap.
            const $pos = state.doc.resolve(ghost.pos);
            if ($pos.parent.isTextblock && $pos.parent.content.size === 0) {
              decorations.push(
                Decoration.node(
                  $pos.before($pos.depth),
                  $pos.after($pos.depth),
                  { class: "has-tab-ghost" },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
          handleKeyDown(view, event) {
            const ghost = tabCompletePluginKey.getState(view.state);
            if (!ghost) return false;

            if (event.key === "Escape") {
              if (ghost.status === "idle") return false;
              event.preventDefault();
              clearGhost(view);
              return true;
            }

            if (
              event.key === "ArrowRight" &&
              (event.metaKey || event.ctrlKey) &&
              !event.shiftKey &&
              !event.altKey
            ) {
              if (ghost.status !== "showing") return false;
              event.preventDefault();
              acceptChunk(view, nextWordChunk(ghost.text));
              return true;
            }

            if (event.key !== "Tab" || event.shiftKey) return false;
            if (!view.editable) return false;
            // The slash menu and # picker own Tab while open.
            if (shouldDeferKey(view.state)) return false;

            if (ghost.status === "showing") {
              event.preventDefault();
              acceptChunk(view, ghost.text);
              return true;
            }
            if (ghost.status === "loading") {
              // Swallow a double press instead of firing a second request.
              event.preventDefault();
              return true;
            }

            // Idle: Tab completes even inside lists (Creed bodies are mostly
            // bullets). Native list indentation keeps Tab only at the very
            // start of an item, the classic indent position; Shift-Tab
            // outdents everywhere as usual.
            if (
              view.state.selection.$from.parentOffset === 0 &&
              editor.can().sinkListItem("listItem")
            ) {
              return false;
            }
            // Composition and range selections are too ambiguous to complete.
            if (view.composing) return false;
            event.preventDefault();
            if (!view.state.selection.empty) return true;
            invoke(view);
            return true;
          },
          handleDOMEvents: {
            blur: (view) => {
              clearGhost(view);
              return false;
            },
          },
        },
      }),
    ];
  },
});
