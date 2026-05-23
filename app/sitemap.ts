import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/env";

// Only marketing routes go in the sitemap — anything behind the
// entitlement gate (/file, /onboarding, /connections, /settings) would
// redirect to /pricing for unauthenticated crawlers, so listing them is
// pointless and pollutes search results.
const PUBLIC_PATHS = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1.0 },
  { path: "/home", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/pricing", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/docs", changeFrequency: "monthly" as const, priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/stack", changeFrequency: "monthly" as const, priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl().replace(/\/$/, "");
  const lastModified = new Date();

  return PUBLIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
