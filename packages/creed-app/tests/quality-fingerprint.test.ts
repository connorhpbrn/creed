import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeQualityMarkdown } from "../lib/ai/quality-fingerprint-core.ts";

const fileScreen = readFileSync(
  new URL("../components/creed/file-screen.tsx", import.meta.url),
  "utf8",
);
const runner = readFileSync(
  new URL("../lib/ai/quality-runner.ts", import.meta.url),
  "utf8",
);

test("quality markdown ignores inconsequential prose whitespace", () => {
  const analyzed = "### Current focus\n\nBuild the useful thing first.";
  const editedThenRestored =
    "  ###   Current   focus  \r\n\r\n\r\n Build   the useful thing first.  ";

  assert.equal(
    normalizeQualityMarkdown(editedThenRestored),
    normalizeQualityMarkdown(analyzed),
  );
});

test("quality markdown remains sensitive to meaningful content changes", () => {
  assert.notEqual(
    normalizeQualityMarkdown("Build the useful thing first."),
    normalizeQualityMarkdown("Build the polished thing first."),
  );
});

test("quality markdown preserves meaningful code spacing", () => {
  assert.notEqual(
    normalizeQualityMarkdown("```txt\na  b\n```"),
    normalizeQualityMarkdown("```txt\na b\n```"),
  );
});

test("quality state and fingerprints stay scoped across Creed switches", () => {
  assert.match(runner, /reportsByScope/);
  assert.match(runner, /activeScopeKey === args\.scopeKey/);
  assert.match(fileScreen, /qualityFingerprintsByCreedRef/);
  assert.match(fileScreen, /setQualityRunnerScope\(qualityScopeKey\)/);
  assert.match(fileScreen, /qualityCreedRef\.current === qualityScopeKey/);
});
