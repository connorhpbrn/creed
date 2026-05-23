import { NextResponse } from "next/server";
import { loadCreedState, rotateUserTokens } from "@/lib/creed-backend";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const tokenRow = await rotateUserTokens(auth.supabase, auth.user.id);
  const { state } = await loadCreedState(auth.supabase, auth.user);

  void recordAuditEvent({
    userId: auth.user.id,
    action: "tokens.rotated",
    request,
  });

  return NextResponse.json({
    ok: true,
    readToken: tokenRow.read_token,
    proposalToken: tokenRow.proposal_token,
    directEditToken: tokenRow.direct_edit_token,
    readUrl: state.readUrl,
    universalConnectionPrompt: state.universalConnectionPrompt,
    connections: state.connections,
  });
}
