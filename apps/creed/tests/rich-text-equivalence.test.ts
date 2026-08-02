// Pure-function tests for the whitespace-insensitive rich-text comparison that
// no-ops "the spacebar edit" - a save/proposal that added nothing but stray
// whitespace should never land an activity row.
//
//   node --test --experimental-strip-types tests/rich-text-equivalence.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { richTextContentEquivalent, normalizeHtmlWhitespace } from "../lib/rich-text.ts";

test("a trailing space is not a real change", () => {
  assert.equal(richTextContentEquivalent("<p>hello</p>", "<p>hello </p>"), true);
  assert.equal(richTextContentEquivalent("<p>hello</p>", "<p>hello&nbsp;</p>"), true);
});

test("whitespace between tags and runs of spaces collapse", () => {
  assert.equal(
    richTextContentEquivalent("<p>a</p><p>b</p>", "<p>a</p>\n  <p>b</p>"),
    true,
  );
  assert.equal(richTextContentEquivalent("<p>a b</p>", "<p>a  b</p>"), true);
});

test("adding a real letter IS a change", () => {
  assert.equal(richTextContentEquivalent("<p>hello</p>", "<p>hellox</p>"), false);
  assert.equal(richTextContentEquivalent("<p>hello</p>", "<p>hello world</p>"), false);
});

test("a formatting change (bold) IS a change even with identical text", () => {
  assert.equal(
    richTextContentEquivalent("<p>hello</p>", "<p><strong>hello</strong></p>"),
    false,
  );
});

test("empty vs whitespace-only body are equivalent", () => {
  assert.equal(richTextContentEquivalent("", "<p>&nbsp;</p>".replace("<p>&nbsp;</p>", " ")), true);
  assert.equal(richTextContentEquivalent("<p></p>", "<p> </p>"), true);
});

test("normalizeHtmlWhitespace trims and collapses", () => {
  assert.equal(normalizeHtmlWhitespace("  <p>a</p>  "), "<p>a</p>");
  assert.equal(normalizeHtmlWhitespace("<p>a&nbsp;&nbsp;b</p>"), "<p>a b</p>");
});
