import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDayState,
  overallUptime,
} from "../lib/snapshots";
import {
  COMPONENTS,
  type ComponentName,
  type DailyBucket,
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
