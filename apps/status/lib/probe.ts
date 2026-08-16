import type { ComponentName, ComponentSample, Snapshot } from "./types";

const CREED_ORIGIN =
  process.env.NEXT_PUBLIC_CREED_ORIGIN ?? "https://creed.md";
// creed.md/api/health only returns its per-component breakdown to callers that
// present this shared secret; without it the body is just `{ status, time }`.
// Keep it in sync with CREED_HEALTH_SECRET on the Creed app.
const HEALTH_SECRET = process.env.CREED_HEALTH_SECRET;
const TIMEOUT_MS = 6_000;

const UNKNOWN: ComponentSample = { ok: null, latencyMs: 0 };

type HealthBody = {
  status?: "ok" | "degraded" | "down";
  components?: Partial<Record<ComponentName, ComponentSample>>;
};

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// Probe creed.md/ (HEAD → site), creed.md/mcp (modern discovery → mcp) and
// creed.md/api/health (db/auth) in parallel, returning one Snapshot. Never
// throws. A component we could not measure is recorded as unknown (`ok: null`)
// rather than down, so a change in what the health endpoint discloses can never
// fabricate an outage.
export async function buildSnapshot(): Promise<Snapshot> {
  const t = new Date().toISOString();

  const site = withTimeout();
  const mcp = withTimeout();
  const health = withTimeout();

  const [siteRes, mcpRes, healthRes] = await Promise.allSettled([
    (async () => {
      const start = Date.now();
      const res = await fetch(CREED_ORIGIN + "/", {
        method: "HEAD",
        signal: site.signal,
        cache: "no-store",
      });
      return { ok: res.ok, latencyMs: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      // The MCP endpoint is OAuth-gated, so unauthenticated discovery is
      // expected to be refused. Any answer below 500 means the transport and
      // its auth layer are alive; only a server-side failure (or no answer at
      // all) counts as down. This exercises the real handler rather than just
      // asking whether the route exists.
      const res = await fetch(CREED_ORIGIN + "/mcp", {
        method: "POST",
        signal: mcp.signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Mcp-Method": "server/discover",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": {
                name: "creed-status",
                version: "1",
              },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });
      return { ok: res.status < 500, latencyMs: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const res = await fetch(CREED_ORIGIN + "/api/health", {
        signal: health.signal,
        cache: "no-store",
        headers: HEALTH_SECRET
          ? { "X-Creed-Health-Secret": HEALTH_SECRET }
          : undefined,
      });
      const body = (await res.json()) as HealthBody;
      return { status: res.status, latencyMs: Date.now() - start, body };
    })(),
  ]);
  site.done();
  mcp.done();
  health.done();

  const sample = (
    result: PromiseSettledResult<{ ok: boolean; latencyMs: number }>
  ): ComponentSample =>
    result.status === "fulfilled"
      ? result.value
      : // The request itself failed, which is a measurement: the endpoint did
        // not answer.
        { ok: false, latencyMs: 0 };

  return {
    t,
    reachable: reachableFrom(healthRes),
    components: {
      site: sample(siteRes),
      mcp: sample(mcpRes),
      ...componentsFrom(healthRes),
    },
  };
}

type HealthResult = { status: number; latencyMs: number; body: HealthBody };

function reachableFrom(
  result: PromiseSettledResult<HealthResult>
): Snapshot["reachable"] {
  if (result.status !== "fulfilled") return "unreachable";
  return result.value.body.status ?? "down";
}

// Derive the two health-endpoint components. With the shared secret present
// this is a straight pass-through. Without it we fall back to what the
// summary-only body does prove: `status: "ok"` is emitted only when every
// component passed, and `"down"` only when none did. A bare `"degraded"` is
// unattributable, so the affected components stay unknown and the snapshot's
// `reachable` field carries the degradation instead.
function componentsFrom(
  result: PromiseSettledResult<HealthResult>
): Partial<Record<ComponentName, ComponentSample>> {
  if (result.status !== "fulfilled") {
    // No answer at all. That the endpoint did not serve is recorded by
    // `reachable`; it tells us nothing about the database or auth themselves.
    return { db: UNKNOWN, auth: UNKNOWN };
  }

  const { body } = result.value;
  const disclosed = body.components;
  if (disclosed) {
    return {
      db: disclosed.db ?? UNKNOWN,
      auth: disclosed.auth ?? UNKNOWN,
    };
  }

  switch (body.status) {
    case "ok":
      return { db: { ok: true, latencyMs: 0 }, auth: { ok: true, latencyMs: 0 } };
    case "down":
      return {
        db: { ok: false, latencyMs: 0 },
        auth: { ok: false, latencyMs: 0 },
      };
    default:
      // Either an unattributable "degraded", or a body with no verdict we
      // recognise. Both leave the components unknown.
      return { db: UNKNOWN, auth: UNKNOWN };
  }
}
