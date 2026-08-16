"use client";

import { useEffect, useState } from "react";

// Canonical viewport hook for the touch-shaped behaviours in the account menu:
// panels that toggle on tap rather than hover, and panels sized to the account
// button. Matches Tailwind's `md` breakpoint.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}
