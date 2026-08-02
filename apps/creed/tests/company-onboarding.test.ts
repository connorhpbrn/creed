// Pure-function tests for the company onboarding seed compiler.
//
//   node --test --experimental-strip-types tests/company-onboarding.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildCompanyOnboardingSections,
  companyNameFromOnboarding,
  EMPTY_COMPANY_ONBOARDING,
} from "../lib/onboarding/compile-company.ts";

test("company seed: always emits the 8 default sections in order", () => {
  const sections = buildCompanyOnboardingSections(EMPTY_COMPANY_ONBOARDING);
  assert.deepEqual(
    sections.map((s) => s.id),
    [
      "company",
      "ethos",
      "operating-rules",
      "people",
      "projects",
      "clients",
      "tools",
      "agent-rules",
    ],
  );
  // Every section has content (stub or real) and is agent-writable.
  for (const s of sections) {
    assert.equal(s.kind, "rich-text");
    assert.equal(s.agentWritable, true);
    assert.ok(s.content.length > 0, `${s.id} should have content`);
    assert.match(s.content, /Graph Tags/, `${s.id} should teach graph tags`);
    assert.match(
      s.content,
      /creed-inline-tag/,
      `${s.id} should include section reference chips`,
    );
  }
});

test("company seed: answers land in the right sections", () => {
  const sections = buildCompanyOnboardingSections({
    ...EMPTY_COMPANY_ONBOARDING,
    companyName: "Bad Company",
    whatItDoes: "We build the Bad Engine.",
    whoFor: "The founding team.",
    people: "Connor, Fergus, Sascha",
    projects: "Bad Engine, Creed",
    agentsGetWrong: "They assume we ship on Fridays",
    neverChange: "Never touch finance without the owner",
  });
  const byId = Object.fromEntries(sections.map((s) => [s.id, s.content]));
  assert.match(byId.company, /Bad Engine/);
  assert.match(byId.people, /Connor/);
  assert.match(byId.people, /Fergus/);
  assert.match(byId.projects, /Creed/);
  assert.match(byId["operating-rules"], /finance/i);
  assert.match(byId["agent-rules"], /Friday/i);
});

test("company name falls back when blank", () => {
  assert.equal(
    companyNameFromOnboarding(EMPTY_COMPANY_ONBOARDING),
    "Your company",
  );
  assert.equal(
    companyNameFromOnboarding({
      ...EMPTY_COMPANY_ONBOARDING,
      companyName: "  1706  ",
    }),
    "1706",
  );
});
