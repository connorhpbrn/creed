"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// DEV helper: fire a real probe of creed.md every 15s and refresh the server
// component so today's bar updates live. Not rendered in production (there the
// cron drives /api/probe and the secret would reject this open call).
export function DevPulse() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    async function pulse() {
      try {
        await fetch("/api/probe", { method: "POST", cache: "no-store" });
        if (alive) router.refresh();
      } catch {
        /* ignore */
      }
    }
    pulse();
    const id = setInterval(pulse, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [router]);

  return null;
}
