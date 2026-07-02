import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/supabase/env";

// RFC 9728 protected-resource metadata, shared by the root well-known route and
// the path-inserted `/mcp` variant. Both serve the identical document (the
// resource is the `/mcp` endpoint). Defined here so each route can export its
// own GET/OPTIONS directly: Next.js does not reliably register re-exported
// route handlers, which made the path-inserted route 405 on every method.
const PRM_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function protectedResourceMetadataPreflight() {
  return new NextResponse(null, { status: 204, headers: PRM_CORS_HEADERS });
}

export function protectedResourceMetadata() {
  const site = getSiteUrl().replace(/\/$/, "");
  return NextResponse.json(
    {
      resource: `${site}/mcp`,
      authorization_servers: [site],
      scopes_supported: ["read", "propose", "direct_edit"],
      bearer_methods_supported: ["header"],
    },
    { headers: PRM_CORS_HEADERS }
  );
}
