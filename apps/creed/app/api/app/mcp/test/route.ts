import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  getGrantedClientIds,
  hasActiveConnectionIcon,
} from "@/lib/mcp-connection-status";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Live connection check for one agent card: does this agent hold a usable
// (unrevoked, unexpired) OAuth token right now? Matched by brand icon the same
// way the cards and the revoke route match - via the client name's icon.
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const searchParams = new URL(request.url).searchParams;
  const icon = searchParams.get("icon")?.trim() ?? "";
  const creedId = searchParams.get("creedId")?.trim() ?? "";
  if (!icon || !creedId) {
    return NextResponse.json(
      { error: "Missing agent icon or Creed id." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: tokenRows, error: tokenError } = await admin
    .from("oauth_tokens")
    .select("id, client_id")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .gt("refresh_expires_at", nowIso);
  if (tokenError) {
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }

  const activeTokens =
    (tokenRows as { id: string; client_id: string }[] | null) ?? [];
  const tokenIds = activeTokens.map((row) => row.id);
  if (tokenIds.length === 0) {
    return NextResponse.json({ connected: false });
  }

  const { data: grantRows, error: grantError } = await admin
    .from("oauth_token_creeds")
    .select("token_id")
    .eq("creed_id", creedId)
    .in("token_id", tokenIds);
  if (grantError) {
    return NextResponse.json({ error: "Could not load grants." }, { status: 500 });
  }

  const grantedTokenIds = new Set(
    ((grantRows as { token_id: string }[] | null) ?? []).map(
      (row) => row.token_id,
    ),
  );
  const clientIds = getGrantedClientIds(activeTokens, grantedTokenIds);
  if (clientIds.length === 0) {
    return NextResponse.json({ connected: false });
  }

  const { data: oauthClients, error: clientError } = await admin
    .from("oauth_clients")
    .select("client_name")
    .in("client_id", clientIds);
  if (clientError) {
    return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
  }
  const clientRows =
    (oauthClients as { client_name: string }[] | null) ?? [];
  const oauthClientNames = clientRows.map((client) => client.client_name);
  let connected = hasActiveConnectionIcon({ icon, oauthClientNames });

  // Some hosts register under the generic OAuth name "MCP Client" and only
  // identify the real agent in JSON-RPC clientInfo. In that one case, use the
  // active Creed's roster to resolve the brand. Never use roster history as a
  // fallback for a specifically named OAuth client, because expired or
  // revoked clients leave historical usage rows behind.
  const hasGenericClient = oauthClientNames.some(
    (name) => name.trim().toLowerCase() === "mcp client",
  );
  if (!connected && hasGenericClient) {
    const { data: rosterRows, error: rosterError } = await admin
      .from("creed_mcp_clients")
      .select("client_name")
      .eq("user_id", auth.user.id)
      .eq("creed_id", creedId);
    if (rosterError) {
      return NextResponse.json({ error: "Could not load MCP clients." }, { status: 500 });
    }
    connected = hasActiveConnectionIcon({
      icon,
      oauthClientNames,
      rosterClientNames: (
        (rosterRows as { client_name: string }[] | null) ?? []
      ).map((row) => row.client_name),
    });
  }

  return NextResponse.json({ connected });
}
