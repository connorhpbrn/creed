"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { X } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chipRow: {
      insertChipRow: (chips?: string[]) => ReturnType;
    };
  }
}

export const ChipRowNode = Node.create({
  name: "chipRow",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      chips: {
        default: ["Next.js", "TypeScript", "Tiptap"],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-chips");
          return raw ? raw.split("|").filter(Boolean) : ["Next.js", "TypeScript", "Tiptap"];
        },
        renderHTML: (attributes) => ({
          "data-chips": (attributes.chips as string[]).join("|"),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chip-row"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "chip-row",
        class: "chip-row-node",
      }),
    ];
  },

  addCommands() {
    return {
      insertChipRow:
        (chips = ["Next.js", "TypeScript", "Tiptap"]) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              chips,
            },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChipRowView);
  },
});

function ChipRowView({ node, updateAttributes, editor }: NodeViewProps) {
  const chips = ((node.attrs.chips as string[]) ?? []).filter(Boolean);
  const isEditable = editor.isEditable;

  function addChip(value: string) {
    const next = value.trim();

    if (!next) {
      return;
    }

    updateAttributes({
      chips: [...chips, next],
    });
  }

  function removeChip(target: string) {
    updateAttributes({
      chips: chips.filter((chip) => chip !== target),
    });
  }

  return (
    <NodeViewWrapper className="chip-row-node font-sans">
      <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-background)] p-4 font-sans">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium"
              style={{
                backgroundColor: "var(--section-accent-tint, var(--creed-surface-raised))",
                color: "var(--section-accent, var(--creed-text-primary))",
              }}
            >
              {chip}
              {isEditable ? (
                <button
                  type="button"
                  onClick={() => removeChip(chip)}
                  className="rounded-full transition-opacity hover:opacity-75"
                  style={{ color: "inherit" }}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}

          {isEditable ? (
            <input
              type="text"
              placeholder="Add tag"
              className="h-9 min-w-[120px] rounded-full border border-dashed border-[var(--creed-border-strong)] bg-[var(--creed-surface)] px-3 font-sans text-[12px] text-[var(--creed-text-primary)] outline-none placeholder:text-[var(--creed-text-tertiary)]"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addChip(event.currentTarget.value);
                  event.currentTarget.value = "";
                }

                if (event.key === "Backspace" && !event.currentTarget.value && chips.length) {
                  removeChip(chips[chips.length - 1]);
                }
              }}
              onBlur={(event) => {
                addChip(event.currentTarget.value);
                event.currentTarget.value = "";
              }}
            />
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
