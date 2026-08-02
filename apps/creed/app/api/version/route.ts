import { NextResponse } from "next/server";
import { getAppVersion } from "@/lib/app-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The version is baked in at deploy time, so the CDN can serve it for
// everyone: one function invocation per five minutes globally instead of
// one per client per poll. A new deploy is a new CDN cache, so clients
// still learn about it within one poll interval.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
} as const;

export async function GET() {
  return NextResponse.json(
    { version: getAppVersion() },
    { headers: CACHE_HEADERS },
  );
}
