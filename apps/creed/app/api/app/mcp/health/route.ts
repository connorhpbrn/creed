import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { isMcpHealthRange, loadMcpHealth } from "@/lib/mcp-health";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const rangeParam = new URL(request.url).searchParams.get("range") ?? "30d";
  const range = isMcpHealthRange(rangeParam) ? rangeParam : "30d";

  // Scope the dashboard to the active Creed. A company Creed reads its own
  // telemetry (creed_id-scoped) through the admin client after resolveActiveCreed
  // has confirmed membership; personal Creeds keep the original user-scoped read
  // on the session client, so personal behaviour is unchanged.
  const active = await resolveActiveCreed(auth.supabase, auth.user);
  const activeType = active?.creeds.find((c) => c.id === active.creedId)?.type;

  const health =
    active && activeType === "company"
      ? await loadMcpHealth(getSupabaseAdminClient(), { kind: "creed", creedId: active.creedId }, range)
      : await loadMcpHealth(auth.supabase, { kind: "user", userId: auth.user.id }, range);

  return NextResponse.json({ health });
}
