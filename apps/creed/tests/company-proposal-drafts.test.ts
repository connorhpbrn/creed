// Pure-function tests for company rename/recolour proposal hydration.
//
//   node --test --experimental-strip-types tests/company-proposal-drafts.test.ts
//
// A metadata-only company draft (a rename or recolour filed with no body change)
// is stored as rich-text with just a name/accent. normalizeLegacyProposalDraft
// must surface it as its dedicated kind so the reviewer sees a real before/after
// instead of "No textual change" (MAJOR-2).

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeLegacyProposalDraft, type ProposalDraft } from "../lib/creed-data.ts";

// The function normalizes loosely-typed stored jsonb, so tests pass raw shapes.
const raw = (o: Record<string, unknown>) => o as unknown as ProposalDraft;

test("metadata-only rich-text with a name becomes rename-section", () => {
  const out = normalizeLegacyProposalDraft(raw({ kind: "rich-text", name: "New name" }));
  assert.equal(out.kind, "rename-section");
  assert.equal((out as { name: string }).name, "New name");
});

test("metadata-only rich-text with an accent becomes recolor-section", () => {
  const out = normalizeLegacyProposalDraft(raw({ kind: "rich-text", accent: "emerald" }));
  assert.equal(out.kind, "recolor-section");
  assert.equal((out as { accent: string }).accent, "emerald");
});

test("combined rename+recolour with no content prefers rename (no 'No textual change')", () => {
  const out = normalizeLegacyProposalDraft(raw({ kind: "rich-text", name: "New name", accent: "emerald" }));
  assert.equal(out.kind, "rename-section");
  assert.equal((out as { name: string }).name, "New name");
});

test("rich-text carrying content stays rich-text (content edit wins)", () => {
  const out = normalizeLegacyProposalDraft(
    raw({ kind: "rich-text", contentHtml: "<p>hello</p>", name: "Also renamed" }),
  );
  assert.equal(out.kind, "rich-text");
  assert.equal((out as { contentHtml?: string }).contentHtml, "<p>hello</p>");
});

test("plain rich-text stays rich-text", () => {
  const out = normalizeLegacyProposalDraft(raw({ kind: "rich-text", contentHtml: "<p>x</p>" }));
  assert.equal(out.kind, "rich-text");
});

test("dedicated rename-section / recolor-section pass through unchanged", () => {
  assert.equal(normalizeLegacyProposalDraft(raw({ kind: "rename-section", name: "N" })).kind, "rename-section");
  assert.equal(
    normalizeLegacyProposalDraft(raw({ kind: "recolor-section", accent: "rose" })).kind,
    "recolor-section",
  );
});
