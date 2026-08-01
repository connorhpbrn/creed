"use client";

import { useEffect, useState } from "react";
import { CreedLoader } from "@/components/creed/creed-loader";
import { cn } from "@/lib/utils";

export const CREED_LOADER_EXIT_MS = 380;

// A route-level loading.tsx is swapped for the page in a single commit, so the
// loader can never animate its own exit - it just vanishes. This renders the
// same screen over the real content for one frame and fades it out, which turns
// that hard swap into a dissolve. It never blocks input.
//
// It only covers a real document load. On a client-side navigation into /file
// the page is usually ready immediately, and fading a curtain over content that
// was never hidden would read as a delay rather than a polish.
function isDocumentLoadHandoff() {
  if (typeof performance === "undefined") return false;

  const [navigation] = performance.getEntriesByType("navigation") as
    | PerformanceNavigationTiming[]
    | undefined[];
  if (!navigation) return true;

  // Time since the document's HTML finished arriving: small while the first
  // render is still settling, seconds-to-minutes by the time someone clicks
  // through the app.
  return performance.now() - navigation.responseEnd < 4000;
}

export function CreedLoaderCurtain() {
  // Starts inert so the server and the first client render agree; the mount
  // effect decides whether there is a handoff worth covering.
  const [phase, setPhase] = useState<"inert" | "covering" | "leaving">("inert");

  useEffect(() => {
    if (!isDocumentLoadHandoff()) return;
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
