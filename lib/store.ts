import type { Snapshot } from "./types";

// Snapshot store. In production this is Vercel KV (Upstash Redis); in local dev
// (no KV env) it falls back to a module-level in-memory ring buffer so the live
// pipeline works without any external service. Newest-first, like LPUSH.
const MAX = 26_000; // ~90 days at 5-min cadence + headroom

const hasKV = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

// Survive Next dev HMR by hanging the buffer off globalThis.
const g = globalThis as unknown as { __statusMem?: string[]; __seeded?: boolean };
g.__statusMem ??= [];
const mem = g.__statusMem;

// DEV ONLY (no KV): seed 90 days of all-operational history once, so the page
// renders a full green chart immediately. Today's bar is then topped up by real
// live probes of creed.md. Production (real KV) never seeds — it shows true
// cold-start "No data yet" bars until the cron fills them.
if (!hasKV && !g.__seeded) {
  g.__seeded = true;
  const ok = { ok: true, latencyMs: 0 };
  for (let i = 89; i >= 1; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(12, 0, 0, 0);
    mem.unshift(
      JSON.stringify({
        t: d.toISOString(),
        reachable: "ok",
        components: { site: ok, api: ok, db: ok, auth: ok },
      } satisfies Snapshot)
    );
  }
}

export async function pushSnapshot(s: Snapshot): Promise<void> {
  const json = JSON.stringify(s);
  if (hasKV) {
    const { kv } = await import("@vercel/kv");
    await kv.lpush("status:snapshots", json);
    await kv.ltrim("status:snapshots", 0, MAX - 1);
    return;
  }
  mem.unshift(json);
  if (mem.length > MAX) mem.length = MAX;
}

export async function readSnapshots(): Promise<Snapshot[]> {
  if (hasKV) {
    const { kv } = await import("@vercel/kv");
    const raw = await kv.lrange<string>("status:snapshots", 0, -1);
    return raw.map((j) => (typeof j === "string" ? JSON.parse(j) : j));
  }
  return mem.map((j) => JSON.parse(j) as Snapshot);
}

export async function snapshotCount(): Promise<number> {
  if (hasKV) {
    const { kv } = await import("@vercel/kv");
    return kv.llen("status:snapshots");
  }
  return mem.length;
}
