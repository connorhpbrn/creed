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

// Bucket all snapshots into per-component, per-day tallies. A component is "ok"
// for a tick when its `ok` flag is true; otherwise that tick counts as down.
export function bucketSnapshots(
  snapshots: Snapshot[]
): Record<ComponentName, DailyBucket[]> {
  const window = dayWindow();
  const activeDay = window[window.length - 1];
  const result = {} as Record<ComponentName, DailyBucket[]>;

  for (const { name } of COMPONENTS) {
    const byDay = new Map<string, { ok: number; down: number }>();
    for (const s of snapshots) {
      const day = dayKeyOf(s.t);
      const tally = byDay.get(day) ?? { ok: 0, down: 0 };
      if (s.components[name]?.ok) tally.ok++;
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

async function loadStatusDashboard(): Promise<StatusDashboard> {
  const snapshots = await readSnapshots();
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

  const oks = COMPONENTS.map(({ name }) => latest.components[name]?.ok);
  return {
    byComponent,
    currentByComponent: Object.fromEntries(
      COMPONENTS.map(({ name }) => [
        name,
        latest.components[name]?.ok ? "ok" : "down",
      ])
    ) as Record<ComponentName, DayState>,
    overall: oks.every(Boolean) ? "ok" : oks.some(Boolean) ? "degraded" : "down",
  };
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
