import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/probe";
import { pushSnapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron/pinger calls this every ~5 min. Vercel Cron sends CRON_SECRET as the
// bearer token; STATUS_PROBE_SECRET is kept for manual pingers/back-compat.
function authorized(req: Request): boolean {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.STATUS_PROBE_SECRET,
  ].filter(Boolean);

  if (secrets.length === 0) return true; // dev / unconfigured

  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-probe-secret");
  return Boolean(header && secrets.includes(header));
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
