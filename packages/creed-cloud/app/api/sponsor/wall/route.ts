import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { listPublicSponsors } from "@creed/cloud/lib/sponsors";
import { log } from "@/lib/observability";

export const runtime = "nodejs";

function callerIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit({
    scope: "sponsor-wall",
    identifier: callerIp(request),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").slice(0, 80);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 48);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const result = await listPublicSponsors({ query, limit, offset });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    log.error(
      "sponsor_wall_load_failed",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json({ error: "Could not load sponsors." }, { status: 500 });
  }
}
