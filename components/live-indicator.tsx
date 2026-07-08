"use client";

import { useEffect, useState } from "react";
import type { OverallState } from "@/lib/types";
import { StatusBanner } from "./status-banner";

const CREED_ORIGIN =
  process.env.NEXT_PUBLIC_CREED_ORIGIN ?? "https://creed.md";
const POLL_MS = 30_000;

// Server renders the banner from the latest snapshot. After mount we poll
// /api/health directly so a user sitting on the page sees a state change
// within 30s of an outage starting, without waiting for the next 5-min probe.
// Cards stay snapshot-driven and do not re-render here.
export function LiveIndicator({ initial }: { initial: OverallState }) {
  const [state, setState] = useState<OverallState>(initial);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const res = await fetch(`${CREED_ORIGIN}/api/health`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { status?: OverallState };
        if (alive && json.status) setState(json.status);
      } catch {
        // Network error — keep the last known state, don't flash an outage.
      }
    }

    const id = setInterval(poll, POLL_MS);
    poll();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return <StatusBanner state={state} />;
}
