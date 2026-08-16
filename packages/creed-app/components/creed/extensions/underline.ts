import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    creedUnderline: {
      toggleUnderline: () => ReturnType;
    };
  }
}

export const CreedUnderline = Mark.create({
  name: "underline",

  parseHTML() {
    return [{ tag: "u" }, { style: "text-decoration=underline" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["u", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleUnderline:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
