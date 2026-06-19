"use client";

import { getMarkRange, InputRule, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

const PLACEHOLDER = "tag";

// Inline tag mark - renders as <span class="creed-inline-tag" data-tag="value">.
// Used to embed Obsidian-style #tags inline in any rich-text paragraph.
export const InlineTagMark = Mark.create({
  name: "creedInlineTag",
  // Inclusive so typing over the selected placeholder (or at the end of the
  // mark) keeps extending the tag rather than dropping back to plain text.
  inclusive: true,
  spanning: false,

  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-tag") ?? element.textContent ?? "",
        renderHTML: (attributes) => ({
          "data-tag": attributes.value || "",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.creed-inline-tag",
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          return {
            value: node.getAttribute("data-tag") ?? node.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "creed-inline-tag" }),
      0,
    ];
  },

  // Type `#` at a word boundary → start an inline tag pill with a selected
  // "tag" placeholder. Typing replaces it; the mark stays on the new text
  // (inclusive: true) so users see a styled tag the moment they start one.
  addInputRules() {
    return [
      new InputRule({
        find: /(^|\s)#$/,
        handler: ({ range, match, chain }) => {
          const lead = match[1] ?? "";
          const hashStart = range.from + lead.length;
          const hashEnd = hashStart + 1;
          chain()
            .deleteRange({ from: hashStart, to: hashEnd })
            .insertContentAt(hashStart, {
              type: "text",
              text: PLACEHOLDER,
              marks: [{ type: this.name, attrs: { value: PLACEHOLDER } }],
            })
            .setTextSelection({ from: hashStart, to: hashStart + PLACEHOLDER.length })
            .run();
        },
      }),
    ];
  },

  // Pressing Space at the end of an inline tag exits it: the trailing space
  // is inserted without the mark, and the mark's data-tag attribute is
  // synced to the current text content so it persists correctly.
  addProseMirrorPlugins() {
    const markName = this.name;
    return [
      new Plugin({
        key: new PluginKey("creedInlineTagExit"),
        props: {
          handleKeyDown: (view, event) => {
            const isSpace = event.key === " " || event.key === "Spacebar";
            const isLeft = event.key === "ArrowLeft";
            const isRight = event.key === "ArrowRight";
            if (!isSpace && !isLeft && !isRight) return false;

            const { state } = view;
            const { selection, schema, doc } = state;
            if (!selection.empty) return false;
            const markType = schema.marks[markName];
            if (!markType) return false;
            const $pos = selection.$from;
            if (!markType.isInSet($pos.marks())) return false;

            const range = getMarkRange($pos, markType);
            if (!range) return false;

            // Marks at a position with the tag stripped - lets us drop the
            // caret "outside" the inclusive tag so typing reads as plain text.
            const marksWithoutTag = (pos: number) =>
              doc
                .resolve(pos)
                .marks()
                .filter((mark) => mark.type !== markType);

            // Arrow keys escape the tag: Left pops the caret out just before
            // it, Right just after it, dropping the inclusive tag mark so the
            // next keystroke is plain text rather than extending the chip.
            if (isLeft) {
              view.dispatch(
                state.tr
                  .setSelection(TextSelection.create(doc, range.from))
                  .setStoredMarks(marksWithoutTag(range.from))
              );
              event.preventDefault();
              return true;
            }

            if (isRight) {
              // Mid-tag: jump to the trailing edge and escape. Already at the
              // trailing edge with text after the tag: let the default arrow
              // move into that text. Only escape in place at the very end of a
              // block (a trailing tag with nothing after it).
              if ($pos.pos === range.to) {
                if ($pos.pos !== $pos.end()) return false;
                view.dispatch(state.tr.setStoredMarks(marksWithoutTag(range.to)));
                event.preventDefault();
                return true;
              }
              view.dispatch(
                state.tr
                  .setSelection(TextSelection.create(doc, range.to))
                  .setStoredMarks(marksWithoutTag(range.to))
              );
              event.preventDefault();
              return true;
            }

            // Only exit on Space when the cursor sits at the end of the mark.
            if ($pos.pos !== range.to) return false;

            const text = doc.textBetween(range.from, range.to, "", "").trim();
            if (!text) return false;

            const tr = state.tr;
            const newMark = markType.create({ value: text });
            tr.removeMark(range.from, range.to, markType);
            tr.addMark(range.from, range.to, newMark);
            tr.insertText(" ", range.to);
            tr.setSelection(TextSelection.create(tr.doc, range.to + 1));
            tr.setStoredMarks([]);
            view.dispatch(tr);
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
