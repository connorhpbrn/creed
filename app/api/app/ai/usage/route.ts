import { NextResponse } from "next/server";
import { readAiUsageSummary, type AiUsageRange } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";

const ranges = new Set<AiUsageRange>(["24h", "7d", "30d", "1y"]);

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") as AiUsageRange | null;
  const resolvedRange = range && ranges.has(range) ? range : "7d";

  const usage = await readAiUsageSummary(auth.supabase, auth.user.id, resolvedRange);
  return NextResponse.json({ usage });
}
