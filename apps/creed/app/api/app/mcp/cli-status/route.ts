import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getAgentIconKind } from "@/lib/agent-icon";
import { resolveCliAgentStatuses } from "@/lib/mcp-connection-status";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type TokenRow = { id: string; client_id: string };
type ClientRow = { client_id: string; client_name: string };
type RosterRow = { client_id: string; last_seen_at: string | null };

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const creedId = new URL(request.url).searchParams.get("creedId")?.trim();
  if (!creedId) {
    return NextResponse.json({ error: "Missing Creed id." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data: tokenData, error: tokenError } = await admin
    .from("oauth_tokens")
    .select("id, client_id")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .gt("refresh_expires_at", nowIso);
  if (tokenError) {
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }

  const tokens = (tokenData as TokenRow[] | null) ?? [];
  if (tokens.length === 0) {
    return NextResponse.json({ connected: false, agents: {} });
  }

  const { data: grantData, error: grantError } = await admin
    .from("oauth_token_creeds")
    .select("token_id")
    .eq("creed_id", creedId)
    .in("token_id", tokens.map((token) => token.id));
  if (grantError) {
    return NextResponse.json({ error: "Could not load grants." }, { status: 500 });
  }
  const grantedTokenIds = new Set(
    ((grantData as { token_id: string }[] | null) ?? []).map(
      (grant) => grant.token_id,
    ),
  );
  const grantedTokens = tokens.filter((token) => grantedTokenIds.has(token.id));
  if (grantedTokens.length === 0) {
    return NextResponse.json({ connected: false, agents: {} });
  }

  const { data: clientData, error: clientError } = await admin
    .from("oauth_clients")
    .select("client_id, client_name")
    .in("client_id", [...new Set(grantedTokens.map((token) => token.client_id))]);
  if (clientError) {
    return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
  }
  const cliClientIds = new Set(
    ((clientData as ClientRow[] | null) ?? [])
      .filter((client) => getAgentIconKind(client.client_name) === "cli")
      .map((client) => client.client_id),
  );
  const activeCliTokenIds = new Set(
    grantedTokens
      .filter((token) => cliClientIds.has(token.client_id))
      .map((token) => token.id),
  );
  if (activeCliTokenIds.size === 0) {
    return NextResponse.json({ connected: false, agents: {} });
  }

  const { data: rosterData, error: rosterError } = await admin
    .from("creed_mcp_clients")
    .select("client_id, last_seen_at")
    .eq("user_id", auth.user.id)
    .eq("creed_id", creedId)
    .like("client_id", "cli-%");
  if (rosterError) {
    return NextResponse.json({ error: "Could not load CLI usage." }, { status: 500 });
  }

  const agents = resolveCliAgentStatuses(
    activeCliTokenIds,
    ((rosterData as RosterRow[] | null) ?? []).map((row) => ({
      clientId: row.client_id,
      lastSeenAt: row.last_seen_at,
    })),
  );

  return NextResponse.json({ connected: true, agents });
}
