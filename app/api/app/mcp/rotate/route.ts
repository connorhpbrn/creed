import { NextResponse } from "next/server";
import { loadCreedState, rotateUserMcpCredential } from "@/lib/creed-backend";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  await rotateUserMcpCredential(auth.supabase, auth.user.id);
  const { state } = await loadCreedState(auth.supabase, auth.user);

  void recordAuditEvent({
    userId: auth.user.id,
    action: "mcp.token_rotated",
    request,
  });

  return NextResponse.json({
    ok: true,
    mcpToken: state.mcpToken,
    mcpUrl: state.mcpUrl,
    mcpConfig: state.mcpConfig,
    mcpStatus: state.mcpStatus,
    mcpLastUsed: state.mcpLastUsed,
    mcpLastClientName: state.mcpLastClientName,
    mcpClients: state.mcpClients,
  });
}
