"use client";

// Fetches the public roadmap columns from the cached `/api/roadmap` route for
// the landing-page "What's on the way" teaser. The result is cached at module
// scope so re-mounts (e.g. client-side navigations) reuse it, but the cache
// expires after CACHE_TTL_MS so it stays in step with the route's own ~60s
// refresh and the teaser's "pulled live" framing. Returns null while loading or
// if the roadmap is unavailable, so the section can hide itself (fail closed)
// rather than render an empty shell.
import { useEffect, useState } from "react";
import type { RoadmapColumn } from "@/lib/marketing/roadmap";

const CACHE_TTL_MS = 60_000;

let cached: { columns: RoadmapColumn[] | null; at: number } | undefined;

export function useRoadmap(): RoadmapColumn[] | null {
  const [columns, setColumns] = useState<RoadmapColumn[] | null>(
    cached?.columns ?? null,
  );

  useEffect(() => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setColumns(cached.columns);
      return;
    }

    let active = true;
    fetch("/api/roadmap")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { columns: RoadmapColumn[] } | null) => {
        const next = Array.isArray(data?.columns) ? data.columns : null;
        cached = { columns: next, at: Date.now() };
        if (active) setColumns(next);
      })
      .catch(() => {
        cached = { columns: null, at: Date.now() };
        if (active) setColumns(null);
      });

    return () => {
      active = false;
    };
  }, []);

  return columns;
}
