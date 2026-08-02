import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const rubric = readFileSync(
  new URL("../lib/ai/quality-rubric.ts", import.meta.url),
  "utf8",
);
const quality = readFileSync(
  new URL("../lib/ai/quality.ts", import.meta.url),
  "utf8",
);

test("quality rubric has separate personal and company subjects", () => {
  assert.match(rubric, /export type QualityScope = "personal" \| "company"/);
  assert.match(rubric, /personal context profile/);
  assert.match(rubric, /shared company context file/);
  assert.match(rubric, /understand the company/);
});

test("quality analysis passes company scope into the prompt", () => {
  assert.match(quality, /const qualityScope: QualityScope = companyId \? "company" : "personal"/);
  assert.match(quality, /qualitySubject\(qualityScope\)/);
  assert.match(quality, /buildQualityPrompt\(sections, targets, qualityScope\)/);
});
