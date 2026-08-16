import { NextResponse } from "next/server";

const STATUS_ORIGIN = process.env.STATUS_ORIGIN ?? "https://status.creed.md";
const DASHBOARD_URL = `${STATUS_ORIGIN}/api/dashboard`;
const REQUEST_TIMEOUT_MS = 8_000;

// Same shape for every viewer, so the CDN serves it and the status app only
// sees one request a minute regardless of how many people open the panel.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
} as const;

export async function GET() {
  try {
    const response = await fetch(DASHBOARD_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("upstream error");
    const body: unknown = await response.json();
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
