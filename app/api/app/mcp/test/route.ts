import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { inferAgentIconKind } from "@/lib/creed-backend";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Live connection check for one agent card: does this agent hold a usable
// (unrevoked, unexpired) OAuth token right now? Matched by brand icon the same
// way the cards and the revoke route match - via the client name's icon.
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const icon = new URL(request.url).searchParams.get("icon")?.trim() ?? "";
  if (!icon) {
    return NextResponse.json({ error: "Missing agent icon." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: tokenRows, error: tokenError } = await admin
    .from("oauth_tokens")
    .select("client_id")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .gt("refresh_expires_at", nowIso);
  if (tokenError) {
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }

  const clientIds = [
    ...new Set(
      ((tokenRows as { client_id: string }[] | null) ?? []).map((row) => row.client_id),
    ),
  ];
  let connected = false;
  if (clientIds.length > 0) {
    const { data: oauthClients, error: clientError } = await admin
      .from("oauth_clients")
      .select("client_name")
      .in("client_id", clientIds);
    if (clientError) {
      return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
    }
    connected = ((oauthClients as { client_name: string }[] | null) ?? []).some(
      (client) => inferAgentIconKind(client.client_name) === icon,
    );
  }

  // A roster row also counts: some agents identify via MCP clientInfo under a
  // shared OAuth client registration, so the token name alone can miss them.
  if (!connected) {
    const { data: rosterRows, error: rosterError } = await admin
      .from("creed_mcp_clients")
      .select("client_name")
      .eq("user_id", auth.user.id);
    if (rosterError) {
      return NextResponse.json({ error: "Could not load MCP clients." }, { status: 500 });
    }
    connected = ((rosterRows as { client_name: string }[] | null) ?? []).some(
      (row) => inferAgentIconKind(row.client_name) === icon,
    );
  }

  return NextResponse.json({ connected });
}
