import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/env";

// Only marketing routes go in the sitemap - anything behind the
// entitlement gate (/file, /onboarding, /connections, /settings) would
// redirect to /pricing for unauthenticated crawlers, so listing them is
// pointless and pollutes search results.
//
// The root `/` is deliberately absent: it 307-redirects to /home for
// signed-out visitors, so /home is the one canonical landing URL. Listing
// both points crawlers at a redirect and splits ranking signals.
const PUBLIC_PATHS = [
  { path: "/home", changeFrequency: "weekly" as const, priority: 1.0 },
  { path: "/pricing", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/company", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/roadmap", changeFrequency: "weekly" as const, priority: 0.6 },
  { path: "/changelog", changeFrequency: "weekly" as const, priority: 0.5 },
  { path: "/docs", changeFrequency: "monthly" as const, priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/stack", changeFrequency: "monthly" as const, priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl().replace(/\/$/, "");
  const lastModified = new Date();

  const staticEntries = PUBLIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  return staticEntries;
}
