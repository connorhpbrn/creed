"use client";

import { useEffect, useState } from "react";
import { CreedLoader } from "@/components/creed/creed-loader";
import { cn } from "@/lib/utils";

export const CREED_LOADER_EXIT_MS = 380;

// The route fallback holds itself at zero opacity for this long before fading
// in (`creed-loader-appear` in globals.css). A page that resolves inside that
// window never showed a loader, so there is nothing for the curtain to dissolve
// and putting one up would be the flash we are avoiding.
const LOADER_VISIBLE_AFTER_MS = 320 + 240;

// A route-level loading.tsx is swapped for the page in a single commit, so the
// loader can never animate its own exit - it just vanishes. This renders the
// same screen over the real content for one frame and fades it out, which turns
// that hard swap into a dissolve. It never blocks input.
//
// It is deliberately conservative about when to do that. Covering content that
// was never hidden reads as a stall, not a polish, so the curtain stays out of
// the way unless the loading screen was genuinely on show: the document must
// have taken long enough for the loader to appear, and this must be that
// document's own load rather than a later click through the app.
function shouldCoverHandoff() {
  if (typeof performance === "undefined") return false;

  const elapsed = performance.now();
  if (elapsed < LOADER_VISIBLE_AFTER_MS) return false;

  const [navigation] = performance.getEntriesByType("navigation") as
    | PerformanceNavigationTiming[]
    | undefined[];
  if (!navigation) return true;

  // Time since the document's HTML finished arriving: small while the first
  // render is still settling, seconds-to-minutes by the time someone clicks
  // through the app.
  return elapsed - navigation.responseEnd < 4000;
}

export function CreedLoaderCurtain() {
  // Starts inert so the server and the first client render agree; the mount
  // effect decides whether there is a handoff worth covering.
  const [phase, setPhase] = useState<"inert" | "covering" | "leaving">("inert");

  useEffect(() => {
    if (!shouldCoverHandoff()) return;
    setPhase("covering");
  }, []);

  useEffect(() => {
    if (phase !== "covering") return;
    // One opaque frame before the transition, or the browser has nothing to
    // animate from and the curtain pops out instead of fading.
    const frame = window.requestAnimationFrame(() => setPhase("leaving"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timeoutId = window.setTimeout(() => setPhase("inert"), CREED_LOADER_EXIT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [phase]);

  if (phase === "inert") return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-50 transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        phase === "leaving" ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${CREED_LOADER_EXIT_MS}ms` }}
    >
      <CreedLoader />
    </div>
  );
}
