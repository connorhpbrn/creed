import assert from "node:assert/strict";
import test from "node:test";
import { creedMarkdownFilename } from "../lib/creed-filename.ts";

test("Creed exports preserve readable names", () => {
  assert.equal(creedMarkdownFilename("Connor"), "Connor.md");
  assert.equal(creedMarkdownFilename("Product Strategy"), "Product Strategy.md");
  assert.equal(creedMarkdownFilename("Connor.md"), "Connor.md");
});

test("Creed exports remove unsafe filename characters", () => {
  assert.equal(creedMarkdownFilename(" Product / Strategy:* "), "Product Strategy.md");
  assert.equal(creedMarkdownFilename("CON"), "CON Creed.md");
  assert.equal(creedMarkdownFilename("   "), "Creed.md");
});
