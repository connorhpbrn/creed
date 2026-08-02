// Pure-function tests for the Tab autocomplete prompt assembly and completion
// sanitizer. Run manually with:
//
//   node --test --experimental-strip-types tests/tab-completion.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildTabContext,
  buildTabUserPrompt,
  sanitizeTabCompletion,
} from "../lib/ai/tab.ts";

const section = (id: string, name: string, content: string) => ({
  id,
  name,
  content,
});

test("buildTabContext: excludes the target section body", () => {
  const context = buildTabContext(
    [
      section("identity", "Identity", "I build Creed."),
      section("goals", "Goals", "Ship Tab autocomplete."),
    ],
    "goals",
  );
  assert.ok(context.includes("I build Creed."));
  assert.ok(!context.includes("Ship Tab autocomplete."));
});

test("buildTabContext: keeps every section whole under the budget", () => {
  const context = buildTabContext(
    [
      section("identity", "Identity", "a".repeat(2000)),
      section("people", "People", "b".repeat(2000)),
    ],
    "goals",
  );
  assert.ok(!context.includes("[truncated]"));
});

test("buildTabContext: over budget, optional sections truncate harder than core", () => {
  const context = buildTabContext(
    [
      section("identity", "Identity", "a".repeat(20000)),
      section("people", "People", "b".repeat(20000)),
    ],
    "goals",
  );
  const identityBody = /## Identity\n\n(a+)/.exec(context)?.[1] ?? "";
  const peopleBody = /## People\n\n(b+)/.exec(context)?.[1] ?? "";
  assert.ok(context.includes("[truncated]"));
  assert.ok(identityBody.length > peopleBody.length);
  assert.ok(identityBody.length <= 2400);
  assert.ok(peopleBody.length <= 1200);
});

test("buildTabUserPrompt: draft mode carries the section name and empty-file fallback", () => {
  const prompt = buildTabUserPrompt({
    context: "",
    sectionName: "Constraints",
    before: "",
    after: "",
    mode: "draft",
  });
  assert.ok(prompt.includes('The "Constraints" section is empty.'));
  assert.ok(prompt.includes("(the rest of the file is empty)"));
  assert.ok(prompt.includes("(none)"));
});

test("sanitizeTabCompletion: cuts at the first line break", () => {
  assert.equal(
    sanitizeTabCompletion("finishes the thought.\nAnd rambles on.", "It "),
    "finishes the thought.",
  );
});

test("sanitizeTabCompletion: collapses a duplicate leading space", () => {
  assert.equal(sanitizeTabCompletion("  next words", "ends with space "), "next words");
  assert.equal(sanitizeTabCompletion("   next words", "no space"), " next words");
  assert.equal(sanitizeTabCompletion("  Opening line", ""), "Opening line");
});

test("sanitizeTabCompletion: strips wrapping quotes and fences", () => {
  assert.equal(sanitizeTabCompletion('"quoted reply."', "x "), "quoted reply.");
  assert.equal(sanitizeTabCompletion("```text continues", "x "), "text continues");
});

test("sanitizeTabCompletion: keeps interior quotes intact", () => {
  assert.equal(
    sanitizeTabCompletion('call it "done" and move on.', "I "),
    'call it "done" and move on.',
  );
});

test("sanitizeTabCompletion: skips leading blank lines instead of emptying", () => {
  assert.equal(
    sanitizeTabCompletion("\n\nreal continuation.", "I said "),
    "real continuation.",
  );
});

test("sanitizeTabCompletion: shaves a leading continuation ellipsis", () => {
  assert.equal(
    sanitizeTabCompletion("...JavaScript daily.", "I work with TypeScript and "),
    "JavaScript daily.",
  );
});

test("sanitizeTabCompletion: strips an echoed prefix restart", () => {
  assert.equal(
    sanitizeTabCompletion(
      "I work with TypeScript and love strict mode.",
      "Most days I work with TypeScript and",
    ),
    " love strict mode.",
  );
});

test("sanitizeTabCompletion: keeps a short mid-word overlap unstripped", () => {
  // "Type" -> "TypeScript" is the model finishing a word, not an echo; the
  // overlap heuristic (12+ chars or contains a space) must leave it alone.
  assert.equal(
    sanitizeTabCompletion("TypeScript every day.", "I work with Type"),
    "TypeScript every day.",
  );
});
