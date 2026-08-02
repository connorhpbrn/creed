import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createStarterContent,
  getSectionSuggestions,
  hasSectionName,
} from "../lib/creed-data.ts";

test("section suggestions exclude existing names regardless of case or spacing", () => {
  const suggestions = getSectionSuggestions([
    " beliefs ",
    "Decision   Making",
    "TRAVEL",
  ]);
  const names = suggestions.map((suggestion) => suggestion.name);

  assert.equal(names.includes("Beliefs"), false);
  assert.equal(names.includes("Decision Making"), false);
  assert.equal(names.includes("Travel"), false);
});

test("section suggestions are deterministic and limited", () => {
  const existingNames = ["Identity", "Goals", "Work"];

  assert.deepEqual(
    getSectionSuggestions(existingNames),
    getSectionSuggestions(existingNames),
  );
  assert.equal(getSectionSuggestions(existingNames).length, 6);
});

test("hasSectionName detects normalized duplicates", () => {
  assert.equal(hasSectionName(["Creative Work"], " creative   work "), true);
  assert.equal(hasSectionName(["Creative Work"], "Projects"), false);
});

test("custom starter content does not repeat the section name as a heading", () => {
  const starter = createStarterContent("Hello");

  assert.doesNotMatch(starter, /<h[1-6][^>]*>/);
  assert.doesNotMatch(starter, />Hello</);
  assert.match(starter, /^<p>/);
});
