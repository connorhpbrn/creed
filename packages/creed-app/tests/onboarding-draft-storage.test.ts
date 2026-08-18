import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLocalOnboardingProgress,
  parseOnboardingDraft,
  resolveOnboardingResumeStep,
} from "../lib/onboarding/draft-storage.ts";

const PROMPT = 8;
const PASTE = 9;
const PREVIEW = 10;

test("local draft progress detects step, type, or answers", () => {
  assert.equal(hasLocalOnboardingProgress(null), false);
  assert.equal(
    hasLocalOnboardingProgress({
      step: 0,
      creedType: null,
      identity: "",
      goals: "",
      preferences: "",
      updatedAt: 1,
    }),
    false,
  );
  assert.equal(
    hasLocalOnboardingProgress({
      step: 2,
      creedType: null,
      identity: "",
      goals: "",
      preferences: "",
      updatedAt: 1,
    }),
    true,
  );
  assert.equal(
    hasLocalOnboardingProgress({
      step: 0,
      creedType: "personal",
      identity: "",
      goals: "",
      preferences: "",
      updatedAt: 1,
    }),
    true,
  );
  assert.equal(
    hasLocalOnboardingProgress({
      step: 0,
      creedType: null,
      identity: "Founder",
      goals: "",
      preferences: "",
      updatedAt: 1,
    }),
    true,
  );
});

test("resume step prefers server compose, then claim, then local", () => {
  assert.equal(
    resolveOnboardingResumeStep({
      initialStage: "preview",
      localStep: 3,
      promptStep: PROMPT,
      pasteStep: PASTE,
      previewStep: PREVIEW,
    }),
    PREVIEW,
  );
  assert.equal(
    resolveOnboardingResumeStep({
      initialStage: "prompt",
      localStep: PASTE,
      promptStep: PROMPT,
      pasteStep: PASTE,
      previewStep: PREVIEW,
    }),
    PASTE,
  );
  assert.equal(
    resolveOnboardingResumeStep({
      initialStage: "prompt",
      localStep: PREVIEW,
      promptStep: PROMPT,
      pasteStep: PASTE,
      previewStep: PREVIEW,
    }),
    PASTE,
  );
  assert.equal(
    resolveOnboardingResumeStep({
      localStep: 4,
      promptStep: PROMPT,
      pasteStep: PASTE,
      previewStep: PREVIEW,
    }),
    4,
  );
  assert.equal(
    resolveOnboardingResumeStep({
      promptStep: PROMPT,
      pasteStep: PASTE,
      previewStep: PREVIEW,
    }),
    0,
  );
});

test("parseOnboardingDraft rejects junk and normalizes fields", () => {
  assert.equal(parseOnboardingDraft(null), null);
  assert.equal(parseOnboardingDraft("{"), null);
  const draft = parseOnboardingDraft(
    JSON.stringify({
      step: 3,
      creedType: "personal",
      identity: "A",
      goals: "B",
      preferences: "C",
      updatedAt: 42,
    }),
  );
  assert.deepEqual(draft, {
    step: 3,
    creedType: "personal",
    identity: "A",
    goals: "B",
    preferences: "C",
    updatedAt: 42,
  });
});
