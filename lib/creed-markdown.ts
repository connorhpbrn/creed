import type { AccentKey, CreedSection } from "./creed-data.ts";
import { markdownToRichHtml } from "./rich-text.ts";

type ParseResult = {
  sections: CreedSection[];
  warnings: string[];
};

const KNOWN_SECTION_IDS: Record<string, string> = {
  // Personal-profile sections (the new default).
  identity: "identity",
  beliefs: "beliefs",
  values: "beliefs",
  goals: "goals",
  work: "work",
  preferences: "preferences",
  constraints: "constraints",
  people: "people",
  health: "health",
  routines: "routines",
  context: "context",
  // Legacy section names — still recognised when re-importing older Creeds.
  stack: "work",
  "tools and spaces": "work",
  tools: "work",
  conventions: "operating-principles",
  "operating principles": "operating-principles",
  principles: "operating-principles",
  workflows: "routines",
  workflow: "routines",
  decisions: "operating-principles",
  "current focus": "goals",
  boundaries: "constraints",
  "open questions": "context",
  questions: "context",
  "how to improve this creed": "context",
  output: "preferences",
};

const KNOWN_SECTION_ACCENTS: Record<string, AccentKey> = {
  identity: "identity",
  beliefs: "operating-principles",
  values: "operating-principles",
  goals: "projects",
  work: "tools",
  preferences: "preferences",
  constraints: "boundaries",
  people: "rose",
  health: "mini-skills",
  routines: "workflows",
  context: "custom",
  // Legacy mappings.
  stack: "tools",
  "tools and spaces": "tools",
  tools: "tools",
  conventions: "operating-principles",
  "operating principles": "operating-principles",
  principles: "operating-principles",
  workflows: "workflows",
  workflow: "workflows",
  decisions: "decisions",
  "current focus": "custom",
  boundaries: "boundaries",
  "open questions": "questions",
  questions: "questions",
  "how to improve this creed": "custom",
  output: "preferences",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSectionId(base: string, usedIds: Set<string>) {
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let index = 2;
  while (usedIds.has(`${base}-${index}`)) {
    index += 1;
  }
  const next = `${base}-${index}`;
  usedIds.add(next);
  return next;
}

function inferAccent(name: string): AccentKey {
  return KNOWN_SECTION_ACCENTS[name.toLowerCase()] ?? "custom";
}


function parseSectionBody(
  id: string,
  name: string,
  body: string,
  _index: number
): CreedSection {
  const normalizedBody = body.trim();

  function makeRichTextSection(content: string, template: CreedSection["template"] = "freeform"): CreedSection {
    return {
      id,
      kind: "rich-text",
      template,
      name,
      accent: inferAccent(name),
      content,
      // Pulled sections must be agent-writable, matching every other
      // creation path (onboarding, in-app create, agent-create). If this
      // is `false`, the MCP contract reports `editable_sections: []` and
      // every connected agent (Codex, Claude, etc.) says "no editable
      // sections" even though the content is in the read payload.
      agentWritable: true,
      lastEditedBy: "GitHub",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    };
  }

  // Pull is the inverse of push, and it must be lossless. `sectionToMarkdown`
  // (the push side) shifts heading levels DOWN by one (`<h2>` → `### Title`,
  // `<h3>` → `#### Title`) so the section's own `## Name` stays at the top
  // of the hierarchy. We undo that shift here before delegating to
  // `markdownToRichHtml`, so:
  //   `### Subtitle` → `## Subtitle` → <h2> (matches the editor's h2)
  //   `#### Subtitle` → `### Subtitle` → <h3>
  // Without this un-shift, h2 sub-headings come back as h3 and h3
  // sub-headings get dropped entirely (markdownToRichHtml doesn't handle
  // `####` so it falls through to a paragraph).
  const unshifted = normalizedBody.replace(
    /^(#{3,5})\s+(.*)$/gm,
    (_match, hashes: string, rest: string) =>
      `${"#".repeat(hashes.length - 1)} ${rest}`
  );

  // Earlier versions of this parser tried to "smart-detect" the section
  // template (decisions, rules, chip stack, focus) and re-template the
  // content. That detection misfired on freeform sections that happened
  // to look list-shaped, reformatting bullets into <strong>-prefixed
  // entries or converting paragraphs into chips. Round-tripping (push →
  // pull) is now strictly the inverse of the push serialiser:
  // markdown-in, rich-text-out, no template guessing.
  return makeRichTextSection(
    markdownToRichHtml(unshifted || "Start shaping this section.")
  );
}

export function parseCreedMarkdown(markdown: string): ParseResult {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const warnings: string[] = [];

  if (!normalized) {
    return { sections: [], warnings: ["The file is empty."] };
  }

  const headingMatches = Array.from(normalized.matchAll(/^##?\s+(.+)$/gm));
  if (headingMatches.length === 0) {
    return { sections: [], warnings: ["No section headings were found in the markdown file."] };
  }

  const usedIds = new Set<string>();
  const sections = headingMatches.map((match, index) => {
    const name = match[1]?.trim() || `Section ${index + 1}`;
    const start = (match.index ?? 0) + match[0].length;
    const end = headingMatches[index + 1]?.index ?? normalized.length;
    const body = normalized.slice(start, end).trim();
    const slug = slugify(name);
    const baseId = KNOWN_SECTION_IDS[name.toLowerCase()] ?? (slug || `section-${index + 1}`);
    const id = uniqueSectionId(baseId, usedIds);
    return parseSectionBody(id, name, body, index);
  });

  return { sections, warnings };
}
