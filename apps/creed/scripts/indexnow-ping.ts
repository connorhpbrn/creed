// Ping IndexNow with every public URL so Bing (the index behind ChatGPT
// search) re-crawls creed.md promptly after a deploy. Self-contained: it reads
// the live sitemap, extracts the URLs, and submits them in one batch.
//
// Run:  npm run indexnow            (defaults to https://creed.md)
//       SITE_URL=https://... npm run indexnow
//
// Wire it to run after a production deploy (a deploy hook or a GitHub Action on
// pushes to main). It is safe to run repeatedly; IndexNow is idempotent.

import { INDEXNOW_KEY } from "../lib/indexnow.ts";

const host = (process.env.SITE_URL || "https://creed.md").replace(/\/$/, "");
const hostname = new URL(host).hostname;

async function main() {
  const sitemapRes = await fetch(`${host}/sitemap.xml`);
  if (!sitemapRes.ok) {
    throw new Error(`Could not fetch sitemap: ${sitemapRes.status}`);
  }
  const xml = await sitemapRes.text();
  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) =>
    m[1].trim()
  );

  if (urls.length === 0) {
    throw new Error("No URLs found in sitemap");
  }

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: hostname,
      key: INDEXNOW_KEY,
      keyLocation: `${host}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });

  // IndexNow returns 200 or 202 on success. Anything else is worth surfacing.
  if (res.status !== 200 && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`IndexNow returned ${res.status}: ${text}`);
  }

  console.log(`IndexNow: submitted ${urls.length} URLs (${res.status}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
