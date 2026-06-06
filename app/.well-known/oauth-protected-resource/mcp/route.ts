import {
  protectedResourceMetadata,
  protectedResourceMetadataPreflight,
} from "@/lib/oauth-metadata";

// RFC 9728 §3.1 requires the protected-resource metadata for a resource with a
// path (here `${site}/mcp`) to be served with the well-known segment inserted
// BEFORE the path: `/.well-known/oauth-protected-resource/mcp`. ChatGPT and
// Claude.ai probe exactly this path-inserted URL, so it must return the metadata
// (not 404, and not 405). Handlers are defined directly here - re-exporting them
// from the root route left Next.js unable to register the methods, so every
// request 405'd ("Method Not Allowed").
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return protectedResourceMetadataPreflight();
}

export function GET() {
  return protectedResourceMetadata();
}
