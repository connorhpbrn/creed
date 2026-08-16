import { INDEXNOW_KEY } from "@/lib/indexnow";

// IndexNow ownership key file, served at /<key>.txt. The body is just the key.
// This proves to Bing and other IndexNow engines that we control creed.md, so
// our submitted URLs are trusted. The filename must equal the key.
export const dynamic = "force-static";

export function GET() {
  return new Response(INDEXNOW_KEY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
