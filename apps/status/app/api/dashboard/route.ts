import { NextResponse } from "next/server";
import { COMPONENTS } from "@/lib/types";
import { getStatusDashboard, componentUptime, overallUptime } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

// Public, embed-friendly view of the same data the status page renders. The
// mini status panel in the Creed app reads this instead of scraping the page.
// Day states ship as a compact string (o/d/x/-) so 90 days per component stays
// a few hundred bytes.
const CACHE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
} as const;

const CODE = { ok: "o", degraded: "d", down: "x", "no-data": "-" } as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CACHE_HEADERS });
}

export async function GET() {
  const { byComponent, currentByComponent, overall } =
    await getStatusDashboard();

  return NextResponse.json(
    {
      overall,
      uptimePct: overallUptime(byComponent),
      // Day keys are implied by `startDay` + index, so only the first is sent.
      startDay: byComponent.site[0]?.day ?? null,
      components: COMPONENTS.map((meta) => ({
        name: meta.name,
        label: meta.label,
        host: meta.host,
        state: currentByComponent[meta.name],
        uptimePct: componentUptime(byComponent[meta.name]),
        days: byComponent[meta.name].map((b) => CODE[b.state]).join(""),
        pcts: byComponent[meta.name].map((b) =>
          Number(b.uptimePct.toFixed(2))
        ),
      })),
    },
    { headers: CACHE_HEADERS }
  );
}
