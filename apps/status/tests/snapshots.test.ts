import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketSnapshots,
  classifyDayState,
  deriveDashboard,
  overallUptime,
} from "../lib/snapshots";
import { reconcileSnapshot } from "../lib/store";
import {
  COMPONENTS,
  type ComponentName,
  type DailyBucket,
  type StoredSnapshot,
} from "../lib/types";

test("completed days use the agreed percentage thresholds", () => {
  assert.equal(classifyDayState(288, 0, false), "ok");
  assert.equal(classifyDayState(287, 1, false), "degraded");
  assert.equal(classifyDayState(285, 3, false), "down");
});

test("the active day uses a fixed downtime budget", () => {
  assert.equal(classifyDayState(0, 0, true), "no-data");
  assert.equal(classifyDayState(0, 1, true), "degraded");
  assert.equal(classifyDayState(50, 2, true), "degraded");
  assert.equal(classifyDayState(50, 3, true), "down");
});

function bucket(okCount: number, downCount: number): DailyBucket[] {
  const total = okCount + downCount;
  return [
    {
      day: "2026-07-25",
      state: downCount === 0 ? "ok" : "down",
      okCount,
      degradedCount: 0,
      downCount,
      uptimePct: total === 0 ? 0 : (okCount / total) * 100,
    },
  ];
}

test("overall uptime includes a component with genuine zero-percent uptime", () => {
  const byComponent = Object.fromEntries(
    COMPONENTS.map(({ name }) => [name, bucket(1, 0)])
  ) as Record<ComponentName, DailyBucket[]>;
  byComponent.db = bucket(0, 1);

  assert.equal(overallUptime(byComponent), 75);
});

test("overall uptime excludes only components with no data", () => {
  const byComponent = Object.fromEntries(
    COMPONENTS.map(({ name }) => [name, bucket(1, 0)])
  ) as Record<ComponentName, DailyBucket[]>;
  byComponent.db = [
    {
      day: "2026-07-25",
      state: "no-data",
      okCount: 0,
      degradedCount: 0,
      downCount: 0,
      uptimePct: 0,
    },
  ];

  assert.equal(overallUptime(byComponent), 100);
});

const OK = { ok: true, latencyMs: 1 };
const DOWN = { ok: false, latencyMs: 0 };
const UNKNOWN = { ok: null, latencyMs: 0 };

// Typed as a stored snapshot so tests can express the legacy `api` key the
// reconciler carries forward.
function snapshot(overrides: Partial<StoredSnapshot> = {}): StoredSnapshot {
  return {
    t: new Date().toISOString(),
    reachable: "ok",
    components: { site: OK, mcp: OK, db: OK, auth: OK },
    ...overrides,
  };
}

const today = (buckets: DailyBucket[]) => buckets[buckets.length - 1];

test("an unmeasured component is no-data, not downtime", () => {
  const byComponent = bucketSnapshots([
    snapshot({ components: { site: OK, db: UNKNOWN } }),
  ]);

  assert.equal(today(byComponent.site).state, "ok");
  assert.equal(today(byComponent.db).state, "no-data");
  assert.equal(today(byComponent.db).downCount, 0);
});

test("a component absent from history backfills as no-data", () => {
  // The shape of every snapshot written before `mcp` was tracked.
  const byComponent = bucketSnapshots([
    snapshot({ components: { site: OK, db: OK, auth: OK } }),
  ]);

  assert.equal(today(byComponent.mcp).state, "no-data");
  assert.equal(today(byComponent.mcp).downCount, 0);
});

test("a measured failure is still downtime", () => {
  // Three failures on the active day exceed its downtime budget, where one
  // would only reach amber.
  const byComponent = bucketSnapshots(
    Array.from({ length: 3 }, () =>
      snapshot({ components: { site: OK, mcp: DOWN } })
    )
  );

  assert.equal(today(byComponent.mcp).state, "down");
  assert.equal(today(byComponent.mcp).downCount, 3);
});

test("a component's dot survives a tick that could not measure it", () => {
  const { currentByComponent } = deriveDashboard([
    snapshot({ components: { site: OK, db: UNKNOWN } }),
    snapshot({ components: { site: OK, db: DOWN } }),
  ]);

  assert.equal(currentByComponent.db, "down");
  assert.equal(currentByComponent.auth, "no-data");
});

test("an unattributable degraded verdict still reaches the banner", () => {
  // A summary-only health body names no failing component, so `reachable` is
  // the only evidence of the degradation.
  const { overall } = deriveDashboard([
    snapshot({
      reachable: "degraded",
      components: { site: OK, mcp: OK, db: UNKNOWN, auth: UNKNOWN },
    }),
  ]);

  assert.equal(overall, "degraded");
});

test("component evidence can escalate past the reachable floor", () => {
  const { overall } = deriveDashboard([
    snapshot({
      reachable: "unreachable",
      components: { site: DOWN, mcp: DOWN, db: DOWN, auth: DOWN },
    }),
  ]);

  assert.equal(overall, "down");
});

test("all components healthy reads as ok", () => {
  assert.equal(deriveDashboard([snapshot()]).overall, "ok");
});

test("reconcile repairs health components contradicted by a healthy verdict", () => {
  const repaired = reconcileSnapshot(
    snapshot({ reachable: "ok", components: { site: OK, db: DOWN, auth: DOWN } })
  );

  assert.equal(repaired.components.db?.ok, true);
  assert.equal(repaired.components.auth?.ok, true);
});

test("reconcile leaves a genuine outage alone", () => {
  const untouched = snapshot({
    reachable: "down",
    components: { site: OK, db: DOWN, auth: DOWN },
  });

  assert.equal(reconcileSnapshot(untouched), untouched);
  assert.equal(reconcileSnapshot(untouched).components.db?.ok, false);
});

test("mcp inherits the api reading that used to back its row", () => {
  const repaired = reconcileSnapshot(
    snapshot({ components: { site: OK, api: OK, db: OK, auth: OK } })
  );

  assert.equal(repaired.components.mcp?.ok, true);
});

test("inherited mcp history is repaired before it is adopted", () => {
  // The Aug 1 artifact hit `api` too, so adopting it raw would hand MCP three
  // days of downtime that never happened.
  const repaired = reconcileSnapshot(
    snapshot({
      reachable: "ok",
      components: { site: OK, api: DOWN, db: DOWN, auth: DOWN },
    })
  );

  assert.equal(repaired.components.mcp?.ok, true);
});

test("a real mcp reading is never overwritten by the legacy one", () => {
  const repaired = reconcileSnapshot(
    snapshot({ reachable: "down", components: { site: OK, mcp: DOWN, api: OK } })
  );

  assert.equal(repaired.components.mcp?.ok, false);
});

test("reconcile never overrides the independently probed components", () => {
  // `reachable` reports on creed.md/api/health only; it says nothing about the
  // site or MCP probes this app runs itself.
  const repaired = reconcileSnapshot(
    snapshot({ reachable: "ok", components: { site: DOWN, mcp: DOWN, db: OK } })
  );

  assert.equal(repaired.components.site?.ok, false);
  assert.equal(repaired.components.mcp?.ok, false);
});
