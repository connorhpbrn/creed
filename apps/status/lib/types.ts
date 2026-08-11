// The components surfaced on the status page. `site` and `mcp` are probed
// directly from this app; `db` and `auth` mirror creed.md/api/health. The
// health endpoint also reports on its own liveness, but that says nothing a
// visitor cares about beyond what `reachable` already records, so it is not a
// component.
export type ComponentName = "site" | "mcp" | "db" | "auth";

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

// One component's reading on one tick. `ok: null` means "not measured" , the
// probe ran but this component's health was unknowable (for example the health
// endpoint answered with a summary-only body). Unknown readings must never be
// counted as downtime; see bucketSnapshots.
export type ComponentSample = {
  ok: boolean | null;
  latencyMs: number;
};

// One probe tick, stored newest-first. `components` is partial because the set
// of tracked components changes over time and historical snapshots predate
// later additions , an absent entry is unknown, not down.
export type Snapshot = {
  t: string; // ISO timestamp at probe time, on the status server's clock
  reachable: "ok" | "degraded" | "down" | "unreachable";
  components: Partial<Record<ComponentName, ComponentSample>>;
};

// Keys that appear in snapshots written under an earlier component set. They are
// never tracked or rendered; the store's reconciler reads them to carry history
// forward into the components that replaced them. `api` was the old probe's
// reading of creed.md/api/health answering its own request, displayed as the MCP
// row before MCP was probed directly.
export type LegacyComponentName = "api";

// A snapshot as it exists in the store, which may predate the current component
// set. Reading one through the store's reconciler yields a plain Snapshot.
export type StoredSnapshot = Omit<Snapshot, "components"> & {
  components: Partial<
    Record<ComponentName | LegacyComponentName, ComponentSample>
  >;
};

export const COMPONENTS: ComponentMeta[] = [
  { name: "site", label: "Website", host: "creed.md" },
  { name: "mcp", label: "MCP", host: "creed.md/mcp" },
  { name: "db", label: "Database", host: "supabase" },
  { name: "auth", label: "Auth", host: "supabase auth" },
];
