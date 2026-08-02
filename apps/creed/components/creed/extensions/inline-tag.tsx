"use client";

import { getMarkRange, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

export type SectionTagTarget = {
  id: string;
  name: string;
  accent?: string;
};

function normalizeTagValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_-]+/g, "");
}

function findSectionTagTarget(
  rawValue: string,
  targets: SectionTagTarget[],
) {
  const normalized = normalizeTagValue(rawValue);
  if (!normalized) return null;

  return (
    targets.find(
      (target) =>
        normalizeTagValue(target.id) === normalized ||
        normalizeTagValue(target.name) === normalized,
    ) ?? null
  );
}

// Inline tag mark - renders as <span class="creed-inline-tag" data-tag="value">.
// Used for section references only. Freeform hashtags stay plain text.
export const InlineTagMark = Mark.create({
  name: "creedInlineTag",
  inclusive: false,
  spanning: false,

  addOptions() {
    return {
      targets: [] as SectionTagTarget[],
      getTargets: null as (() => SectionTagTarget[]) | null,
    };
  },

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

  addProseMirrorPlugins() {
    const markName = this.name;
    const getTargets = this.options.getTargets;
    const targets = this.options.targets;
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

            if (isSpace && !markType.isInSet($pos.marks())) {
              const textBeforeCursor = $pos.parent.textBetween(0, $pos.parentOffset, "", "");
              const match = textBeforeCursor.match(/(^|\s)#([A-Za-z0-9_-]+)$/);
              if (!match) return false;

              const target = findSectionTagTarget(
                match[2] ?? "",
                getTargets?.() ?? targets,
              );
              if (!target) return false;

              const leadLength = match[1]?.length ?? 0;
              const tokenLength = match[0].length - leadLength;
              const from = $pos.pos - tokenLength;
              const to = $pos.pos;
              const tr = state.tr;
              tr.replaceWith(
                from,
                to,
                schema.text(target.name, [
                  markType.create({ value: target.id }),
                ]),
              );
              tr.insertText(" ", from + target.name.length);
              tr.setSelection(TextSelection.create(tr.doc, from + target.name.length + 1));
              tr.setStoredMarks([]);
              view.dispatch(tr);
              event.preventDefault();
              return true;
            }

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
