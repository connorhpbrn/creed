// Pure-function coverage for onboarding graph-tag guidance.
//
//   node --test --experimental-strip-types tests/onboarding-graph-tags.test.ts

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildOnboardingPreviewSections,
  type OnboardingPreviewDraft,
} from "../lib/onboarding/compile.ts";

const PERSONAL_DRAFT: OnboardingPreviewDraft = {
  identityText: "I build small products with AI.",
  goalsText: "Ship Creed.",
  preferences: ["Lead with the answer."],
};

test("personal seed includes graph tags in every starter section", () => {
  const sections = buildOnboardingPreviewSections(PERSONAL_DRAFT);

  for (const section of sections) {
    assert.match(
      section.content,
      /Graph Tags/,
      `${section.id} should teach graph tags`,
    );
    assert.match(
      section.content,
      /creed-inline-tag/,
      `${section.id} should include section reference chips`,
    );
  }
});

test("compose prompts instruct assistants to create section-only graph tags", () => {
  const source = readFileSync(
    new URL("../lib/creed-prompts.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /export function buildComposePrompt/);
  assert.match(source, /export function buildCompanyComposePrompt/);
  assert.match(source, /### Graph Tags/);
  assert.match(source, /only references to other sections/i);
  assert.match(source, /real section names/i);
  assert.match(
    source,
    /Do not create hashtags for tools, apps, brands, themes, projects, or labels/i,
  );
  assert.match(
    source,
    /Do not create hashtags for tools, apps, brands, themes, clients, projects, or labels/i,
  );
});
