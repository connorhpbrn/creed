import type { CreedSection } from "./creed-data.ts";
import {
  CARD_REFERENCE_LINE_PATTERN,
  INLINE_REFERENCE_PATTERN,
} from "./document-reference.ts";
import {
  INLINE_URL_MENTION_PATTERN,
  URL_BLOCK_LINE_PATTERN,
} from "./url-reference.ts";

function escapeHtml(value: string) {
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

// Inline document/folder references: `[[doc:slug]]` -> an inline chip node.
// Runs on already-escaped text; slugs are alphanumerics + `._/-` so there is
// nothing to escape inside the token. The card form (`![[...]]`) on its own
// line is handled in the block loop below; a stray inline `![[...]]` falls
// through to this pattern's negative lookbehind and stays literal.
function applyInlineReferences(escapedText: string) {
  return escapedText.replace(
    INLINE_REFERENCE_PATTERN,
    (_match, kind: string, slug: string) =>
      `<span data-doc-ref="inline" data-ref-kind="${kind}" data-ref-slug="${slug}"></span>`
  );
}

// Inline URL mention token: `[mention](https://example.com)` -> an inline
// favicon chip node. Runs BEFORE applyInlineLinks so the reserved `mention`
// label isn't captured as a plain `[text](url)` hyperlink. The URL is already
// HTML-escaped at this point, so it is safe to drop straight into the
// `data-url` attribute.
function applyUrlMention(escapedText: string) {
  return escapedText.replace(
    INLINE_URL_MENTION_PATTERN,
    (_match, url: string) => `<span data-url-ref="mention" data-url="${url}"></span>`
  );
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
    const token = `@@CREEDCODE${placeholders.length}@@`;
    placeholders.push(`<code>${escapeHtml(body)}</code>`);
    return token;
  });
  let out = render(stashed);
  placeholders.forEach((html, index) => {
    out = out.replace(`@@CREEDCODE${index}@@`, html);
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
  return withInlineCode(text, (stashed) => {
    const escaped = escapeHtml(stashed);
    return applyInlineExtras(
      applyInlineEmphasis(applyInlineLinks(applyUrlMention(applyInlineReferences(applyInlineTagMarks(escaped)))))
    );
  });
}

function paragraphize(lines: string[]) {
  const text = lines.join(" ").trim();
  return text ? `<p>${inline(text)}</p>` : "";
}

// GFM table helpers. A table is a header row, a delimiter row where each cell
// matches `:?-+:?`, then zero or more body rows. We split cells on unescaped
// pipes so `\|` survives as a literal inside a cell.
function splitTableCells(row: string) {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

// True when `line` is a Markdown table delimiter row (e.g. `| --- | :--: |`).
// Requires a pipe so a plain `---` thematic break is never mistaken for one.
function isTableDelimiterRow(line: string | undefined) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = splitTableCells(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

// Build the `<table>` HTML Tiptap parses. Row 0 is the header (`<th>`), the
// delimiter row is dropped, and the rest become `<td>` body rows padded to the
// header's column count so ragged input still renders a rectangular table.
function renderTable(rows: string[]) {
  const header = splitTableCells(rows[0]);
  const colCount = header.length;
  const bodyRows = rows.slice(2).map(splitTableCells);
  const headHtml = `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr>`;
  const bodyHtml = bodyRows
    .map(
      (cells) =>
        `<tr>${Array.from({ length: colCount }, (_unused, index) => `<td>${inline(cells[index] ?? "")}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table class="creed-table"><tbody>${headHtml}${bodyHtml}</tbody></table>`;
}

function looksLikeMermaidSource(source: string) {
  return /^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|sequenceDiagram\b|erDiagram\b|journey\b|gantt\b|pie\b|mindmap\b|timeline\b|gitGraph\b|classDiagram\b|stateDiagram(?:-v2)?\b)/i.test(
    source.trim()
  );
}

function repairFlattenedMermaidInlineCode(markdown: string) {
  return markdown.replace(
    /(^|\n)`([\s\S]*?)`(?=\n|$)/g,
    (match, lead: string, source: string) => {
      const trimmed = source.trim();
      if (!looksLikeMermaidSource(trimmed)) return match;
      return `${lead}\`\`\`mermaid\n${trimmed}\n\`\`\``;
    }
  );
}

export function markdownToRichHtml(markdown: string) {
  const lines = repairFlattenedMermaidInlineCode(markdown.replace(/\r\n/g, "\n")).split("\n");
  const blocks: string[] = [];
  let paragraphBuffer: string[] = [];
  let listMode: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] = [];
  let codeLang = "";
  let inCodeBlock = false;

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      blocks.push(paragraphize(paragraphBuffer));
      paragraphBuffer = [];
    }
  }

  function flushList() {
    if (listMode && listItems.length > 0) {
      const listClass =
        listMode === "ul" ? "creed-list creed-list-bullet" : "creed-list creed-list-ordered";
      blocks.push(
        `<${listMode} class="${listClass}">${listItems
          .map((item) => `<li class="creed-list-item">${inline(item)}</li>`)
          .join("")}</${listMode}>`
      );
    }
    listMode = null;
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
      if (codeLang === "mermaid") {
        // Mermaid fences become a dedicated diagram node so the editor can
        // render a live SVG. See components/creed/extensions/mermaid-block.tsx.
        blocks.push(
          `<pre data-type="mermaid"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`
        );
      } else {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      }
      codeLines = [];
    }
    codeLang = "";
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        // Capture the fence language (e.g. ```mermaid) so flushCode can route
        // mermaid blocks to the diagram node.
        codeLang = trimmed.slice(3).trim().toLowerCase();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    // GFM table: a header row followed by a delimiter row. We consume the
    // header, the delimiter, and every following non-empty pipe row as one
    // block, then rewind the outer index to the last consumed line.
    if (trimmed.includes("|") && isTableDelimiterRow(lines[lineIndex + 1])) {
      flushParagraph();
      flushList();
      flushQuote();
      const tableRows = [trimmed, lines[lineIndex + 1].trim()];
      let cursor = lineIndex + 2;
      while (cursor < lines.length) {
        const bodyLine = lines[cursor].trim();
        if (!bodyLine || !bodyLine.includes("|") || bodyLine.startsWith("```")) break;
        tableRows.push(bodyLine);
        cursor += 1;
      }
      blocks.push(renderTable(tableRows));
      lineIndex = cursor - 1;
      continue;
    }

    // Markdown horizontal rule: `---`, `***`, or `___` on its own line.
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<hr />`);
      continue;
    }

    // A card reference token on its own line (`![[doc:slug]]`) becomes a
    // full-width reference card node. Inline references are handled in
    // `inline()` instead.
    const cardReference = trimmed.match(CARD_REFERENCE_LINE_PATTERN);
    if (cardReference) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(
        `<div data-doc-ref="card" data-ref-kind="${cardReference[1]}" data-ref-slug="${cardReference[2]}"></div>`
      );
      continue;
    }

    // A URL bookmark/embed token on its own line becomes a block card / iframe.
    const urlBlock = trimmed.match(URL_BLOCK_LINE_PATTERN);
    if (urlBlock) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<div data-url-ref="${urlBlock[1]}" data-url="${urlBlock[2]}"></div>`);
      continue;
    }

    const heading1 = trimmed.match(/^#\s+(.*)$/);
    if (heading1) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h1>${inline(heading1[1])}</h1>`);
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

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (listMode && listMode !== "ul") {
        flushList();
      }
      listMode = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (listMode && listMode !== "ol") {
        flushList();
      }
      listMode = "ol";
      listItems.push(numbered[1]);
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
  flushCode();

  return blocks.join("");
}

export function normalizeRichTextInput(input: { contentHtml?: string; contentMarkdown?: string }) {
  if (typeof input.contentHtml === "string" && input.contentHtml.trim()) {
    return input.contentHtml.trim();
  }

  if (typeof input.contentMarkdown === "string" && input.contentMarkdown.trim()) {
    return markdownToRichHtml(input.contentMarkdown.trim());
  }

  return "";
}

function getEditableSectionInventory(
  sections: CreedSection[]
): Array<{ id: string; name: string; kind: CreedSection["kind"] }> {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    kind: section.kind,
  }));
}
