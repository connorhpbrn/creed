// Splits Markdown into heading-scoped sections and diffs two versions of a
// document section-by-section, so the review UI can tie each change to the
// section it lives in. Documents in the workspace have dynamic, arbitrarily
// nested headings (unlike the fixed personal-profile sections), so this is
// framework-free and driven purely by ATX headings in the Markdown body.
//
// Pure and dependency-free on purpose: it is imported by the client review
// panel and is trivially unit-testable in isolation.

export type MarkdownSection = {
  // Stable identity used to match a section across two versions. Built from the
  // heading text + level (+ an occurrence index to disambiguate duplicates).
  key: string;
  // Display heading text ("" for the preamble that precedes the first heading).
  heading: string;
  // 0 for the preamble, 1-6 for an ATX heading (`#`..`######`).
  level: number;
  // The section's full text, including its own heading line.
  body: string;
};

export type SectionChangeStatus = "added" | "removed" | "modified" | "unchanged";

export type SectionChange = {
  key: string;
  heading: string;
  level: number;
  status: SectionChangeStatus;
  before: string;
  after: string;
};

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
const PREAMBLE_KEY = "__preamble__";

function normalizeHeading(heading: string) {
  return heading.trim().toLowerCase();
}

// Split a Markdown body into ordered sections. Everything before the first
// heading becomes a single preamble section (only emitted when it has content);
// every heading starts a new section whose body runs until the next heading.
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const normalized = (markdown ?? "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");

  const sections: MarkdownSection[] = [];
  const seen = new Map<string, number>();

  let currentLines: string[] = [];
  let currentHeading = "";
  let currentLevel = 0;

  const flush = () => {
    const body = currentLines.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
    // Skip an empty preamble, but always keep real heading sections even when
    // their body is only the heading line.
    if (currentLevel === 0 && body.trim().length === 0) {
      return;
    }
    const baseKey =
      currentLevel === 0 ? PREAMBLE_KEY : `h${currentLevel}:${normalizeHeading(currentHeading)}`;
    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);
    const key = occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`;
    sections.push({ key, heading: currentHeading, level: currentLevel, body });
  };

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      flush();
      currentLines = [line];
      currentHeading = match[2].trim();
      currentLevel = match[1].length;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// Diff two Markdown bodies section-by-section. Sections are matched by key;
// the result follows the "after" reading order, with removed sections appended
// in their original order so nothing is silently dropped.
export function diffMarkdownSections(before: string, after: string): SectionChange[] {
  const beforeSections = splitMarkdownSections(before);
  const afterSections = splitMarkdownSections(after);

  const beforeByKey = new Map(beforeSections.map((section) => [section.key, section]));
  const afterKeys = new Set(afterSections.map((section) => section.key));

  const changes: SectionChange[] = [];

  for (const section of afterSections) {
    const previous = beforeByKey.get(section.key);
    if (!previous) {
      changes.push({
        key: section.key,
        heading: section.heading,
        level: section.level,
        status: "added",
        before: "",
        after: section.body,
      });
      continue;
    }
    const status: SectionChangeStatus =
      previous.body.trim() === section.body.trim() ? "unchanged" : "modified";
    changes.push({
      key: section.key,
      heading: section.heading,
      level: section.level,
      status,
      before: previous.body,
      after: section.body,
    });
  }

  for (const section of beforeSections) {
    if (afterKeys.has(section.key)) continue;
    changes.push({
      key: section.key,
      heading: section.heading,
      level: section.level,
      status: "removed",
      before: section.body,
      after: "",
    });
  }

  return changes;
}

// A friendly label for a section change row. The preamble has no heading, so
// it reads as "Intro"; real sections use their heading text.
export function sectionChangeLabel(change: Pick<SectionChange, "heading" | "level">) {
  if (change.level === 0 || !change.heading) {
    return "Intro";
  }
  return change.heading;
}
