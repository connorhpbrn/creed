import type { ComponentName, Snapshot } from "./types";

const CREED_ORIGIN =
  process.env.NEXT_PUBLIC_CREED_ORIGIN ?? "https://creed.md";
const TIMEOUT_MS = 6_000;

type HealthBody = {
  status?: "ok" | "degraded" | "down";
  components?: Record<ComponentName, { ok: boolean; latencyMs: number }>;
};

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// Probe creed.md/ (HEAD → site) and creed.md/api/health (api/db/auth) in
// parallel, returning one Snapshot. Never throws — a failed fetch records the
// affected components as down.
export async function buildSnapshot(): Promise<Snapshot> {
  const t = new Date().toISOString();

  const site = withTimeout();
  const health = withTimeout();

  const [siteRes, healthRes] = await Promise.allSettled([
    (async () => {
      const start = Date.now();
      const res = await fetch(CREED_ORIGIN + "/", {
        method: "HEAD",
        signal: site.signal,
        cache: "no-store",
      });
      site.done();
      return { ok: res.ok, latencyMs: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const res = await fetch(CREED_ORIGIN + "/api/health", {
        signal: health.signal,
        cache: "no-store",
      });
      const body = (await res.json()) as HealthBody;
      health.done();
      return { status: res.status, latencyMs: Date.now() - start, body };
    })(),
  ]);
  site.done();
  health.done();

  const siteOk =
    siteRes.status === "fulfilled" ? siteRes.value.ok : false;
  const siteLatency =
    siteRes.status === "fulfilled" ? siteRes.value.latencyMs : 0;

  let reachable: Snapshot["reachable"] = "unreachable";
  let api = { ok: false, latencyMs: 0 };
  let db = { ok: false, latencyMs: 0 };
  let auth = { ok: false, latencyMs: 0 };

  if (healthRes.status === "fulfilled") {
    const { body } = healthRes.value;
    reachable = body.status ?? "down";
    const c = body.components;
    if (c) {
      api = c.api ?? api;
      db = c.db ?? db;
      auth = c.auth ?? auth;
    }
  }

  return {
    t,
    reachable,
    components: {
      site: { ok: siteOk, latencyMs: siteLatency },
      api,
      db,
      auth,
    },
  };
}
