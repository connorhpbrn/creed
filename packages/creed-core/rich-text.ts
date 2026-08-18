
import sanitizeHtml from "sanitize-html";

const RICH_TEXT_TAGS = [
  "p", "strong", "em", "u", "s", "mark", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "h2", "h3", "h4", "br", "span", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: RICH_TEXT_TAGS,
    allowedAttributes: {
      a: ["href"],
      span: ["class", "data-tag"],
      blockquote: ["class"],
      ul: ["class", "data-type"],
      ol: ["class"],
      // data-type / data-checked are the only way a checklist survives
      // sanitizer → editor parse. Strip them and `- [x]` becomes a bullet.
      li: ["class", "data-type", "data-checked"],
      table: ["class"],
      thead: [],
      tbody: [],
      tr: [],
      th: ["class"],
      td: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
  });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Match `#tag` and `#multi-word-tag` inside paragraph / list / quote text.
// We escape the surrounding text first via `escapeHtml`, then run this on the
// escaped output to inject the styled tag-mark span. The pattern requires
// either start-of-string or whitespace before the `#` so `C#`-in-prose isn't
// accidentally treated as a tag.
const INLINE_TAG_PATTERN = /(^|\s)#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;

function applyInlineTagMarks(escapedText: string) {
  return escapedText.replace(INLINE_TAG_PATTERN, (_match, lead: string, tag: string) => {
    const slug = tag.toLowerCase();
    return `${lead}<span class="creed-inline-tag" data-tag="${slug}">${tag}</span>`;
  });
}

// Bold (`**text**`) and italic (`*text*` / `_text_`). The bold pattern runs
// first so a triple-star `***text***` collapses cleanly (bold then italic).
// The negative-lookbehind on italic skips the inner stars of a bold run.
function applyInlineEmphasis(escapedText: string) {
  return escapedText
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*_])(?:\*|_)([^*_\n]+?)(?:\*|_)(?!\*|_)/g, "$1<em>$2</em>");
}

// Inline-code spans (`` `code` ``). Substitute placeholders BEFORE the rest
// of inline processing runs so the code body isn't re-parsed as emphasis /
// tags / links. We restore the placeholders at the end. Escaping inside the
// code body uses `escapeHtml` so `<`/`>`/`&` inside code render literally.
function withInlineCode(rawText: string, render: (rest: string) => string) {
  const placeholders: string[] = [];
  const stashed = rawText.replace(/`([^`\n]+)`/g, (_match, body: string) => {
    const token = `__CREED_INLINE_CODE_${placeholders.length}__`;
    placeholders.push(`<code>${escapeHtml(body)}</code>`);
    return token;
  });
  let out = render(stashed);
  placeholders.forEach((html, index) => {
    out = out.replace(`__CREED_INLINE_CODE_${index}__`, html);
  });
  return out;
}

function stashAutolink(placeholders: string[], href: string, label: string) {
  const token = `%%CREEDAUTOLINK${placeholders.length}%%`;
  placeholders.push(
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
  );
  return token;
}

// Angle-bracket and bare http(s) URLs. Stashed before escaping so
// `<https://...>` is not turned into `&lt;https://...&gt;`, and so
// `[label](https://...)` keeps its markdown link form (the URL sits
// after `(` rather than whitespace).
function withAutolinks(rawText: string, render: (rest: string) => string) {
  const placeholders: string[] = [];
  const withoutAngle = rawText.replace(
    /<(https?:\/\/[^>\s]+)>/gi,
    (_match, href: string) => stashAutolink(placeholders, href, href),
  );
  const stashed = withoutAngle.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/gi,
    (_match, lead: string, url: string) => {
      const trimmed = url.replace(/[.,;:!?)]+$/g, "");
      const trail = url.slice(trimmed.length);
      if (!/^https?:\/\//i.test(trimmed)) return `${lead}${url}`;
      return `${lead}${stashAutolink(placeholders, trimmed, trimmed)}${trail}`;
    },
  );
  let out = render(stashed);
  placeholders.forEach((html, index) => {
    out = out.replace(`%%CREEDAUTOLINK${index}%%`, html);
  });
  return out;
}

// Markdown links (`[text](url)`) - converted to anchor tags with the URL
// HTML-escaped to keep this safe from injection through user-controlled
// markdown. We deliberately restrict URLs to http(s) / mailto schemes and
// fall back to a plain text representation otherwise.
function applyInlineLinks(escapedText: string) {
  return escapedText.replace(
    /\[([^\]\n]+?)\]\(([^)\s]+?)\)/g,
    (match, label: string, href: string) => {
      const safeHref = /^(https?:|mailto:|\/|#)/i.test(href) ? href : null;
      if (!safeHref) return match;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );
}

// GFM strikethrough (`~~text~~`) and Obsidian-style highlight (`==text==`)
// and underline (`__text__`). All mirror what `sectionToMarkdown` emits.
function applyInlineExtras(escapedText: string) {
  return escapedText
    .replace(/~~([^~\n]+?)~~/g, "<s>$1</s>")
    .replace(/==([^=\n]+?)==/g, "<mark>$1</mark>")
    .replace(/__([^_\n]+?)__/g, "<u>$1</u>");
}

function inline(text: string) {
  return withInlineCode(text, (noCode) =>
    withAutolinks(noCode, (stashed) => {
      const escaped = escapeHtml(stashed);
      return applyInlineExtras(
        applyInlineEmphasis(applyInlineLinks(applyInlineTagMarks(escaped))),
      );
    }),
  );
}

function paragraphize(lines: string[]) {
  const text = lines.join(" ").trim();
  return text ? `<p>${inline(text)}</p>` : "";
}

type MarkdownListKind = "ul" | "ol" | "task";
type MarkdownListItem = {
  indent: number;
  kind: MarkdownListKind;
  checked: boolean;
  text: string;
};

function parseMarkdownListLine(line: string): MarkdownListItem | null {
  const match = line.match(/^([ \t]*)([-*]|\d+\.)[ \t]+(.*)$/);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, "  ").length;
  const marker = match[2];
  const rest = match[3];
  if (marker === "-" || marker === "*") {
    const task = rest.match(/^\[([ xX])\](?:[ \t]+(.*))?$/);
    if (task) {
      return {
        indent,
        kind: "task",
        checked: task[1].toLowerCase() === "x",
        text: task[2] ?? "",
      };
    }
    return { indent, kind: "ul", checked: false, text: rest };
  }
  return { indent, kind: "ol", checked: false, text: rest };
}

function wrapMarkdownList(kind: MarkdownListKind, itemsHtml: string) {
  if (kind === "task") {
    return `<ul class="creed-list creed-list-task" data-type="taskList">${itemsHtml}</ul>`;
  }
  const tag = kind === "ol" ? "ol" : "ul";
  const listClass =
    kind === "ol" ? "creed-list creed-list-ordered" : "creed-list creed-list-bullet";
  return `<${tag} class="${listClass}">${itemsHtml}</${tag}>`;
}

function wrapMarkdownListItem(item: MarkdownListItem, nestedHtml: string) {
  if (item.kind === "task") {
    return `<li class="creed-list-item" data-type="taskItem" data-checked="${item.checked}"><p>${inline(item.text)}</p>${nestedHtml}</li>`;
  }
  return `<li class="creed-list-item">${inline(item.text)}${nestedHtml}</li>`;
}

function renderMarkdownListForest(items: MarkdownListItem[]): string {
  if (items.length === 0) return "";
  const base = items[0].indent;
  let html = "";
  let index = 0;
  while (index < items.length) {
    const kind = items[index].kind;
    const groupHtml: string[] = [];
    while (
      index < items.length &&
      items[index].indent === base &&
      items[index].kind === kind
    ) {
      const item = items[index];
      index += 1;
      const childStart = index;
      while (index < items.length && items[index].indent > base) {
        index += 1;
      }
      groupHtml.push(
        wrapMarkdownListItem(
          item,
          renderMarkdownListForest(items.slice(childStart, index)),
        ),
      );
    }
    html += wrapMarkdownList(kind, groupHtml.join(""));
  }
  return html;
}

function isPipeRow(line: string) {
  return /^\|.+\|$/.test(line);
}

function splitTableCells(line: string) {
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (inner[i] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += inner[i];
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(line: string) {
  if (!isPipeRow(line)) return false;
  const cells = splitTableCells(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function padTableRow(cells: string[], width: number) {
  const next = cells.slice(0, width);
  while (next.length < width) next.push("");
  return next;
}

// GFM has no headerless table form. This markdown comment, then an empty
// header row, keeps a td-only table from coming back as th on pull.
// It must not be an HTML comment: richTextToMarkdown strips those.
export const HEADERLESS_TABLE_MARK = "[//]: # (creed-table-headerless)";

export function markdownToRichHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraphBuffer: string[] = [];
  let listItems: MarkdownListItem[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] = [];
  let tableRows: string[] | null = null;
  let tableHeaderless = false;
  let inCodeBlock = false;

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      blocks.push(paragraphize(paragraphBuffer));
      paragraphBuffer = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push(renderMarkdownListForest(listItems));
    }
    listItems = [];
  }

  function flushQuote() {
    if (quoteLines.length > 0) {
      // Render markdown blockquotes as Creed callouts, which is how the
      // editor styles `<blockquote>` via the `creed-callout` class.
      blocks.push(
        `<blockquote class="creed-callout"><p>${inline(quoteLines.join(" "))}</p></blockquote>`
      );
      quoteLines = [];
    }
  }

  function flushCode() {
    if (codeLines.length > 0) {
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
    }
  }

  function flushTable() {
    const headerless = tableHeaderless;
    tableHeaderless = false;
    if (!tableRows || tableRows.length === 0) {
      tableRows = null;
      return;
    }
    const rows = tableRows;
    tableRows = null;
    if (rows.length >= 2 && isSeparatorRow(rows[1])) {
      const headers = splitTableCells(rows[0]);
      const width = headers.length;
      if (width > 0) {
        const bodyRows = rows
          .slice(2)
          .map((row) => {
            const cells = padTableRow(splitTableCells(row), width)
              .map((cell) => `<td><p>${inline(cell)}</p></td>`)
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        if (headerless) {
          blocks.push(
            `<table class="creed-table"><tbody>${bodyRows}</tbody></table>`,
          );
          return;
        }
        const headerCells = padTableRow(headers, width)
          .map((cell) => `<th><p>${inline(cell)}</p></th>`)
          .join("");
        blocks.push(
          `<table class="creed-table"><tbody><tr>${headerCells}</tr>${bodyRows}</tbody></table>`,
        );
        return;
      }
    }
    for (const row of rows) {
      paragraphBuffer.push(row);
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (tableRows && !isPipeRow(trimmed)) {
      flushTable();
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      continue;
    }

    if (trimmed === HEADERLESS_TABLE_MARK) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      tableHeaderless = true;
      continue;
    }

    if (isPipeRow(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      if (!tableRows) tableRows = [];
      tableRows.push(trimmed);
      continue;
    }

    // Markdown horizontal rule: `---`, `***`, or `___` on its own line.
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      blocks.push(`<hr class="creed-hr" />`);
      continue;
    }

    const heading2 = trimmed.match(/^##\s+(.*)$/);
    if (heading2) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h2>${inline(heading2[1])}</h2>`);
      continue;
    }

    const heading3 = trimmed.match(/^###\s+(.*)$/);
    if (heading3) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h3>${inline(heading3[1])}</h3>`);
      continue;
    }

    const heading4 = trimmed.match(/^####\s+(.*)$/);
    if (heading4) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h4>${inline(heading4[1])}</h4>`);
      continue;
    }

    // Keep leading whitespace so nested markers can indent under a parent.
    const listLine = parseMarkdownListLine(line);
    if (listLine) {
      flushParagraph();
      flushQuote();
      listItems.push(listLine);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushTable();
  flushCode();

  return blocks.join("");
}

// Collapse insignificant whitespace in a rich-text HTML body: turn &nbsp; into a
// space, drop whitespace between tags, collapse runs of whitespace, and trim.
// Used only for equality comparison, never for storage.
export function normalizeHtmlWhitespace(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
    .trim();
}

function normalizeSectionReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_-]+/g, "");
}

function readHtmlAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

const INLINE_TAG_SPAN_PATTERN = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
const REMOVED_SECTION_REFERENCE = "__CREED_REMOVED_SECTION_REFERENCE__";

/**
 * Remove every rich-text section-reference mark that targets a permanently
 * deleted section. Current marks store the section id in `data-tag`; legacy
 * imports can store the display name, so both are matched using the editor's
 * separator-tolerant normalization. Plain hashtags are deliberately untouched.
 */
export function removeSectionReferences(
  html: string,
  target: { id: string; name: string },
): string {
  if (!html.includes("creed-inline-tag")) return html;

  const targetValues = new Set(
    [target.id, target.name]
      .map(normalizeSectionReference)
      .filter(Boolean),
  );
  let removed = false;
  const marked = html.replace(
    INLINE_TAG_SPAN_PATTERN,
    (span, attributes: string, body: string) => {
      const className = readHtmlAttribute(attributes, "class") ?? "";
      if (!className.split(/\s+/).includes("creed-inline-tag")) return span;

      const rawValue =
        readHtmlAttribute(attributes, "data-tag") ??
        body.replace(/<[^>]+>/g, "");
      if (!targetValues.has(normalizeSectionReference(rawValue))) return span;

      removed = true;
      return REMOVED_SECTION_REFERENCE;
    },
  );
  if (!removed) return html;

  const escapedMarker = REMOVED_SECTION_REFERENCE.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const emptyBlockPattern = new RegExp(
    `<p([^>]*)>(?:(?:\\s|&nbsp;|<br\\s*\\/?>)*${escapedMarker})+(?:\\s|&nbsp;|<br\\s*\\/?>)*<\\/p>`,
    "gi",
  );
  const withoutEmptyBlocks = marked.replace(emptyBlockPattern, "");
  return withoutEmptyBlocks.replace(
    new RegExp(`[ \\t]*${escapedMarker}[ \\t]*`, "g"),
    (match) =>
      /^[ \t]/.test(match) && /[ \t]$/.test(match) ? " " : "",
  );
}

export function removeSectionReferencesFromSections<
  T extends { id: string; content: string },
>(sections: T[], target: { id: string; name: string }): T[] {
  return sections
    .filter((section) => section.id !== target.id)
    .map((section) => {
      const content = removeSectionReferences(section.content, target);
      return content === section.content ? section : { ...section, content };
    });
}

// True when two rich-text bodies differ only in insignificant whitespace (a
// stray space, an &nbsp;, or whitespace between tags). Lets a save or proposal
// that added no real content - e.g. just hitting the spacebar - be treated as a
// no-op, so it never lands a version, an activity row, or a proposal. Formatting
// changes survive (tags differ), so bolding a word is NOT a no-op.
export function richTextContentEquivalent(a: string, b: string): boolean {
  return normalizeHtmlWhitespace(a) === normalizeHtmlWhitespace(b);
}

export function normalizeRichTextInput(input: { contentHtml?: string; contentMarkdown?: string }) {
  if (typeof input.contentHtml === "string" && input.contentHtml.trim()) {
    return sanitizeRichTextHtml(input.contentHtml.trim());
  }

  if (typeof input.contentMarkdown === "string" && input.contentMarkdown.trim()) {
    return sanitizeRichTextHtml(markdownToRichHtml(input.contentMarkdown.trim()));
  }

  return "";
}

const MARKDOWN_BLOCK_LINE =
  /^(?:#{2,4}\s+\S|```|>\s?\S|[-*]\s+\S|\d+\.\s+\S|\|.+\||([-*_])\1{2,})$/;

export function looksLikeMarkdown(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return false;

  for (const raw of trimmed.split("\n")) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (MARKDOWN_BLOCK_LINE.test(t)) return true;
    if (/^[ \t]+(?:[-*]\s+\S|\d+\.\s+\S)/.test(line)) return true;
  }

  if (/\[[^\]]+\]\((?:https?:|mailto:|\/|#)[^)\s]+\)/.test(trimmed)) return true;
  return /(\*\*[^*\n]+?\*\*|==[^=\n]+?==|~~[^~\n]+?~~|__[^_\n]+?__)/.test(
    trimmed,
  );
}

// Prefer Tiptap's HTML paste when the clipboard already carries lists,
// headings, or other blocks. Convert plain text only when it looks like
// markdown the user copied from an agent or a .md file.
export function clipboardPlainTextAsMarkdown(
  plain: string,
  html?: string | null,
) {
  if (!looksLikeMarkdown(plain)) return false;
  if (html && /<(ul|ol|table|blockquote|pre|h[1-6])\b/i.test(html)) {
    return false;
  }
  return true;
}
