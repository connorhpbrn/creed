import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

// In-house Notion-style block drag handle + gutter block selection.
//
// Why in-house: the official `@tiptap/extension-drag-handle` carries
// `@tiptap/extension-collaboration` + `@tiptap/y-tiptap` (yjs) as peer
// dependencies, which would pull the whole collaboration/yjs stack into a
// non-collaborative editor. This is a self-contained ProseMirror plugin in the
// same spirit as the slash-command and comment-highlight extensions here - no
// new dependencies.
//
// Behaviour (mirrors Notion):
// - Moving the pointer anywhere on a block's row - including the left gutter -
//   reveals a six-dot grip in the gutter, aligned to that block.
// - Clicking the grip selects the whole block (NodeSelection - a clean accent
//   wash via `.ProseMirror-selectednode` in globals.css, no outline).
// - Press-dragging in the left gutter (outside any block) selects a contiguous
//   range of whole blocks: the selection spans whole blocks and is painted as a
//   per-block wash ("block mode") with the native text-selection highlight
//   suppressed, so you get Notion's block selection rather than a text drag.
//   Selecting text inside a block still behaves normally.
// - Dragging the grip reorders the block, or the whole block selection when the
//   grip's block is part of it.

const blockDragHandleKey = new PluginKey<BlockHandleState>("creedBlockDragHandle");

type BlockHandleState = { blockMode: boolean };

// Width of the gutter band (px, left of the text column) that still counts as
// hovering a block. Keeps the grip reachable without covering the text.
const GUTTER_BAND = 96;

// Six-dot (2x3) grip, matching the calm monochrome UI. Rendered as inline SVG
// so the handle stays dependency-free and themes through `currentColor`.
const GRIP_SVG = `
<svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
  <circle cx="3.25" cy="3.25" r="1.35" fill="currentColor" />
  <circle cx="8.75" cy="3.25" r="1.35" fill="currentColor" />
  <circle cx="3.25" cy="8" r="1.35" fill="currentColor" />
  <circle cx="8.75" cy="8" r="1.35" fill="currentColor" />
  <circle cx="3.25" cy="12.75" r="1.35" fill="currentColor" />
  <circle cx="8.75" cy="12.75" r="1.35" fill="currentColor" />
</svg>`;

// Resolve the position immediately before the top-level block whose DOM node is
// `dom`. Returns null when the position can't be resolved (e.g. the node was
// removed between hover and drag).
function topLevelPosForDom(view: EditorView, dom: HTMLElement): number | null {
  try {
    const inside = view.posAtDOM(dom, 0);
    if (inside < 0) return null;
    const $pos = view.state.doc.resolve(inside);
    if ($pos.depth === 0) return Math.max(0, inside - 1);
    return $pos.before(1);
  } catch {
    return null;
  }
}

// The top-level block DOM element whose vertical band contains `clientY`. Using
// the Y axis (rather than the exact point) means the grip appears when the
// pointer is anywhere on the block's row, including the left gutter - exactly
// how Notion behaves.
function blockDomAtY(view: EditorView, clientY: number): HTMLElement | null {
  const children = Array.from(view.dom.children) as HTMLElement[];
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (clientY >= rect.top - 2 && clientY <= rect.bottom + 2) return child;
  }
  return null;
}

export const BlockDragHandle = Extension.create({
  name: "creedBlockDragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin<BlockHandleState>({
        key: blockDragHandleKey,

        state: {
          init: () => ({ blockMode: false }),
          apply(tr, value) {
            const meta = tr.getMeta(blockDragHandleKey) as
              | { blockMode: boolean }
              | undefined;
            if (meta) return { blockMode: meta.blockMode };
            // Any ordinary selection change (click, arrow keys) or content edit
            // exits block mode so the wash doesn't linger.
            if (tr.selectionSet || tr.docChanged) return { blockMode: false };
            return value;
          },
        },

        props: {
          // Paint a clean per-block wash over every top-level block the block
          // selection covers. Only active in block mode (gutter drag); ordinary
          // text selection is untouched.
          decorations(state) {
            const pluginState = blockDragHandleKey.getState(state);
            if (!pluginState?.blockMode) return DecorationSet.empty;
            const { from, to } = state.selection;
            if (from === to) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            state.doc.forEach((node, offset) => {
              const start = offset;
              const end = offset + node.nodeSize;
              if (from < end && to > start) {
                decorations.push(
                  Decoration.node(start, end, { class: "creed-block-selected" })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },

        view(editorView) {
          const handle = document.createElement("div");
          handle.className = "creed-drag-handle";
          handle.setAttribute("draggable", "true");
          handle.setAttribute("contenteditable", "false");
          handle.setAttribute("role", "button");
          handle.setAttribute("aria-label", "Drag to move block, click to select");
          handle.innerHTML = GRIP_SVG;
          handle.style.display = "none";
          document.body.appendChild(handle);

          let current: HTMLElement | null = null;
          let hideTimer: number | null = null;
          let rafId: number | null = null;

          // Gutter block-range selection state.
          let rangeAnchor: HTMLElement | null = null;
          let rangeSelecting = false;

          const cancelHide = () => {
            if (hideTimer !== null) {
              window.clearTimeout(hideTimer);
              hideTimer = null;
            }
          };

          const hide = () => {
            cancelHide();
            current = null;
            handle.style.display = "none";
          };

          const scheduleHide = () => {
            cancelHide();
            hideTimer = window.setTimeout(hide, 200);
          };

          const position = (dom: HTMLElement) => {
            const rect = dom.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
              hide();
              return;
            }
            const lineHeightRaw = parseFloat(getComputedStyle(dom).lineHeight);
            const firstLine = Number.isFinite(lineHeightRaw)
              ? Math.min(lineHeightRaw, rect.height)
              : Math.min(rect.height, 28);
            const handleHeight = 24;
            const gap = 6;
            const width = handle.offsetWidth || 18;
            handle.style.display = "flex";
            handle.style.top = `${Math.round(rect.top + firstLine / 2 - handleHeight / 2)}px`;
            handle.style.left = `${Math.round(Math.max(4, rect.left - width - gap))}px`;
          };

          const showFor = (dom: HTMLElement) => {
            current = dom;
            position(dom);
          };

          const editorHitBounds = () => {
            const rect = editorView.dom.getBoundingClientRect();
            const scroller = editorView.dom.closest<HTMLElement>(
              "[data-file-export-scroll]"
            );
            const scrollerRect = scroller?.getBoundingClientRect();
            return {
              rect,
              left: scrollerRect?.left ?? rect.left - GUTTER_BAND,
              right: scrollerRect?.right ?? rect.right + GUTTER_BAND,
            };
          };

          const withinBand = (clientX: number, clientY: number) => {
            const { rect, left, right } = editorHitBounds();
            return (
              clientY >= rect.top &&
              clientY <= rect.bottom &&
              clientX >= left &&
              clientX <= right
            );
          };

          const onDocMouseMove = (event: MouseEvent) => {
            if (!editorView.editable) return;
            if (rangeSelecting) return;
            if (rafId !== null) return;
            const { clientX, clientY } = event;
            rafId = window.requestAnimationFrame(() => {
              rafId = null;
              if (!withinBand(clientX, clientY)) {
                scheduleHide();
                return;
              }
              const dom = blockDomAtY(editorView, clientY);
              if (dom) {
                cancelHide();
                if (current !== dom) showFor(dom);
                else position(dom);
              } else {
                scheduleHide();
              }
            });
          };

          // --- Gutter block-range selection --------------------------------

          const selectBlockRange = (aDom: HTMLElement, bDom: HTMLElement) => {
            const aPos = topLevelPosForDom(editorView, aDom);
            const bPos = topLevelPosForDom(editorView, bDom);
            if (aPos === null || bPos === null) return;
            const aNode = editorView.state.doc.nodeAt(aPos);
            const bNode = editorView.state.doc.nodeAt(bPos);
            if (!aNode || !bNode) return;
            const startBefore = Math.min(aPos, bPos);
            const endAfter = Math.max(aPos + aNode.nodeSize, bPos + bNode.nodeSize);
            const from = Math.min(startBefore + 1, editorView.state.doc.content.size);
            const to = Math.max(0, endAfter - 1);
            try {
              const selection = TextSelection.create(editorView.state.doc, from, to);
              editorView.dispatch(
                editorView.state.tr
                  .setSelection(selection)
                  .setMeta(blockDragHandleKey, { blockMode: true })
              );
            } catch {
              // Ignore invalid ranges (e.g. atom-only blocks).
            }
          };

          const onDocMouseDown = (event: MouseEvent) => {
            if (!editorView.editable) return;
            if (event.button !== 0) return;
            if (event.target === handle || handle.contains(event.target as Node)) return;
            const { rect, left, right } = editorHitBounds();
            // The gutter is the whole empty strip to the LEFT of the text,
            // or RIGHT of it, bounded by the document scroll area so we never
            // reach into the app nav. Starting a drag there selects blocks;
            // starting on the text selects text (Notion behaviour).
            const inGutter =
              (event.clientX < rect.left || event.clientX > rect.right) &&
              event.clientX >= left &&
              event.clientX <= right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom;
            if (!inGutter) return;
            const dom = blockDomAtY(editorView, event.clientY);
            if (!dom) return;
            event.preventDefault();
            editorView.focus();
            rangeAnchor = dom;
            rangeSelecting = true;
            selectBlockRange(dom, dom);
          };

          const onDocMouseMoveRange = (event: MouseEvent) => {
            if (!rangeSelecting || !rangeAnchor) return;
            const dom = blockDomAtY(editorView, event.clientY);
            if (dom) selectBlockRange(rangeAnchor, dom);
          };

          const onDocMouseUp = () => {
            rangeSelecting = false;
            rangeAnchor = null;
          };

          // --- Handle click + drag -----------------------------------------

          const onHandleClick = (event: MouseEvent) => {
            event.preventDefault();
            if (!current) return;
            const pos = topLevelPosForDom(editorView, current);
            if (pos === null) return;
            const node = editorView.state.doc.nodeAt(pos);
            if (!node) return;
            editorView.focus();
            editorView.dispatch(
              editorView.state.tr.setSelection(
                NodeSelection.create(editorView.state.doc, pos)
              )
            );
          };

          const onHandleDragStart = (event: DragEvent) => {
            if (!current || !event.dataTransfer) return;
            const pos = topLevelPosForDom(editorView, current);
            if (pos === null) return;
            const node = editorView.state.doc.nodeAt(pos);
            if (!node) return;

            // If the grip's block sits inside an existing (multi-block)
            // selection, drag the whole selection; otherwise select just this
            // block.
            const sel = editorView.state.selection;
            const blockInsideSelection =
              !sel.empty && sel.from <= pos + 1 && sel.to >= pos + node.nodeSize - 1;
            if (!blockInsideSelection) {
              editorView.dispatch(
                editorView.state.tr.setSelection(
                  NodeSelection.create(editorView.state.doc, pos)
                )
              );
            }

            const slice = editorView.state.selection.content();
            editorView.dragging = { slice, move: true };

            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.textContent || " ");
            const dom = editorView.nodeDOM(pos);
            if (dom instanceof HTMLElement) {
              event.dataTransfer.setDragImage(dom, 0, 0);
            }
            handle.classList.add("is-dragging");
          };

          const onHandleDragEnd = () => {
            handle.classList.remove("is-dragging");
            hide();
          };

          const onHandleMouseEnter = () => cancelHide();
          const onHandleMouseLeave = () => scheduleHide();
          const onScroll = () => hide();

          document.addEventListener("mousemove", onDocMouseMove);
          document.addEventListener("mousedown", onDocMouseDown, true);
          document.addEventListener("mousemove", onDocMouseMoveRange, true);
          document.addEventListener("mouseup", onDocMouseUp, true);
          handle.addEventListener("click", onHandleClick);
          handle.addEventListener("dragstart", onHandleDragStart);
          handle.addEventListener("dragend", onHandleDragEnd);
          handle.addEventListener("mouseenter", onHandleMouseEnter);
          handle.addEventListener("mouseleave", onHandleMouseLeave);
          window.addEventListener("scroll", onScroll, true);
          window.addEventListener("resize", onScroll);

          return {
            update() {
              // Toggle the class that suppresses the native text-selection
              // highlight while a block selection is active.
              const pluginState = blockDragHandleKey.getState(editorView.state);
              editorView.dom.classList.toggle(
                "creed-block-selecting",
                Boolean(pluginState?.blockMode)
              );
              // Keep the grip aligned when the document reflows while hovered.
              if (current && handle.style.display !== "none") {
                if (editorView.dom.contains(current)) position(current);
                else hide();
              }
            },
            destroy() {
              cancelHide();
              if (rafId !== null) window.cancelAnimationFrame(rafId);
              editorView.dom.classList.remove("creed-block-selecting");
              document.removeEventListener("mousemove", onDocMouseMove);
              document.removeEventListener("mousedown", onDocMouseDown, true);
              document.removeEventListener("mousemove", onDocMouseMoveRange, true);
              document.removeEventListener("mouseup", onDocMouseUp, true);
              handle.removeEventListener("click", onHandleClick);
              handle.removeEventListener("dragstart", onHandleDragStart);
              handle.removeEventListener("dragend", onHandleDragEnd);
              handle.removeEventListener("mouseenter", onHandleMouseEnter);
              handle.removeEventListener("mouseleave", onHandleMouseLeave);
              window.removeEventListener("scroll", onScroll, true);
              window.removeEventListener("resize", onScroll);
              handle.remove();
            },
          };
        },
      }),
    ];
  },
});
