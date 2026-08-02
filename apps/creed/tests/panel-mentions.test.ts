import test from "node:test";
import assert from "node:assert/strict";
import { rankMentionSections } from "../lib/panel/mentions.ts";

// The autocomplete ranking is the one pure piece of mention logic (caret
// detection lives in the input component, against the live DOM). It must rank
// prefix matches above substrings and treat an empty query as "list all".

const SECTIONS = [
  { id: "work", name: "Work" },
  { id: "pj", name: "Product Judgment" },
  { id: "goals", name: "Goals" },
];

test("rankMentionSections lists all sections for an empty query", () => {
  assert.equal(rankMentionSections(SECTIONS, "").length, 3);
});

test("rankMentionSections ranks prefix matches above substrings", () => {
  const ranked = rankMentionSections(SECTIONS, "product");
  assert.equal(ranked[0].id, "pj");
});

test("rankMentionSections matches on a substring, space-insensitively", () => {
  const ranked = rankMentionSections(SECTIONS, "judgment");
  assert.deepEqual(
    ranked.map((section) => section.id),
    ["pj"],
  );
});

test("rankMentionSections matches multi-word names without caring about separators", () => {
  const ranked = rankMentionSections(SECTIONS, "product_judg");
  assert.deepEqual(
    ranked.map((section) => section.id),
    ["pj"],
  );
});

test("rankMentionSections drops sections that don't match", () => {
  assert.deepEqual(rankMentionSections(SECTIONS, "zzz"), []);
});
