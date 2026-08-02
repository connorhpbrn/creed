"use client";

import { useEffect, useState } from "react";
import type { OverallState } from "@/lib/types";
import { StatusBanner } from "./status-banner";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type SummaryResponse = {
  color?: "green" | "yellow" | "red";
};

function stateFromSummary(summary: SummaryResponse): OverallState | null {
  if (summary.color === "green") return "ok";
  if (summary.color === "yellow") return "degraded";
  if (summary.color === "red") return "down";
  return null;
}

// Server renders the banner from the latest snapshot. After mount we poll
// the public summary used by every Creed status indicator. Its one-minute CDN
// cache bounds live health probes regardless of visitor count, while focus and
// visibility refreshes make a returning tab catch up immediately.
export function LiveIndicator({ initial }: { initial: OverallState }) {
  const [state, setState] = useState<OverallState>(initial);

  useEffect(() => {
    let alive = true;
    let pending = false;

    async function poll() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const res = await fetch("/api/summary", {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const next = stateFromSummary((await res.json()) as SummaryResponse);
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
