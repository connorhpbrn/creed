import {
  COMPONENTS,
  type ComponentName,
  type DailyBucket,
  type DayState,
  type OverallState,
  type Snapshot,
} from "./types";
import { unstable_cache } from "next/cache";
import { readSnapshots } from "./store";

export const DAYS = 90;

// UTC day key (YYYY-MM-DD).
function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}
function dayKeyAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// The 90 UTC day keys we render, oldest first.
function dayWindow(): string[] {
  const keys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) keys.push(dayKeyAgo(i));
  return keys;
}

const EXPECTED_DAILY_PROBES = 288;
const AMBER_FAILURE_LIMIT = Math.ceil(EXPECTED_DAILY_PROBES * 0.01) - 1;

export function classifyDayState(
  okCount: number,
  downCount: number,
  isActiveDay: boolean
): DayState {
  const total = okCount + downCount;
  if (total === 0) return "no-data";
  if (downCount === 0) return "ok";

  // A partial UTC day has not accumulated its full denominator yet. Classify
  // it by the equivalent five-minute downtime budget so one early miss does
  // not leave the page falsely red for hours. Completed days use the agreed
  // 100 / 99 / <99 percentage thresholds.
  if (isActiveDay) {
    return downCount <= AMBER_FAILURE_LIMIT ? "degraded" : "down";
  }

  return (okCount / total) * 100 >= 99 ? "degraded" : "down";
}

// Bucket all snapshots into per-component, per-day tallies. A tick counts as ok
// when the component's `ok` flag is true and as down when it is false. Ticks
// where the component was not measured , absent from the snapshot, or recorded
// as `ok: null` , count as neither: absence of evidence is not downtime. A day
// with no measurements at all is "no-data", which is what keeps a newly tracked
// component from painting its backfill red.
export function bucketSnapshots(
  snapshots: Snapshot[]
): Record<ComponentName, DailyBucket[]> {
  const window = dayWindow();
  const activeDay = window[window.length - 1];
  const result = {} as Record<ComponentName, DailyBucket[]>;

  for (const { name } of COMPONENTS) {
    const byDay = new Map<string, { ok: number; down: number }>();
    for (const s of snapshots) {
      const measured = s.components[name]?.ok;
      if (measured !== true && measured !== false) continue;
      const day = dayKeyOf(s.t);
      const tally = byDay.get(day) ?? { ok: 0, down: 0 };
      if (measured) tally.ok++;
      else tally.down++;
      byDay.set(day, tally);
    }

    result[name] = window.map((day) => {
      const tally = byDay.get(day);
      if (!tally || tally.ok + tally.down === 0) {
        return {
          day,
          state: "no-data",
          okCount: 0,
          degradedCount: 0,
          downCount: 0,
          uptimePct: 0,
        };
      }
      const total = tally.ok + tally.down;
      const uptimePct = (tally.ok / total) * 100;
      return {
        day,
        state: classifyDayState(tally.ok, tally.down, day === activeDay),
        okCount: tally.ok,
        degradedCount: 0,
        downCount: tally.down,
        uptimePct,
      };
    });
  }

  return result;
}

export type StatusDashboard = {
  byComponent: Record<ComponentName, DailyBucket[]>;
  currentByComponent: Record<ComponentName, DayState>;
  overall: OverallState;
};

const RANK: Record<OverallState, number> = { ok: 0, degraded: 1, down: 2 };

function worse(a: OverallState, b: OverallState): OverallState {
  return RANK[a] >= RANK[b] ? a : b;
}

// The newest reading for a component that was actually measured. Scanning back
// past unknown ticks keeps a component's dot on its last known truth instead of
// blanking to "no-data" because the most recent tick could not measure it.
function latestMeasured(
  snapshots: Snapshot[],
  name: ComponentName
): boolean | null {
  for (const s of snapshots) {
    const measured = s.components[name]?.ok;
    if (measured === true || measured === false) return measured;
  }
  return null;
}

export function deriveDashboard(snapshots: Snapshot[]): StatusDashboard {
  const byComponent = bucketSnapshots(snapshots);
  const latest = snapshots[0];
  if (!latest) {
    return {
      byComponent,
      currentByComponent: Object.fromEntries(
        COMPONENTS.map(({ name }) => [name, "no-data"])
      ) as Record<ComponentName, DayState>,
      overall: "ok",
    };
  }

  const current = COMPONENTS.map(({ name }) => ({
    name,
    ok: latestMeasured(snapshots, name),
  }));
  const measured = current.filter((c) => c.ok !== null);

  // Component evidence first: every measured component ok → ok, none ok →
  // down, mixed → degraded. Then floor the verdict with the health endpoint's
  // own verdict: any non-ok `reachable` proves at least partial degradation,
  // which is how a summary-only "degraded" body still reaches the banner even
  // though it names no component.
  const fromComponents: OverallState =
    measured.length === 0
      ? "ok"
      : measured.every((c) => c.ok)
        ? "ok"
        : measured.some((c) => c.ok)
          ? "degraded"
          : "down";

  return {
    byComponent,
    currentByComponent: Object.fromEntries(
      current.map(({ name, ok }) => [
        name,
        ok === null ? "no-data" : ok ? "ok" : "down",
      ])
    ) as Record<ComponentName, DayState>,
    overall:
      latest.reachable === "ok"
        ? fromComponents
        : worse(fromComponents, "degraded"),
  };
}

async function loadStatusDashboard(): Promise<StatusDashboard> {
  return deriveDashboard(await readSnapshots());
}

// Probes run every five minutes, so recomputing this on every public page view
// only burns Blob reads and function time without making the page more current.
const loadCachedStatusDashboard = unstable_cache(loadStatusDashboard, ["status-dashboard"], {
  revalidate: 300,
});

export async function getStatusDashboard(): Promise<StatusDashboard> {
  return process.env.NODE_ENV === "production"
    ? loadCachedStatusDashboard()
    : loadStatusDashboard();
}

export async function getBucketsByComponent(): Promise<
  Record<ComponentName, DailyBucket[]>
> {
  return (await getStatusDashboard()).byComponent;
}

// Overall current status = the most recent snapshot. all components ok → ok;
// none ok → down; mixed → degraded. No snapshots yet → ok (cold start).
export async function getOverallState(): Promise<OverallState> {
  return (await getStatusDashboard()).overall;
}

export function componentUptime(buckets: DailyBucket[]): number {
  const withData = buckets.filter((b) => b.state !== "no-data");
  if (withData.length === 0) return 0;
  const total = withData.reduce(
    (s, b) => s + b.okCount + b.degradedCount + b.downCount,
    0
  );
  const ok = withData.reduce((s, b) => s + b.okCount, 0);
  return total === 0 ? 0 : (ok / total) * 100;
}

export function overallUptime(
  byComponent: Record<ComponentName, DailyBucket[]>
): number {
  const vals = Object.values(byComponent)
    .filter((buckets) => buckets.some((b) => b.state !== "no-data"))
    .map(componentUptime);
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(mean * 100) / 100;
}

export function fmtPct(n: number): string {
  return n.toFixed(2);
}
