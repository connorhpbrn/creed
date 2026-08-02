import { NextResponse } from "next/server";
import { fetchRoadmap } from "@/lib/marketing/fetch-roadmap";

// Public, cached roadmap data for client-side consumers (the landing-page
// "What's on the way" teaser). The median API key is read server-side in
// fetchRoadmap and never leaves the server; only the mapped, public columns
// are returned. fetchRoadmap fails closed to empty columns, so this route
// always responds 200 with a well-formed shape.
export const revalidate = 60;

export async function GET() {
  const columns = await fetchRoadmap();
  return NextResponse.json(
    { columns },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
