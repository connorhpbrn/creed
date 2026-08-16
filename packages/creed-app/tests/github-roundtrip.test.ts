import test from "node:test";
import assert from "node:assert/strict";
import { sectionToMarkdown } from "@creed/core/creed-data";
import { parseCreedMarkdown } from "@creed/core/creed-markdown";
import { markdownToRichHtml } from "@creed/core/rich-text";
import type { CreedSection } from "@creed/core/creed-data";

// Round-trip the push → pull pipeline. Each test pushes a section through
// `sectionToMarkdown` (the editor → markdown serializer used on push), then
// glues the section heading on top the same way `buildVisibleCreedMarkdown`
// does for a single section, then runs `parseCreedMarkdown` (the pull-side
// parser) and verifies the resulting rich-text HTML matches the original
// editor content.

function makeSection(overrides: Partial<CreedSection> & { content: string }): CreedSection {
  return {
    id: "test-section",
    kind: "rich-text",
    template: "freeform",
    name: "Test Section",
    accent: "custom",
    agentWritable: false,
    agentPermission: "read-only",
    lastEditedBy: "You",
    lastEditedType: "user",
    lastEditedLabel: "just now",
    ...overrides,
  };
}

function roundtripContent(content: string): string {
  const section = makeSection({ content });
  const markdown = sectionToMarkdown(section);
  const { sections } = parseCreedMarkdown(markdown);
  assert.equal(sections.length, 1, "round-trip should yield exactly one section");
  return sections[0].content;
}

test("paragraph round-trip preserves plain text", () => {
  const result = roundtripContent("<p>Plain paragraph text.</p>");
  assert.ok(result.includes("Plain paragraph text."));
  assert.ok(result.includes("<p>"));
});

test("paragraph + heading + bullets round-trip preserves structure", () => {
  const editor =
    `<p>Opening paragraph.</p>` +
    `<h3>Sub-heading</h3>` +
    `<ul class="creed-list creed-list-bullet">` +
    `<li class="creed-list-item">first bullet</li>` +
    `<li class="creed-list-item">second bullet</li>` +
    `</ul>`;
  const result = roundtripContent(editor);
  assert.ok(result.includes("<p>Opening paragraph"), `missing paragraph in: ${result}`);
  assert.ok(result.includes("<h3>"), `missing h3 in: ${result}`);
  assert.ok(result.includes("Sub-heading"), `missing heading text in: ${result}`);
  assert.ok(result.includes("<ul"), `missing list in: ${result}`);
  assert.ok(result.includes("first bullet"), `missing first bullet in: ${result}`);
  assert.ok(result.includes("second bullet"), `missing second bullet in: ${result}`);
});

test("h2 round-trip ends up as h2 again (not h3)", () => {
  const result = roundtripContent("<h2>Subtitle</h2><p>body</p>");
  assert.ok(result.includes("<h2>Subtitle</h2>"), `expected h2 to round-trip, got: ${result}`);
});

test("h4 markdown proposals become h4 instead of literal hashes", () => {
  const result = markdownToRichHtml("#### What I Believe\n\nBody.");
  assert.ok(result.includes("<h4>What I Believe</h4>"), `expected h4, got: ${result}`);
  assert.ok(!result.includes("####"), `literal hashes leaked into output: ${result}`);
});

test("h4 round-trip ends up as h4 again", () => {
  const result = roundtripContent("<h4>Small Subtitle</h4><p>body</p>");
  assert.ok(result.includes("<h4>Small Subtitle</h4>"), `expected h4 to round-trip, got: ${result}`);
});

test("blockquote round-trip preserves callout", () => {
  const result = roundtripContent("<blockquote class=\"creed-callout\"><p>Reminder.</p></blockquote>");
  assert.ok(result.includes("<blockquote"), `missing blockquote in: ${result}`);
  assert.ok(result.includes("Reminder"), `missing quote text in: ${result}`);
});

test("checklist markdown becomes a task list", () => {
  const result = markdownToRichHtml("- [ ] Open item\n- [x] Done item");
  assert.match(result, /data-type="taskList"/);
  assert.match(result, /data-checked="false"/);
  assert.match(result, /data-checked="true"/);
  assert.match(result, /Open item/);
  assert.match(result, /Done item/);
  assert.doesNotMatch(result, /creed-list-bullet/);
});

test("checklist round-trip preserves checked state", () => {
  const editor =
    `<ul class="creed-list creed-list-task" data-type="taskList">` +
    `<li class="creed-list-item" data-type="taskItem" data-checked="false"><p>Open item</p></li>` +
    `<li class="creed-list-item" data-type="taskItem" data-checked="true"><p>Done item</p></li>` +
    `</ul>`;
  const result = roundtripContent(editor);
  assert.match(result, /data-type="taskList"/);
  assert.match(result, /data-checked="false"/);
  assert.match(result, /data-checked="true"/);
  assert.match(result, /Open item/);
  assert.match(result, /Done item/);
});

test("a leading checkbox is not parsed as a bullet", () => {
  const result = markdownToRichHtml("- [x] Keep this as a checklist");
  assert.match(result, /data-type="taskItem"/);
  assert.doesNotMatch(result, /\[x\]/);
});

test("gfm table markdown becomes a creed table", () => {
  const result = markdownToRichHtml(
    "| Person | Role |\n| --- | --- |\n| Maya | co-founder |",
  );
  assert.match(result, /<table class="creed-table">/);
  assert.match(result, /<th><p>Person<\/p><\/th>/);
  assert.match(result, /<td><p>Maya<\/p><\/td>/);
});

test("table round-trip preserves header and body cells", () => {
  const editor =
    `<table class="creed-table"><tbody>` +
    `<tr><th><p>Person</p></th><th><p>Role</p></th></tr>` +
    `<tr><td><p>Maya</p></td><td><p>co-founder</p></td></tr>` +
    `</tbody></table>`;
  const result = roundtripContent(editor);
  assert.match(result, /<table/);
  assert.match(result, /<th><p>Person<\/p><\/th>/);
  assert.match(result, /<td><p>Maya<\/p><\/td>/);
  assert.match(result, /co-founder/);
});

test("headerless table round-trip stays body cells", () => {
  const editor =
    `<table class="creed-table"><tbody>` +
    `<tr><td><p>Maya</p></td><td><p>co-founder</p></td></tr>` +
    `<tr><td><p>Alex</p></td><td><p>engineer</p></td></tr>` +
    `</tbody></table>`;
  const result = roundtripContent(editor);
  assert.match(result, /<table class="creed-table">/);
  assert.match(result, /<td><p>Maya<\/p><\/td>/);
  assert.match(result, /<td><p>Alex<\/p><\/td>/);
  assert.doesNotMatch(result, /<th>/);
});

test("empty header row still round-trips as a header", () => {
  const editor =
    `<table class="creed-table"><tbody>` +
    `<tr><th><p></p></th><th><p></p></th></tr>` +
    `<tr><td><p>Maya</p></td><td><p>co-founder</p></td></tr>` +
    `</tbody></table>`;
  const result = roundtripContent(editor);
  assert.match(result, /<th>/);
  assert.match(result, /<td><p>Maya<\/p><\/td>/);
});

test("inline bold and italic round-trip", () => {
  const result = roundtripContent("<p>This is <strong>bold</strong> and <em>italic</em>.</p>");
  assert.ok(result.includes("<strong>bold</strong>"), `missing bold: ${result}`);
  assert.ok(result.includes("<em>italic</em>"), `missing italic: ${result}`);
});

test("multi-paragraph round-trip yields multiple paragraphs", () => {
  const result = roundtripContent("<p>First.</p><p>Second.</p><p>Third.</p>");
  const paragraphs = result.match(/<p>/g);
  assert.ok(paragraphs && paragraphs.length === 3, `expected 3 paragraphs, got: ${result}`);
});

test("does not collapse paragraphs into bullet list", () => {
  const result = roundtripContent(
    "<p>Identity statement here.</p><p>Core posture text follows below.</p>"
  );
  assert.ok(!result.includes("<ul"), `unexpected list in: ${result}`);
  assert.ok(!result.includes("<li>"), `unexpected list item in: ${result}`);
});
