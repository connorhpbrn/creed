import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(
  new URL("../app/api/app/ai/quality/route.ts", import.meta.url),
  "utf8",
);
const runs = readFileSync(
  new URL("../lib/ai/quality-runs.ts", import.meta.url),
  "utf8",
);
const runner = readFileSync(
  new URL("../lib/ai/quality-runner.ts", import.meta.url),
  "utf8",
);
const quality = readFileSync(
  new URL("../lib/ai/quality.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../persistence/supabase/migrations/20260811223215_durable_quality_analysis_runs.sql",
    import.meta.url,
  ),
  "utf8",
);

test("quality runs persist a private deduplicated lifecycle", () => {
  assert.match(migration, /status in \('queued', 'running', 'completed', 'failed'\)/);
  assert.match(migration, /creed_quality_runs_one_active_request_idx/);
  assert.match(migration, /where status in \('queued', 'running'\)/);
  assert.match(migration, /creed_quality_runs_one_running_per_creed_idx/);
  assert.match(migration, /where status = 'running'/);
  assert.match(migration, /alter table public\.creed_quality_runs enable row level security/);
  assert.match(migration, /revoke all on table public\.creed_quality_runs from anon, authenticated/);
  assert.match(migration, /status in \('completed', 'failed'\) and request_sections is null/);
});

test("quality execution is detached from the initiating response and resumable", () => {
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /executeQualityRun\(runId\)/);
  assert.match(route, /requeueStaleQualityRun/);
  assert.match(runs, /\.eq\("status", "queued"\)/);
  assert.match(runs, /\.lt\("created_at", pending\.created_at\)/);
  assert.match(runs, /request_sections: null/);
});

test("quality analysis repairs malformed structured responses before parsing", () => {
  assert.match(quality, /plugins: \[\{ id: "response-healing" \}\]/);
});

test("clients poll durable status and reload the committed baseline", () => {
  assert.match(runner, /waitForQualityRun/);
  assert.match(runner, /method: "GET"/);
  assert.match(runner, /readOnly: true/);
  assert.match(runner, /BroadcastChannel/);
  assert.match(runner, /subscribeQualityRunAnnouncements/);
  assert.match(runner, /Analysis is still running\. Its result will appear when it finishes\./);
});

test("report persistence errors fail the run", () => {
  assert.doesNotMatch(quality, /quality_report_persist_failed/);
  assert.match(quality, /assertNoError\(error, "Could not save quality report\."\)/);
  assert.match(runs, /await failQualityRun\(row\.id, message\)/);
});
