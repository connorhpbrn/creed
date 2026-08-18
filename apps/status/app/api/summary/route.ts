import { NextResponse } from "next/server";
import { getStatusDashboard } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
} as const;

const ERROR_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

const PAYLOAD = {
  ok: { label: "Fully operational", color: "green" },
  degraded: { label: "Partially degraded", color: "yellow" },
  down: { label: "Service disruption", color: "red" },
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CACHE_HEADERS });
}

// The one-line badge creed.md renders. It reads the same recorded state the
// status page and /api/dashboard render, rather than re-asking creed.md how it
// feels: probing upstream directly ignored the site and MCP probes this app
// owns, so the badge could read green while the status page reported a partial
// outage. The dashboard is already cached for the probe interval, so serving
// from it costs a memoised read instead of an upstream round-trip.
export async function GET() {
  try {
    const { overall } = await getStatusDashboard();
    return NextResponse.json(PAYLOAD[overall], { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Live status is temporarily unavailable" },
      { status: 503, headers: ERROR_HEADERS }
    );
  }
}
