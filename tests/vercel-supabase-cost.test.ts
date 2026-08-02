import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  readSessionExpiresAt,
  sessionNeedsRefresh,
  SESSION_REFRESH_WINDOW_SECONDS,
} from "../lib/supabase/session-freshness.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("state polling uses a delta probe, bounded payloads, and slow idle cadence", () => {
  const route = source("../app/api/app/state/route.ts");
  const provider = source("../components/creed/creed-provider.tsx");
  assert.match(route, /getCreedStateTick/);
  assert.match(route, /changed: false/);
  assert.match(route, /proposalLimit: 50/);
  assert.match(route, /activityLimit: 50/);
  assert.match(provider, /state\?since=/);
  assert.match(provider, /EXTERNAL_SYNC_INTERVAL_MS = 120_000/);
  assert.match(provider, /COMPANY_IDLE_SYNC_INTERVAL_MS = 120_000/);
});

test("company roster and sync tick are server-only RPCs", () => {
  const migration = source("../supabase/migrations/20260801170032_reduce_state_sync_cost.sql");
  const coverage = source("../supabase/migrations/20260801171333_complete_state_sync_tick_coverage.sql");
  assert.match(migration, /private\.get_member_profiles/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.get_member_profiles\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /touch_creed_sync_tick/);
  assert.match(coverage, /touch_personal_creed_sync_tick/);
  assert.match(coverage, /creed_company_github_integration/);
});

test("MCP avoids self-fetches and full state loads for stateless handshake calls", () => {
  const mcp = source("../app/mcp/route.ts");
  assert.doesNotMatch(mcp, /fetch\(new URL\(path/);
  assert.match(mcp, /handleStatelessRpcRequest/);
  assert.match(mcp, /after\(async \(\) =>/);
});

test("public polling and media costs stay bounded", () => {
  const proxy = source("../proxy.ts");
  const status = source("../components/marketing/system-status.tsx");
  assert.match(proxy, /api\/\(\?:status\|version\|health\|github\/stars\|roadmap\)/);
  assert.doesNotMatch(status, /setInterval/);
  for (const name of ["elon", "jason", "marc", "steve", "travis"]) {
    assert.ok(statSync(new URL(`../public/assets/eggs/${name}.jpg`, import.meta.url)).size < 30_000);
  }
});

test("the proxy refreshes the session from the cookie's own expiry, not per request", () => {
  // A fresh token must not trigger the Supabase round trip on every in-app
  // navigation; that call was most of the page-switch latency.
  const encode = (session: object) =>
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const now = 1_700_000_000;
  const fresh = [
    { name: "sb-abc-auth-token", value: encode({ expires_at: now + 3000, access_token: "x" }) },
  ];
  const nearExpiry = [
    {
      name: "sb-abc-auth-token",
      value: encode({ expires_at: now + SESSION_REFRESH_WINDOW_SECONDS - 1, access_token: "x" }),
    },
  ];

  assert.equal(readSessionExpiresAt(fresh), now + 3000);
  assert.equal(sessionNeedsRefresh(fresh, now), false);
  assert.equal(sessionNeedsRefresh(nearExpiry, now), true);

  // Chunked cookies (large sessions) reassemble in order.
  const whole = encode({ expires_at: now + 3000 });
  const chunked = [
    { name: "sb-abc-auth-token.1", value: whole.slice(20) },
    { name: "sb-abc-auth-token.0", value: whole.slice(0, 20) },
  ];
  assert.equal(readSessionExpiresAt(chunked), now + 3000);

  // Anything unreadable refreshes - never the other way round.
  assert.equal(sessionNeedsRefresh([], now), true);
  assert.equal(
    sessionNeedsRefresh([{ name: "sb-abc-auth-token", value: "base64-!!notbase64" }], now),
    true,
  );
  assert.equal(
    sessionNeedsRefresh(
      [{ name: "sb-abc-auth-token-code-verifier", value: encode({ expires_at: now + 3000 }) }],
      now,
    ),
    true,
  );

  // And the proxy actually gates on it.
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /sessionNeedsRefresh\(request\.cookies\.getAll\(\)\)/);

  // The client router cache is what takes repeat navigations off the network
  // entirely; without it every force-dynamic page refetches on each click.
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /staleTimes/);
});
