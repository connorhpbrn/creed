"use client";

// Fetches the project's GitHub star count from the cached `/api/github/stars`
// route. Module-level cache so the value is fetched once and reused across the
// header's remounts (each marketing page renders its own MarketingHeader).
// Returns null while loading or if the count is unavailable.
import { useEffect, useState } from "react";

let cachedStars: number | null | undefined;

export function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(cachedStars ?? null);

  useEffect(() => {
    if (cachedStars !== undefined) {
      setStars(cachedStars);
      return;
    }

    let active = true;
    fetch("/api/github/stars")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stars: number | null } | null) => {
        cachedStars = data?.stars ?? null;
        if (active) setStars(cachedStars);
      })
      .catch(() => {
        cachedStars = null;
        if (active) setStars(null);
      });

    return () => {
      active = false;
    };
  }, []);

  return stars;
}
