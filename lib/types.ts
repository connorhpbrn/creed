// The four components surfaced on the status page. `site` is synthetic (a HEAD
// probe to creed.md/); the other three mirror creed.md/api/health 1:1.
export type ComponentName = "site" | "api" | "db" | "auth";

export type DayState = "ok" | "degraded" | "down" | "no-data";

export type OverallState = "ok" | "degraded" | "down";

export type DailyBucket = {
  // UTC day key, e.g. "2026-06-15". Oldest first, newest last.
  day: string;
  state: DayState;
  okCount: number;
  degradedCount: number;
  downCount: number;
  uptimePct: number; // 0–100; null-ish days report 0 but render neutral
};

export type ComponentMeta = {
  name: ComponentName;
  label: string;
  host: string;
};

// One probe tick, stored newest-first. Mirrors creed.md/api/health plus a
// synthetic `site` (HEAD to creed.md/). `reachable` is "unreachable" when the
// health fetch itself threw (DNS/network/5xx).
export type Snapshot = {
  t: string; // ISO timestamp at probe time, on the status server's clock
  reachable: "ok" | "degraded" | "down" | "unreachable";
  components: Record<ComponentName, { ok: boolean; latencyMs: number }>;
};

export const COMPONENTS: ComponentMeta[] = [
  { name: "site", label: "Website", host: "creed.md" },
  { name: "api", label: "MCP", host: "creed.md/mcp" },
  { name: "db", label: "Database", host: "supabase" },
  { name: "auth", label: "Auth", host: "supabase auth" },
];
