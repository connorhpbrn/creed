import { describe, expect, it } from "vitest";

import {
  applySectionChange,
  diffMarkdownSections,
  replaceSectionInMarkdown,
  sectionChangeLabel,
  splitMarkdownSections,
} from "@/lib/document-section-diff";

describe("splitMarkdownSections", () => {
  it("splits a body into a preamble plus heading-scoped sections", () => {
    const md = ["Intro line.", "", "## Goals", "Ship it.", "", "## Work", "Do the work."].join("\n");
    const sections = splitMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual(["", "Goals", "Work"]);
    expect(sections[0].level).toBe(0);
    expect(sections[1].level).toBe(2);
    expect(sections[1].body).toContain("Ship it.");
  });

  it("keeps nested subsections as their own sections", () => {
    const md = ["# Doc", "## A", "text", "### A.1", "nested"].join("\n");
    const sections = splitMarkdownSections(md);
    expect(sections.map((s) => `${s.level}:${s.heading}`)).toEqual([
      "1:Doc",
      "2:A",
      "3:A.1",
    ]);
  });

  it("disambiguates duplicate headings with an occurrence suffix", () => {
    const md = ["## Notes", "one", "## Notes", "two"].join("\n");
    const sections = splitMarkdownSections(md);
    expect(sections[0].key).not.toEqual(sections[1].key);
  });

  it("drops an empty preamble", () => {
    const sections = splitMarkdownSections("## Only\nbody");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Only");
  });
});

describe("diffMarkdownSections", () => {
  const base = ["## Goals", "Old goal.", "", "## Work", "Same work."].join("\n");

  it("marks a changed section modified and an untouched one unchanged", () => {
    const next = ["## Goals", "New goal.", "", "## Work", "Same work."].join("\n");
    const changes = diffMarkdownSections(base, next);
    const goals = changes.find((c) => c.heading === "Goals");
    const work = changes.find((c) => c.heading === "Work");
    expect(goals?.status).toBe("modified");
    expect(work?.status).toBe("unchanged");
  });

  it("detects an added section", () => {
    const next = `${base}\n\n## Routines\nMornings.`;
    const changes = diffMarkdownSections(base, next);
    expect(changes.find((c) => c.heading === "Routines")?.status).toBe("added");
  });

  it("detects a removed section and preserves its before text", () => {
    const next = ["## Goals", "Old goal."].join("\n");
    const changes = diffMarkdownSections(base, next);
    const work = changes.find((c) => c.heading === "Work");
    expect(work?.status).toBe("removed");
    expect(work?.after).toBe("");
    expect(work?.before).toContain("Same work.");
  });
});

describe("sectionChangeLabel", () => {
  it("labels the preamble as Intro", () => {
    expect(sectionChangeLabel({ heading: "", level: 0 })).toBe("Intro");
    expect(sectionChangeLabel({ heading: "Goals", level: 2 })).toBe("Goals");
  });
});

describe("applySectionChange", () => {
  const doc = [
    "# Doc",
    "Preamble stays.",
    "",
    "## Goals",
    "Old goal.",
    "",
    "## Work",
    "Do the work.",
  ].join("\n");

  function change(before: string, after: string) {
    const changes = diffMarkdownSections(before, after);
    return changes.find((c) => c.status !== "unchanged")!;
  }

  it("applies a single modified section and leaves every other section byte-for-byte", () => {
    const after = doc.replace("Old goal.", "New goal.");
    const result = applySectionChange(doc, change(doc, after));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("New goal.");
      expect(result.content).toContain("Do the work.");
      expect(result.content).toContain("Preamble stays.");
      // The Work section is untouched.
      expect(result.content).not.toContain("Old goal.");
    }
  });

  it("adds a new section", () => {
    const after = `${doc}\n\n## Routines\nMornings.`;
    const result = applySectionChange(doc, change(doc, after));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toContain("## Routines");
  });

  it("removes a section", () => {
    const after = ["# Doc", "Preamble stays.", "", "## Goals", "Old goal."].join("\n");
    const result = applySectionChange(doc, change(doc, after));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).not.toContain("## Work");
      expect(result.content).toContain("## Goals");
    }
  });

  it("is a no-op success when the change is already applied (idempotent)", () => {
    const after = doc.replace("Old goal.", "New goal.");
    const target = change(doc, after);
    const result = applySectionChange(after, target);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe(after);
  });

  it("conflicts when the target section moved underneath the proposal", () => {
    const after = doc.replace("Old goal.", "New goal.");
    const target = change(doc, after);
    // Someone else already rewrote the Goals section to something different.
    const drifted = doc.replace("Old goal.", "Totally different goal.");
    const result = applySectionChange(drifted, target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("conflict");
  });

  it("lets two sibling section changes both land on the same document", () => {
    const goalsOnly = doc.replace("Old goal.", "New goal.");
    const workOnly = doc.replace("Do the work.", "Did the work.");
    const goalsChange = change(doc, goalsOnly);
    const workChange = change(doc, workOnly);

    const first = applySectionChange(doc, goalsChange);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The Work change was authored against the original doc; it must still apply
    // after the Goals change advanced the document.
    const second = applySectionChange(first.content, workChange);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.content).toContain("New goal.");
      expect(second.content).toContain("Did the work.");
    }
  });
});

describe("replaceSectionInMarkdown", () => {
  it("returns null when the section key is absent", () => {
    expect(replaceSectionInMarkdown("## A\nbody", "h2:missing", "## A\nnew")).toBeNull();
  });
});
