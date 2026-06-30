import { NextResponse } from "next/server";
import { getLocalDocsPayload } from "@/lib/local-docs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = await getLocalDocsPayload(searchParams.get("doc"));

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
