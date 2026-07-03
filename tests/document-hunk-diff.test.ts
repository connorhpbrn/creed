import { describe, expect, it } from "vitest";

import { diffDocumentHunks } from "@/lib/document-hunk-diff";

describe("document hunk labels", () => {
  it("uses heading context and changed wording for short descriptive titles", () => {
    const before = [
      "## Executive Summary",
      "",
      "Creator Platform lets sellers sell recipes.",
    ].join("\n");
    const after = [
      "## Executive Summary",
      "",
      "Creator Platform lets approved sellers monetise eligible recipes.",
    ].join("\n");

    const hunks = diffDocumentHunks(before, after);

    expect(hunks.map((hunk) => hunk.classification)).toEqual([
      "Executive Summary: adds approved",
      "Executive Summary: revises monetise eligible",
    ]);
    expect(hunks.every((hunk) => hunk.classification !== "Executive Summary update")).toBe(true);
    expect(hunks.every((hunk) => hunk.classification.length <= 72)).toBe(true);
  });

  it("names added heading blocks by the new section", () => {
    const before = "## Executive Summary\n\nExisting text.";
    const after = `${before}\n\n## Refund Rules\n\nRefunds stay under review for 30 days.`;

    const hunks = diffDocumentHunks(before, after);

    expect(hunks.at(-1)?.classification).toBe("adds Refund Rules section");
  });
});
