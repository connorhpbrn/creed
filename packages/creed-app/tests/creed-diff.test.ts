import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDiffMarkdown, computeCreedDiff } from "../lib/creed-diff.ts";

test("canonicalDiffMarkdown preserves rich-text structure as markdown", () => {
  const markdown = canonicalDiffMarkdown(
    '<h2>Plan</h2><ul><li>First</li><li>Second</li></ul><blockquote><p>Note</p></blockquote><pre><code>const ready = true;</code></pre>',
  );

  assert.match(markdown, /^### Plan/m);
  assert.match(markdown, /^- First$/m);
  assert.match(markdown, /^- Second$/m);
  assert.match(markdown, /^> Note$/m);
  assert.match(markdown, /^```$/m);
  assert.match(markdown, /^const ready = true;$/m);
});

test("equivalent HTML and markdown produce no diff", () => {
  const diff = computeCreedDiff(
    '<h2>Plan</h2><ul><li>First</li></ul>',
    "## Plan\n\n- First",
  );

  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
});

test("a new section counts every added markdown line", () => {
  const diff = computeCreedDiff("", "## Plan\n\n- First\n- Second");

  assert.equal(diff.added, 4);
  assert.equal(diff.removed, 0);
  assert.deepEqual(
    diff.lines.map((line) => [line.kind, line.value]),
    [
      ["added", "### Plan"],
      ["added", ""],
      ["added", "- First"],
      ["added", "- Second"],
    ],
  );
});

test("a deleted section counts and exposes every removed markdown line", () => {
  const diff = computeCreedDiff(
    '<h2>Plan</h2><ul><li>First</li><li>Second</li></ul>',
    "",
  );

  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 4);
  assert.equal(diff.lines[0].value, "### Plan");
  assert.equal(diff.lines.at(-1)?.value, "- Second");
});

test("changed lines retain word-level detail", () => {
  const diff = computeCreedDiff("Ship in May", "Ship in June");
  const removed = diff.lines.find((line) => line.kind === "removed");
  const added = diff.lines.find((line) => line.kind === "added");

  assert.ok(removed?.inlineParts?.some((part) => part.removed && part.value === "May"));
  assert.ok(added?.inlineParts?.some((part) => part.added && part.value === "June"));
});
