import { NextResponse } from "next/server";
import { getAgentIconKind } from "@/lib/agent-icon";
import { getOAuthClient, revokeOAuthToken } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const verdict = checkRateLimit({
    scope: "oauth-revoke",
    identifier: ip,
    limit: 30,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: CORS_HEADERS });
  }
  const params = new URLSearchParams(await request.text());
  const token = params.get("token")?.trim() ?? "";
  const clientId = params.get("client_id")?.trim() ?? "";
  if (!token || !clientId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: CORS_HEADERS });
  }

  const result = await revokeOAuthToken(token, clientId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500, headers: CORS_HEADERS });
  }

  if (result.userId && result.clientId) {
    const client = await getOAuthClient(result.clientId);
    if (client && getAgentIconKind(client.clientName) === "cli") {
      await getSupabaseAdminClient()
        .from("creed_mcp_clients")
        .delete()
        .eq("user_id", result.userId)
        .or(`client_id.eq.cli,client_id.like.cli-${result.tokenId}-%`);
    }
  }

  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
