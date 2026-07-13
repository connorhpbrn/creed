import { NextResponse } from "next/server";
import { getStatusDashboard } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
} as const;

export async function GET() {
  const { overall } = await getStatusDashboard();
  const payload =
    overall === "ok"
      ? { label: "Fully operational", color: "green" }
      : overall === "degraded"
        ? { label: "Partially degraded", color: "yellow" }
        : { label: "Service disruption", color: "red" };

  return NextResponse.json(payload, { headers: CACHE_HEADERS });
}
