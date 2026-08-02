import {
  protectedResourceMetadata,
  protectedResourceMetadataPreflight,
} from "@/lib/oauth-metadata";

// RFC 9728 protected-resource metadata. An MCP client that gets a 401 with a
// WWW-Authenticate header pointing here learns which authorization server
// guards the /mcp resource, then runs the OAuth flow against it. Public, no
// user data, fetched cross-origin by clients, so CORS is open. The identical
// document is also served at the path-inserted ./mcp route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return protectedResourceMetadataPreflight();
}

export function GET() {
  return protectedResourceMetadata();
}
