import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/env";

// Indexable surface = marketing pages only. Everything behind auth or
// payment plus the API routes are disallowed so crawlers don't waste
// budget on redirect chains and we never accidentally index a leaked
// success URL.
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/file",
          "/onboarding",
          "/connections",
          "/settings",
          "/payment/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
