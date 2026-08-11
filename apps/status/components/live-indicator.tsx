"use client";

import { useEffect, useState } from "react";
import type { OverallState } from "@/lib/types";
import { StatusBanner } from "./status-banner";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type DashboardResponse = {
  overall?: OverallState;
};

function stateFromDashboard(body: DashboardResponse): OverallState | null {
  const { overall } = body;
  return overall === "ok" || overall === "degraded" || overall === "down"
    ? overall
    : null;
}

// Server renders the banner from the latest snapshot. After mount we poll
// /api/dashboard, which derives `overall` from that same snapshot across all
// four components , /api/summary reports creed.md's self-declared health
// instead, which ignores the synthetic `site` probe and so used to flip a
// truthful "Partial outage" straight back to green a moment after paint. The
// endpoint's one-minute CDN cache bounds upstream load regardless of visitor
// count, while focus and visibility refreshes make a returning tab catch up
// immediately.
export function LiveIndicator({ initial }: { initial: OverallState }) {
  const [state, setState] = useState<OverallState>(initial);

  useEffect(() => {
    let alive = true;
    let pending = false;

    async function poll() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const res = await fetch("/api/dashboard", {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const next = stateFromDashboard((await res.json()) as DashboardResponse);
        if (alive && next) setState(next);
      } catch {
        // Keep the last known state on a client-network failure.
      } finally {
        pending = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const onFocus = () => void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    void poll();

    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <StatusBanner state={state} />;
}
