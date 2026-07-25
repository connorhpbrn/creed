import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CREED_ORIGIN =
  process.env.NEXT_PUBLIC_CREED_ORIGIN ?? "https://creed.md";
const PROBE_TIMEOUT_MS = 6_000;

const CACHE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
} as const;

const ERROR_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

type HealthResponse = {
  status?: "ok" | "degraded" | "down";
};

const PAYLOAD = {
  ok: { label: "Fully operational", color: "green" },
  degraded: { label: "Partially degraded", color: "yellow" },
  down: { label: "Service disruption", color: "red" },
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CACHE_HEADERS });
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${CREED_ORIGIN}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json()) as HealthResponse;
    if (
      body.status !== "ok" &&
      body.status !== "degraded" &&
      body.status !== "down"
    ) {
      throw new Error("Invalid health response");
    }

    return NextResponse.json(PAYLOAD[body.status], { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Live status is temporarily unavailable" },
      { status: 503, headers: ERROR_HEADERS }
    );
  } finally {
    clearTimeout(timeout);
  }
}
