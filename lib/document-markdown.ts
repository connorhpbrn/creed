import "server-only";
import {
  isDocumentLifecycle,
  isDocumentPriority,
  isDocumentSize,
  isDocumentStage,
  isDocumentStatus,
  isDocumentType,
  type DocumentMetadataPatch,
} from "@/lib/document-properties";

// Document properties are version-controlled by projecting them into YAML
// frontmatter at the top of the pushed Markdown file. Supabase columns stay
// the source of truth; this module is the single canonical serializer/parser
// that keeps the GitHub file and the columns in lockstep.
//
// Design contract:
//   - `serializeDocumentFile(doc, body)` is the ONLY thing we push and the ONLY
//     thing we hash for sync-status. Given the same inputs it is deterministic,
//     so round-tripping a canonical file does not false-flag as "diverged".
//   - `parseDocumentFile(fileText)` is its inverse for canonical input and is
//     deliberately conservative: a stray `---` fence in the body (a Markdown
//     thematic break) is never mistaken for frontmatter.

const FENCE = "---";

// Canonical key order. Keep this stable - reordering changes the serialized
// bytes and therefore every document's content hash.
const KNOWN_KEYS = new Set([
  "title",
  "description",
  "type",
  "status",
  "stage",
  "lifecycle",
  "priority",
  "size",
]);

export type DocumentFrontmatterSource = {
  title: string;
  description?: string | null;
  documentType: string;
  status: string;
  stage: string;
  lifecycle: string;
  priority: string;
  size: string;
};

function quoteValue(value: string) {
  // Always double-quote free-text values so colons, hashes and quotes survive.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquoteValue(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function normalizeBody(body: string) {
  return body.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/^\n+/, "");
}

export function serializeDocumentFile(source: DocumentFrontmatterSource, body: string) {
  const lines: string[] = [];
  lines.push(`title: ${quoteValue(source.title)}`);
  const description = source.description?.trim();
  if (description) {
    lines.push(`description: ${quoteValue(description)}`);
  }
  lines.push(`type: ${source.documentType}`);
  lines.push(`status: ${source.status}`);
  lines.push(`stage: ${source.stage}`);
  lines.push(`lifecycle: ${source.lifecycle}`);
  lines.push(`priority: ${source.priority}`);
  lines.push(`size: ${source.size}`);
  return `${FENCE}\n${lines.join("\n")}\n${FENCE}\n\n${normalizeBody(body)}`;
}

type ParsedDocumentFile = {
  metadata: DocumentMetadataPatch;
  body: string;
};

export function parseDocumentFile(fileText: string): ParsedDocumentFile {
  const normalized = fileText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  const fenceMatch = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!fenceMatch) {
    return { metadata: {}, body: normalized.replace(/^\n+/, "") };
  }

  const block = fenceMatch[1];
  const blockLines = block.split("\n").filter((line) => line.trim().length > 0);

  // Conservative guard: only treat this as frontmatter if every line is a
  // `key: value` pair AND at least one recognized document key is present.
  // Otherwise a Markdown thematic break gets left untouched in the body.
  const everyLineIsPair = blockLines.every((line) => /^[A-Za-z][\w-]*:\s?.*$/.test(line));
  const hasKnownKey = blockLines.some((line) => {
    const key = line.slice(0, line.indexOf(":")).trim();
    return KNOWN_KEYS.has(key);
  });

  if (!everyLineIsPair || !hasKnownKey) {
    return { metadata: {}, body: normalized.replace(/^\n+/, "") };
  }

  const metadata: DocumentMetadataPatch = {};
  for (const line of blockLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = unquoteValue(line.slice(idx + 1));
    switch (key) {
      case "title":
        if (value) metadata.title = value;
        break;
      case "description":
        metadata.description = value;
        break;
      case "type":
        if (isDocumentType(value)) metadata.documentType = value;
        break;
      case "status":
        if (isDocumentStatus(value)) metadata.status = value;
        break;
      case "stage":
        if (isDocumentStage(value)) metadata.stage = value;
        break;
      case "lifecycle":
        if (isDocumentLifecycle(value)) metadata.lifecycle = value;
        break;
      case "priority":
        if (isDocumentPriority(value)) metadata.priority = value;
        break;
      case "size":
        if (isDocumentSize(value)) metadata.size = value;
        break;
      default:
        break;
    }
  }

  return { metadata, body: normalized.slice(fenceMatch[0].length).replace(/^\n+/, "") };
}
