"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BrandedCredit } from "@creed/ui/branded-credit";
import type { OverallState } from "@/lib/types";
import { StatusBanner } from "./status-banner";
import { StatusLogo } from "./status-logo";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type DashboardResponse = {
  overall?: OverallState;
  uptimePct?: number;
};

function stateFromDashboard(body: DashboardResponse): OverallState | null {
  const { overall } = body;
  return overall === "ok" || overall === "degraded" || overall === "down"
    ? overall
    : null;
}

// Poll the same aggregate dashboard used for the server render. The one-minute
// CDN cache bounds upstream load, while focus and visibility refreshes let a
// returning tab catch up immediately without replacing state on network errors.
export function LiveIndicator({
  initial,
  initialUptime,
  children,
}: {
  initial: OverallState;
  initialUptime: number;
  children: ReactNode;
}) {
  const [state, setState] = useState<OverallState>(initial);
  const [uptime, setUptime] = useState(initialUptime);

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
        const body = (await res.json()) as DashboardResponse;
        const next = stateFromDashboard(body);
        if (alive && next) setState(next);
        if (alive && typeof body.uptimePct === "number") {
          setUptime(body.uptimePct);
        }
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

  return (
    <>
      <header className="flex items-center justify-center">
        <StatusLogo state={state} />
      </header>
      <div className="mt-10">
        <StatusBanner state={state} uptime={uptime} />
      </div>
      <hr
        className="my-9 border-0"
        style={{ borderTop: "1px solid var(--status-border)" }}
      />
      {children}
      <hr
        className="my-9 border-0"
        style={{ borderTop: "1px solid var(--status-border)" }}
      />
      <BrandedCredit
        accent={`var(--status-${state})`}
        style={{ color: "var(--status-text-tertiary)" }}
      />
    </>
  );
}
