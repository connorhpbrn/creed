import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type LocalDocKind =
  | "architecture"
  | "audit"
  | "diff-review"
  | "consultant"
  | "agent-context"
  | "document";

export type LocalDocSource = {
  name: string;
  path: string;
};

export type LocalDocSummary = {
  id: string;
  repo: string;
  repoPath: string;
  relativePath: string;
  absolutePath: string;
  title: string;
  kind: LocalDocKind;
  kindLabel: string;
  excerpt: string;
  modifiedAt: string;
  size: number;
};

export type LocalDocDetail = LocalDocSummary & {
  markdown: string;
  html: string;
  contentHash: string;
};

export type LocalDocsPayload = {
  enabled: boolean;
  sources: LocalDocSource[];
  documents: LocalDocSummary[];
  selectedDocument: LocalDocDetail | null;
  errors: string[];
  generatedAt: string;
};

const MAX_DOCUMENT_BYTES = 1_500_000;

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

function expandHome(value: string) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return value;
}

function normalizeRepoPath(value: string) {
  return path.resolve(expandHome(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSources() {
  const errors: string[] = [];

  if (process.env.CREED_LOCAL_DOCS_ENABLED !== "1") {
    return { enabled: false, sources: [] as LocalDocSource[], errors };
  }

  const raw = process.env.CREED_LOCAL_DOC_REPOS?.trim();
  if (!raw) {
    errors.push("Set CREED_LOCAL_DOC_REPOS in .env.local to scan local repo docs.");
    return { enabled: true, sources: [] as LocalDocSource[], errors };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    errors.push("CREED_LOCAL_DOC_REPOS must be a JSON array of { name, path } objects.");
    return { enabled: true, sources: [] as LocalDocSource[], errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push("CREED_LOCAL_DOC_REPOS must be a JSON array.");
    return { enabled: true, sources: [] as LocalDocSource[], errors };
  }

  const sources: LocalDocSource[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) {
      errors.push("Ignoring a local docs source because it is not an object.");
      continue;
    }

    const name = typeof item.name === "string" ? item.name.trim() : "";
    const repoPath = typeof item.path === "string" ? item.path.trim() : "";
    if (!name || !repoPath) {
      errors.push("Ignoring a local docs source because it is missing name or path.");
      continue;
    }

    sources.push({ name, path: normalizeRepoPath(repoPath) });
  }

  return { enabled: true, sources, errors };
}

function toRelativePosix(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function shouldIncludeDocument(relativePath: string) {
  const lower = relativePath.toLowerCase();
  if (!lower.endsWith(".md") && !lower.endsWith(".mdx")) return false;

  if (
    lower === "agents.md" ||
    lower === "claude.md" ||
    lower.startsWith(".codex/") ||
    lower.startsWith(".agents/")
  ) {
    return true;
  }

  if (!lower.startsWith("docs/")) return false;

  return [
    "/adrs/",
    "/adr/",
    "/agent/",
    "/agents/",
    "/ai/",
    "/architecture/",
    "/architectures/",
    "/assessment/",
    "/assessments/",
    "/audit/",
    "/audits/",
    "/consultant/",
    "/consultants/",
    "/diff-review/",
    "/diff-reviews/",
    "/review/",
    "/reviews/",
  ].some((segment) => `/${lower}`.includes(segment));
}

function getKind(relativePath: string): { kind: LocalDocKind; kindLabel: string } {
  const lower = relativePath.toLowerCase();
  if (lower.includes("diff-review") || lower.includes("diff_reviews")) {
    return { kind: "diff-review", kindLabel: "Diff review" };
  }
  if (lower.includes("audit") || lower.includes("assessment")) {
    return { kind: "audit", kindLabel: "Audit" };
  }
  if (lower.includes("consultant") || lower.includes("brief")) {
    return { kind: "consultant", kindLabel: "Consultant" };
  }
  if (lower.includes("architecture") || lower.includes("/adr") || lower.includes("/adrs")) {
    return { kind: "architecture", kindLabel: "Architecture" };
  }
  if (
    lower === "agents.md" ||
    lower === "claude.md" ||
    lower.startsWith(".codex/") ||
    lower.startsWith(".agents/")
  ) {
    return { kind: "agent-context", kindLabel: "Agent context" };
  }

  return { kind: "document", kindLabel: "Document" };
}

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  const after = markdown.indexOf("\n", end + 4);
  return after === -1 ? "" : markdown.slice(after + 1);
}

function getFrontmatterTitle(markdown: string) {
  if (!markdown.startsWith("---")) return "";
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return "";
  const frontmatter = markdown.slice(3, end);
  const titleLine = frontmatter
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("title:"));
  if (!titleLine) return "";
  return titleLine
    .slice(titleLine.indexOf(":") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

function titleFromPath(relativePath: string) {
  const basename = path.basename(relativePath, path.extname(relativePath));
  return basename
    .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_]?/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function getTitle(markdown: string, relativePath: string) {
  const frontmatterTitle = getFrontmatterTitle(markdown);
  if (frontmatterTitle) return frontmatterTitle;

  const body = stripFrontmatter(markdown);
  const heading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, "").trim();

  return titleFromPath(relativePath) || relativePath;
}

function getExcerpt(markdown: string) {
  const body = stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*]\s+/, "")
        .trim(),
    )
    .find((line) => line.length > 0);

  if (!body) return "";
  return body.length > 160 ? `${body.slice(0, 157).trim()}...` : body;
}

function createDocumentId(repo: string, relativePath: string) {
  return Buffer.from(`${repo}\0${relativePath}`).toString("base64url");
}

async function walkMarkdownFiles(root: string, current: string, output: string[]) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walkMarkdownFiles(root, path.join(current, entry.name), output);
      continue;
    }

    if (!entry.isFile()) continue;
    const absolutePath = path.join(current, entry.name);
    const relativePath = toRelativePosix(root, absolutePath);
    if (shouldIncludeDocument(relativePath)) output.push(absolutePath);
  }
}

async function readSummary(source: LocalDocSource, absolutePath: string) {
  const fileStat = await stat(absolutePath);
  const relativePath = toRelativePosix(source.path, absolutePath);
  const { kind, kindLabel } = getKind(relativePath);

  if (fileStat.size > MAX_DOCUMENT_BYTES) {
    return null;
  }

  const markdown = await readFile(absolutePath, "utf8");
  return {
    id: createDocumentId(source.name, relativePath),
    repo: source.name,
    repoPath: source.path,
    relativePath,
    absolutePath,
    title: getTitle(markdown, relativePath),
    kind,
    kindLabel,
    excerpt: getExcerpt(markdown),
    modifiedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
  } satisfies LocalDocSummary;
}

export async function getLocalDocsIndex() {
  const config = parseSources();
  const documents: LocalDocSummary[] = [];
  const errors = [...config.errors];

  for (const source of config.sources) {
    try {
      const rootStat = await stat(source.path);
      if (!rootStat.isDirectory()) {
        errors.push(`${source.name} is not a directory: ${source.path}`);
        continue;
      }

      const files: string[] = [];
      await walkMarkdownFiles(source.path, source.path, files);
      for (const file of files) {
        const summary = await readSummary(source, file);
        if (summary) documents.push(summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Could not scan ${source.name}: ${message}`);
    }
  }

  documents.sort((a, b) => {
    const byRepo = a.repo.localeCompare(b.repo);
    if (byRepo !== 0) return byRepo;
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  return {
    enabled: config.enabled,
    sources: config.sources,
    documents,
    errors,
  };
}

export async function getLocalDoc(id: string) {
  const index = await getLocalDocsIndex();
  const summary = index.documents.find((document) => document.id === id);
  if (!summary) return null;

  const markdown = await readFile(summary.absolutePath, "utf8");
  const html = renderMarkdown(stripFrontmatter(markdown));
  return {
    ...summary,
    markdown,
    html,
    contentHash: createHash("sha256").update(markdown).digest("hex"),
  } satisfies LocalDocDetail;
}

export async function getLocalDocsPayload(selectedId?: string | null): Promise<LocalDocsPayload> {
  const index = await getLocalDocsIndex();
  const selectedSummary = selectedId
    ? index.documents.find((document) => document.id === selectedId) ?? index.documents[0]
    : index.documents[0];
  const selectedDocument = selectedSummary ? await getLocalDoc(selectedSummary.id) : null;

  return {
    ...index,
    selectedDocument,
    generatedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a class="text-blue-600 underline underline-offset-2 dark:text-blue-400" href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      html.push(`<ol>${orderedItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      orderedItems = [];
    }
  };

  const flushCode = () => {
    html.push(
      `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      orderedItems = [];
      listItems.push(bullet[1].trim());
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line.trim());
    if (ordered) {
      flushParagraph();
      listItems = [];
      orderedItems.push(ordered[1].trim());
      continue;
    }

    if (line.trim().startsWith(">")) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInline(line.trim().replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (inCode) flushCode();

  return html.join("\n");
}
