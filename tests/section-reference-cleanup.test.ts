import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  removeSectionReferences,
  removeSectionReferencesFromSections,
} from "../lib/rich-text.ts";

const TARGET = { id: "product-judgment", name: "Product Judgment" };

test("removes current id-backed section references everywhere", () => {
  const sections = removeSectionReferencesFromSections(
    [
      {
        id: "identity",
        content:
          '<p>See <span class="creed-inline-tag" data-tag="product-judgment">Product Judgment</span> for context.</p>',
      },
      {
        id: "goals",
        content:
          '<p><span data-tag="product-judgment" class="creed-inline-tag">Product Judgment</span></p>',
      },
      {
        id: TARGET.id,
        content: "<p>Deleted body</p>",
      },
    ],
    TARGET,
  );

  assert.deepEqual(sections, [
    { id: "identity", content: "<p>See for context.</p>" },
    { id: "goals", content: "" },
  ]);
});

test("removes legacy name-backed references with separator tolerance", () => {
  const html =
    '<p><span class="other creed-inline-tag selected" data-tag="Product_Judgment">Product Judgment</span> remains relevant.</p>';

  assert.equal(
    removeSectionReferences(html, TARGET),
    "<p>remains relevant.</p>",
  );
});

test("leaves plain hashtags and similarly named section references untouched", () => {
  const html =
    '<p>#Product-Judgment <span class="creed-inline-tag" data-tag="product-judgment-notes">Product Judgment Notes</span> <span class="creed-inline-tag" data-tag="goals">Goals</span></p>';

  assert.equal(removeSectionReferences(html, TARGET), html);
});

test("removes multiple references without leaving doubled whitespace", () => {
  const html =
    '<p>Related: <span class="creed-inline-tag" data-tag="product-judgment">Product Judgment</span> <span class="creed-inline-tag" data-tag="goals">Goals</span> and <span class="creed-inline-tag" data-tag="Product Judgment">Product Judgment</span>.</p>';

  assert.equal(
    removeSectionReferences(html, TARGET),
    '<p>Related: <span class="creed-inline-tag" data-tag="goals">Goals</span> and.</p>',
  );
});

test("returns the original string when no matching reference exists", () => {
  const html =
    '<p><span class="creed-inline-tag" data-tag="goals">Goals</span></p>';

  assert.equal(removeSectionReferences(html, TARGET), html);
});
