import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/probe";
import { pushSnapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron/pinger calls this every ~5 min. Gated by STATUS_PROBE_SECRET when set
// (the secret is unset in local dev, so it's open there for convenience).
function authorized(req: Request): boolean {
  const secret = process.env.STATUS_PROBE_SECRET;
  if (!secret) return true; // dev / unconfigured
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-probe-secret");
  return header === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await buildSnapshot();
  await pushSnapshot(snapshot);
  return NextResponse.json(
    { ok: true, snapshot },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = handle;
export const POST = handle;
