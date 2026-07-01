import { NextResponse } from "next/server";
import { readAiUsageSummary, type AiMode, type AiUsageRange } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";

const ranges = new Set<AiUsageRange>(["7d", "30d", "90d"]);

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") as AiUsageRange | null;
  const resolvedRange = range && ranges.has(range) ? range : "90d";
  const modeParam = url.searchParams.get("mode");
  const mode: AiMode = modeParam === "byok" ? "byok" : "credits";

  const usage = await readAiUsageSummary(auth.supabase, auth.user.id, resolvedRange, mode);
  return NextResponse.json({ usage });
}
