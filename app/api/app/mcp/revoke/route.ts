import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { inferAgentIconKind } from "@/lib/creed-backend";
import { revokeOAuthTokensForUser } from "@/lib/oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Disconnects one agent: revokes its OAuth tokens and clears its roster rows so
// the connections screen flips the card back to "Not connected". Cards are
// keyed by brand icon while tokens are keyed by OAuth client_id, so both are
// matched the same way the UI matches them - by the icon their client name
// resolves to.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { icon?: string };
  const icon = typeof body.icon === "string" ? body.icon.trim() : "";
  if (!icon) {
    return NextResponse.json({ error: "Missing agent icon." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Revoke OAuth tokens whose registered client name resolves to this icon.
  const { data: tokenRows, error: tokenError } = await admin
    .from("oauth_tokens")
    .select("client_id")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null);
  if (tokenError) {
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }
  const clientIds = [
    ...new Set(
      ((tokenRows as { client_id: string }[] | null) ?? []).map((row) => row.client_id),
    ),
  ];
  if (clientIds.length > 0) {
    const { data: oauthClients, error: clientError } = await admin
      .from("oauth_clients")
      .select("client_id, client_name")
      .in("client_id", clientIds);
    if (clientError) {
      return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
    }
    const clientRows =
      (oauthClients as { client_id: string; client_name: string }[] | null) ?? [];
    for (const client of clientRows) {
      if (inferAgentIconKind(client.client_name) === icon) {
        await revokeOAuthTokensForUser(auth.user.id, client.client_id);
      }
    }
  }

  // Clear matching roster rows so connected/last-seen status resets. The
  // roster's client_name is the MCP clientInfo name, which resolves through
  // the same alias table as the card icons.
  const { data: rosterRows, error: rosterError } = await admin
    .from("creed_mcp_clients")
    .select("client_id, client_name")
    .eq("user_id", auth.user.id);
  if (rosterError) {
    return NextResponse.json({ error: "Could not load MCP clients." }, { status: 500 });
  }
  const rosterIds = (
    (rosterRows as { client_id: string; client_name: string }[] | null) ?? []
  )
    .filter((row) => inferAgentIconKind(row.client_name) === icon)
    .map((row) => row.client_id);
  if (rosterIds.length > 0) {
    const { error: deleteError } = await admin
      .from("creed_mcp_clients")
      .delete()
      .eq("user_id", auth.user.id)
      .in("client_id", rosterIds);
    if (deleteError) {
      return NextResponse.json({ error: "Could not disconnect agent." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, revokedClients: rosterIds.length });
}
