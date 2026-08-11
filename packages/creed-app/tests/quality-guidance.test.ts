import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const rubric = source("../lib/ai/quality-rubric.ts");
const quality = source("../lib/ai/quality.ts");
const qualityUi = source("../components/creed/file-quality-ui.tsx");
const mcp = source("../app/mcp/route.ts");

test("quality analysis requires safe structured guidance", () => {
  assert.match(rubric, /"edit", "ask", "remove", "move", "review"/);
  assert.match(rubric, /Never invent personal or shared information/);
  assert.match(rubric, /targetSectionIds/);
  assert.match(rubric, /requiresUserInput/);
  assert.match(rubric, /required: \["summary", "tags", "strength", "gap", "guidance"\]/);
  assert.match(quality, /legacyFocus: raw\?\.focus/);
  assert.match(quality, /focus: guidance\?\.detail \?\? ""/);
  assert.match(rubric, /One red tag caps a section below 90/);
  assert.match(rubric, /Scores of 90 or higher may use only green tags/);
  assert.match(quality, /reconcileOverallEvidence/);
  assert.match(quality, /if \(!gap && score < 90\)/);
  assert.match(quality, /gap: overallEvidence\.gap/);
  assert.match(quality, /tagsForScore/);
});

test("quality UI renders Guidance as an amber slash row", () => {
  assert.match(qualityUi, /tone="guidance"/);
  assert.match(qualityUi, /var\(--creed-score-mid\)/);
  assert.match(qualityUi, /tone === "bad" \? "−" : "\/"/);
  assert.match(qualityUi, /Guidance: "amber"/);
  assert.match(qualityUi, /strength\?\.tag/);
  assert.match(qualityUi, /gap\?\.tag/);
  assert.match(qualityUi, /guidance \? "Guidance"/);
  assert.match(qualityUi, /TAG_DISPLAY_PRIORITY/);
  assert.match(
    qualityUi,
    /tone="good"[\s\S]*tone="guidance"[\s\S]*tone="bad"/,
  );
});

test("MCP exposes analysis freshness without triggering analysis", () => {
  assert.match(mcp, /fresh: snapshot\.staleSectionIds\.length === 0/);
  assert.match(mcp, /analyzedAt: snapshot\.analyzedAt/);
  assert.match(mcp, /staleSectionIds: snapshot\.staleSectionIds/);
  assert.match(mcp, /storedQualitySectionIsFresh/);
  assert.match(mcp, /This tool only reads reports and never starts analysis/);
});
