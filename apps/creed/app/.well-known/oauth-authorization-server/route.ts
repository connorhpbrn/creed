import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/supabase/env";

// RFC 8414 authorization-server metadata. Tells MCP clients where to register,
// authorize, and exchange tokens, and that PKCE S256 is required and clients
// are public (no secret). Public, fetched cross-origin, so CORS is open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const site = getSiteUrl().replace(/\/$/, "");
  return NextResponse.json(
    {
      issuer: site,
      authorization_endpoint: `${site}/authorize`,
      token_endpoint: `${site}/token`,
      revocation_endpoint: `${site}/revoke`,
      registration_endpoint: `${site}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "propose", "direct_edit"],
    },
    { headers: CORS_HEADERS }
  );
}
