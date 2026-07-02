"use client";

import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

// Mermaid diagram block.
//
// Stored in the document as a fenced ```mermaid code block (see
// lib/rich-text.ts markdownToRichHtml and lib/creed-data.ts sectionToMarkdown),
// so it round-trips through Markdown and renders natively on GitHub after a
// publish. In the editor it renders as a live SVG via the `mermaid` package,
// with an inline source editor toggled from the block itself.
//
// The node is an atom: its Mermaid source lives in the `source` attribute and
// is serialized as the text child of `<pre data-type="mermaid"><code>`. There
// is no editable ProseMirror content inside the node; editing happens through
// the node view's textarea, which commits back into the attribute.

const DEFAULT_SOURCE = [
  "flowchart TD",
  "    A[Start] --> B{Decision}",
  "    B -->|Yes| C[Do the thing]",
  "    B -->|No| D[Stop]",
].join("\n");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      /** Insert a Mermaid diagram block. Falls back to a starter diagram. */
      setMermaidBlock: (attrs?: { source?: string }) => ReturnType;
    };
  }
}

// Lazy singleton: mermaid is ~500KB, so we only pull it in the first time a
// diagram actually renders rather than at editor mount.
let mermaidModule: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = import("mermaid").then((mod) => mod.default);
  }
  return mermaidModule;
}

function isDarkTheme() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

let renderSeq = 0;

// Inline SVG markup for the block's view-toggle + edit controls (the node view
// builds plain DOM, so we can't use the React icon components here).
function svgMarkup(inner: string) {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;display:block;flex:0 0 auto">${inner}</svg>`;
}
const DIAGRAM_ICON = svgMarkup(
  '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M6.5 9v3a2 2 0 0 0 2 2h9"/>'
);
const CODE_ICON = svgMarkup('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
const PENCIL_ICON = svgMarkup(
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
);

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      source: {
        default: "",
        // The source lives as the text content of the <pre><code> on parse,
        // and is emitted the same way by renderHTML, so it never needs to be
        // an HTML attribute (which would double-escape newlines).
        parseHTML: (element) => element.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    // Both this node and CodeBlockLowlight register a rule that matches a
    // `<pre>`. CodeBlockLowlight's `pre` rule is broad, so without a higher
    // priority here a `<pre data-type="mermaid">` gets claimed as a plain code
    // block and renders as highlighted source instead of a live diagram.
    return [
      { tag: 'pre[data-type="mermaid"]', priority: 100, preserveWhitespace: "full" },
      {
        tag: "pre",
        priority: 90,
        preserveWhitespace: "full",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const code = element.querySelector("code");
          const language =
            element.getAttribute("data-language") ||
            code?.getAttribute("data-language") ||
            "";
          const className = `${element.className} ${code?.className ?? ""}`;
          return language.toLowerCase() === "mermaid" ||
            /\blanguage-mermaid\b/.test(className)
            ? {}
            : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid" }),
      ["code", {}, node.attrs.source ?? ""],
    ];
  },

  addCommands() {
    return {
      setMermaidBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { source: attrs?.source?.trim() ? attrs.source : DEFAULT_SOURCE },
          }),
    };
  },

  addNodeView(): NodeViewRenderer {
    return (props) => {
      let node = props.node;
      const editor = props.editor;
      const getPos = props.getPos;
      let source: string = node.attrs.source ?? "";
      let editing = false;

      const dom = document.createElement("div");
      dom.className = "creed-mermaid";
      dom.setAttribute("data-type", "mermaid");

      // Controls: [Diagram | Code] view toggle + an Edit button. Revealed on
      // hover (see globals.css). Diagram shows the rendered SVG, Code shows the
      // Mermaid source read-only, Edit opens the editable textarea.
      const controls = document.createElement("div");
      controls.className = "creed-mermaid-controls";
      controls.contentEditable = "false";

      function makeTab(className: string, title: string, innerHTML: string) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.innerHTML = innerHTML;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        return button;
      }

      const diagramTab = makeTab("creed-mermaid-tab", "Diagram view", DIAGRAM_ICON);
      const codeTab = makeTab("creed-mermaid-tab", "Code view", CODE_ICON);
      const editTab = makeTab(
        "creed-mermaid-tab creed-mermaid-tab-edit",
        "Edit diagram",
        `${PENCIL_ICON}<span>Edit</span>`
      );
      controls.append(diagramTab, codeTab, editTab);

      const preview = document.createElement("div");
      preview.className = "creed-mermaid-preview";
      preview.setAttribute("role", "img");

      // Read-only source view (Code tab).
      const codeView = document.createElement("pre");
      codeView.className = "creed-mermaid-code";
      codeView.style.display = "none";

      const editRow = document.createElement("div");
      editRow.className = "creed-mermaid-edit";
      editRow.style.display = "none";

      const textarea = document.createElement("textarea");
      textarea.className = "creed-mermaid-source";
      textarea.spellcheck = false;
      textarea.setAttribute("aria-label", "Mermaid diagram source");

      const editActions = document.createElement("div");
      editActions.className = "creed-mermaid-edit-actions";
      const doneButton = document.createElement("button");
      doneButton.type = "button";
      doneButton.textContent = "Done";
      doneButton.className = "creed-mermaid-btn creed-mermaid-btn-primary";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.className = "creed-mermaid-btn";
      editActions.append(cancelButton, doneButton);
      editRow.append(textarea, editActions);

      dom.append(controls, preview, codeView, editRow);

      let mode: "diagram" | "code" = "diagram";

      function canEditDiagram() {
        return (
          editor.isEditable &&
          !editor.view.dom.closest('[data-creed-readonly="true"]')
        );
      }

      function commit(next: string) {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            source: next,
          })
        );
      }

      async function renderDiagram() {
        const trimmed = source.trim();
        if (!trimmed) {
          preview.innerHTML =
            canEditDiagram()
              ? '<span class="creed-mermaid-empty">Empty diagram. Click “Edit” to add Mermaid syntax.</span>'
              : '<span class="creed-mermaid-empty">Empty diagram.</span>';
          return;
        }

        const token = (renderSeq += 1);
        try {
          const mermaid = await loadMermaid();
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: isDarkTheme() ? "dark" : "default",
            fontFamily: "inherit",
          });
          const { svg } = await mermaid.render(`creed-mermaid-${token}`, trimmed);
          // A newer render may have completed while we awaited; ignore stale.
          if (token !== renderSeq && editing) return;
          preview.innerHTML = svg;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid diagram syntax";
          const wrap = document.createElement("div");
          wrap.className = "creed-mermaid-error";
          const heading = document.createElement("p");
          heading.textContent = "Diagram could not be rendered";
          const detail = document.createElement("pre");
          detail.textContent = message;
          wrap.append(heading, detail);
          preview.replaceChildren(wrap);
        }
      }

      function syncTabs() {
        editTab.style.display = canEditDiagram() ? "" : "none";
        diagramTab.classList.toggle("is-active", mode === "diagram" && !editing);
        codeTab.classList.toggle("is-active", mode === "code" && !editing);
        editTab.classList.toggle("is-active", editing);
      }

      // Render the current non-editing view (diagram SVG or code source).
      function showView() {
        editRow.style.display = "none";
        if (mode === "code") {
          preview.style.display = "none";
          codeView.style.display = "";
          codeView.textContent = source.trim() || "Empty diagram.";
        } else {
          codeView.style.display = "none";
          preview.style.display = "";
          void renderDiagram();
        }
        syncTabs();
      }

      function setMode(next: "diagram" | "code") {
        if (editing) return;
        mode = next;
        showView();
      }

      function enterEdit() {
        if (!canEditDiagram()) return;
        editing = true;
        textarea.value = source;
        preview.style.display = "none";
        codeView.style.display = "none";
        editRow.style.display = "";
        syncTabs();
        // Autosize + focus after paint.
        window.requestAnimationFrame(() => {
          textarea.style.height = "auto";
          textarea.style.height = `${Math.max(textarea.scrollHeight, 80)}px`;
          textarea.focus();
        });
      }

      function exitEdit(save: boolean) {
        if (save) {
          const next = textarea.value;
          if (next !== source) {
            source = next;
            commit(next);
          }
        }
        editing = false;
        showView();
      }

      diagramTab.addEventListener("click", (event) => {
        event.preventDefault();
        setMode("diagram");
      });
      codeTab.addEventListener("click", (event) => {
        event.preventDefault();
        setMode("code");
      });
      editTab.addEventListener("click", (event) => {
        event.preventDefault();
        enterEdit();
      });
      preview.addEventListener("dblclick", (event) => {
        event.preventDefault();
        enterEdit();
      });
      doneButton.addEventListener("click", (event) => {
        event.preventDefault();
        exitEdit(true);
      });
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault();
        exitEdit(false);
      });
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.max(textarea.scrollHeight, 80)}px`;
      });
      textarea.addEventListener("keydown", (event) => {
        // Cmd/Ctrl+Enter commits; Escape cancels. Plain Enter inserts a
        // newline (Mermaid is line-oriented) so it must reach the textarea.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          exitEdit(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          exitEdit(false);
        }
      });

      showView();

      return {
        dom,
        update(updated) {
          if (updated.type.name !== node.type.name) return false;
          node = updated;
          const nextSource = updated.attrs.source ?? "";
          if (nextSource !== source && !editing) {
            source = nextSource;
            showView();
          }
          return true;
        },
        selectNode() {
          dom.classList.add("creed-mermaid-selected");
        },
        deselectNode() {
          dom.classList.remove("creed-mermaid-selected");
        },
        // While editing, keep ProseMirror out of the textarea's events.
        stopEvent: () => editing,
        ignoreMutation: () => true,
      };
    };
  },
});
