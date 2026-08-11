// Pure-function tests for the shared onboarding seed compiler.
//
//   node --test --experimental-strip-types tests/shared-onboarding.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildSharedOnboardingSections,
  sharedNameFromOnboarding,
  EMPTY_SHARED_ONBOARDING,
} from "../../creed-cloud/lib/onboarding/compile-shared.ts";

test("shared seed: always emits the 8 default sections in order", () => {
  const sections = buildSharedOnboardingSections(EMPTY_SHARED_ONBOARDING);
  assert.deepEqual(
    sections.map((s) => s.id),
    [
      "shared",
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

test("shared seed: answers land in the right sections", () => {
  const sections = buildSharedOnboardingSections({
    ...EMPTY_SHARED_ONBOARDING,
    sharedName: "Bad Shared",
    whatItDoes: "We build the Bad Engine.",
    whoFor: "The founding team.",
    people: "Alex, Morgan, Riley",
    projects: "Bad Engine, Creed",
    agentsGetWrong: "They assume we ship on Fridays",
    neverChange: "Never touch finance without the owner",
  });
  const byId = Object.fromEntries(sections.map((s) => [s.id, s.content]));
  assert.match(byId.shared, /Bad Engine/);
  assert.match(byId.people, /Alex/);
  assert.match(byId.people, /Morgan/);
  assert.match(byId.projects, /Creed/);
  assert.match(byId["operating-rules"], /finance/i);
  assert.match(byId["agent-rules"], /Friday/i);
});

test("shared name falls back when blank", () => {
  assert.equal(
    sharedNameFromOnboarding(EMPTY_SHARED_ONBOARDING),
    "Shared Creed",
  );
  assert.equal(
    sharedNameFromOnboarding({
      ...EMPTY_SHARED_ONBOARDING,
      sharedName: "  1706  ",
    }),
    "1706",
  );
});
