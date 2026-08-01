// Public GitHub star count for the project repo, fetched server-side and cached
// (hourly) so the marketing star button shows a live number without every
// visitor hitting the GitHub API. This is a deliberate external call (GitHub),
// the only one besides the system-status pill; it fails closed to `stars: null`
// so the button degrades to just the icon if GitHub is unreachable.
import { NextResponse } from "next/server";
import { GITHUB_URL } from "@/lib/branding";

export const revalidate = 3600;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

function repoSlug(): string | null {
  const match = GITHUB_URL.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  return match ? `${match[1]}/${match[2].replace(/\.git$/, "")}` : null;
}

export async function GET() {
  const slug = repoSlug();
  if (!slug) {
    return NextResponse.json({ stars: null });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ stars: null });
    }
    const data = (await res.json()) as { stargazers_count?: number };
    const stars = typeof data.stargazers_count === "number" ? data.stargazers_count : null;
    return NextResponse.json({ stars }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ stars: null });
  }
}
