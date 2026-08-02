import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/env";

// Indexable surface = marketing pages only. Everything behind auth or
// payment plus the API routes are disallowed so crawlers don't waste
// budget on redirect chains and we never accidentally index a leaked
// success URL.
const DISALLOW = [
  "/api/",
  "/auth/",
  "/authorize",
  "/register",
  "/token",
  "/revoke",
  "/file",
  "/onboarding",
  "/connections",
  "/settings",
  "/payment/",
];

// AI search and answer engines each ship several named crawlers. We list them
// explicitly with the same allow/disallow as `*` for two reasons: it documents
// that Creed welcomes them (search + on-demand fetch bots are what make a page
// citation-eligible in ChatGPT, Claude, Perplexity, and Google/Gemini), and it
// guards the intent against a future default-deny edit. Keeping them on the
// same rule set means the public marketing surface stays fully readable while
// the auth and API paths stay off-limits to everyone.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Bingbot",
];

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().replace(/\/$/, "");

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
