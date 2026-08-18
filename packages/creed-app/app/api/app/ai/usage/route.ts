import { NextResponse } from "next/server";
import {
  readAiUsageSummary,
  readSharedAiUsageSummary,
  type AiMode,
  type AiUsageRange,
} from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveMemberSharedCreed, resolveMemberSharedCreedById } from "@/lib/creed-context";

const ranges = new Set<AiUsageRange>(["7d", "30d", "90d"]);

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") as AiUsageRange | null;
  const resolvedRange = range && ranges.has(range) ? range : "90d";
  const modeParam = url.searchParams.get("mode");
  const mode: AiMode = modeParam === "byok" ? "byok" : "credits";

  // Shared members can view the pooled model-usage chart for the shared Creed
  // they belong to. Owner-only detail stays in the credit-history ledger and
  // top-up controls. An explicit `?creedId=` pins the shared (validated),
  // independent of the cookie.
  const requestedCreedId = url.searchParams.get("creedId")?.trim();
  const shared = requestedCreedId
    ? await resolveMemberSharedCreedById(auth.supabase, auth.user, requestedCreedId)
    : await resolveMemberSharedCreed(auth.supabase, auth.user);
  let usage;
  if (shared) {
    usage = await readSharedAiUsageSummary(shared.creedId, resolvedRange, mode);
  } else {
    usage = await readAiUsageSummary(auth.supabase, auth.user.id, resolvedRange, mode);
  }
  return NextResponse.json({ usage });
}
