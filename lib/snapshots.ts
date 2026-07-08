import {
  COMPONENTS,
  type ComponentName,
  type DailyBucket,
  type OverallState,
  type Snapshot,
} from "./types";
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

// Bucket all snapshots into per-component, per-day tallies. A component is "ok"
// for a tick when its `ok` flag is true; otherwise that tick counts as down.
function bucket(
  snapshots: Snapshot[]
): Record<ComponentName, DailyBucket[]> {
  const window = dayWindow();
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
      return {
        day,
        state: tally.down > 0 ? "down" : "ok",
        okCount: tally.ok,
        degradedCount: 0,
        downCount: tally.down,
        uptimePct: (tally.ok / total) * 100,
      };
    });
  }

  return result;
}

export async function getBucketsByComponent(): Promise<
  Record<ComponentName, DailyBucket[]>
> {
  return bucket(await readSnapshots());
}

// Overall current status = the most recent snapshot. all components ok → ok;
// none ok → down; mixed → degraded. No snapshots yet → ok (cold start).
export async function getOverallState(): Promise<OverallState> {
  const snaps = await readSnapshots();
  const latest = snaps[0];
  if (!latest) return "ok";
  const oks = COMPONENTS.map(({ name }) => latest.components[name]?.ok);
  if (oks.every(Boolean)) return "ok";
  if (oks.some(Boolean)) return "degraded";
  return "down";
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
    .map(componentUptime)
    .filter((v) => v > 0);
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(mean * 100) / 100;
}

export function fmtPct(n: number): string {
  return n.toFixed(2);
}
