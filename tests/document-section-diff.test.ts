import { describe, expect, it } from "vitest";

import {
  diffMarkdownSections,
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
