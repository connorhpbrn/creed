import { NextResponse } from "next/server";

const STATUS_URL = "https://status.creed.md/api/summary";

type StatusColor = "green" | "yellow" | "red";

// Status is identical for every visitor, so the CDN serves it. The upstream
// summary is JSON rather than the rendered status page, avoiding an expensive
// page render and Blob-history scan for a one-line marketing badge.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET() {
  try {
    const response = await fetch(STATUS_URL, { next: { revalidate: 60 } });

    if (!response.ok) {
      return NextResponse.json(
        { label: "Status unavailable", color: "yellow" satisfies StatusColor },
        { status: 200, headers: CACHE_HEADERS },
      );
    }

    const body: unknown = await response.json();
    const payload = body && typeof body === "object" ? body as {
      label?: unknown;
      color?: unknown;
    } : null;
    const label = typeof payload?.label === "string" ? payload.label : "Status unavailable";
    const color: StatusColor = payload?.color === "green" || payload?.color === "red"
      ? payload.color
      : "yellow";

    return NextResponse.json(
      { label, color },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { label: "Status unavailable", color: "yellow" satisfies StatusColor },
      { headers: CACHE_HEADERS },
    );
  }
}
