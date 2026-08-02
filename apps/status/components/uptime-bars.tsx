"use client";

import { useRef, useState } from "react";
import { motion, useSpring } from "motion/react";
import type { DailyBucket, DayState } from "@/lib/types";
import { fmtPct } from "@/lib/snapshots";

const GAP = 2; // px between bars — keep in sync with the row's gap-[2px]

const BAR_COLOR: Record<DayState, string> = {
  ok: "var(--status-ok)",
  degraded: "var(--status-degraded)",
  down: "var(--status-down)",
  "no-data": "var(--status-empty)",
};

const STATE_LABEL: Record<DayState, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
  "no-data": "No data",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function shortDate(day: string): string {
  const [, m, d] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

export function UptimeBars({ buckets }: { buckets: DailyBucket[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(0);

  // Tooltip x glides between bars with a spring — the smooth cursor-follow.
  const x = useSpring(0, { stiffness: 320, damping: 30, mass: 0.5 });

  function selectAt(clientX: number) {
    const row = rowRef.current;
    if (!row || buckets.length === 0) return;
    const rect = row.getBoundingClientRect();
    const n = buckets.length;
    const barW = (rect.width - (n - 1) * GAP) / n;
    const relX = clientX - rect.left;
    const i = Math.min(n - 1, Math.max(0, Math.floor(relX / (barW + GAP))));
    setHovered(i);
    if (!active) setActive(true);

    // Keep the tooltip inside the chart (and therefore the mobile viewport)
    // while its pointer continues to track the selected bar.
    const naturalX = i * (barW + GAP) + barW / 2;
    const tooltipHalf = (tooltipRef.current?.offsetWidth ?? 0) / 2;
    x.set(Math.min(rect.width - tooltipHalf, Math.max(tooltipHalf, naturalX)));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Touch and pen only scrub after contact; mouse keeps Creed's hover model.
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    selectAt(e.clientX);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    selectAt(e.clientX);
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") setActive(false);
  }

  const b = buckets[hovered];
  const color = b ? BAR_COLOR[b.state] : "var(--status-empty)";
  const showPct = b && (b.state === "degraded" || b.state === "down");

  return (
    <div className="relative">
      {/* Floating tooltip — Creed style, springs along the cursor. */}
      <motion.div
        aria-hidden={!active}
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-2"
        style={{ x }}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 4 }}
        transition={{ duration: 0.13, ease: "easeOut" }}
      >
        <div
          ref={tooltipRef}
          role="tooltip"
          className="-translate-x-1/2 whitespace-nowrap rounded-[10px] border px-2.5 py-2 text-[12px] shadow-[0_12px_32px_rgba(28,28,26,0.18)]"
          style={{
            background: "var(--status-surface)",
            borderColor: "var(--status-border)",
          }}
        >
          <div
            className="font-medium"
            style={{ color: "var(--status-text-primary)" }}
          >
            {b ? shortDate(b.day) : ""}
          </div>
          <div
            className="mt-1 flex items-center gap-1.5"
            style={{ color: "var(--status-text-secondary)" }}
          >
            <span
              className="h-2 w-2 rounded-[3px]"
              style={{ backgroundColor: color }}
            />
            <span>{b ? STATE_LABEL[b.state] : ""}</span>
            {showPct && (
              <span
                className="tabular"
                style={{ color: "var(--status-text-tertiary)" }}
              >
                · {fmtPct(b.uptimePct)}%
              </span>
            )}
          </div>
        </div>
      </motion.div>

      <div
        ref={rowRef}
        className="flex h-6 w-full touch-pan-y items-stretch gap-[2px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(false);
        }}
      >
        {buckets.map((bucket, i) => (
          <div
            key={bucket.day}
            className="min-w-0 flex-1 rounded-[var(--status-radius-bar)] transition-opacity duration-100"
            style={{
              backgroundColor: BAR_COLOR[bucket.state],
              opacity: active && i !== hovered ? 0.45 : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
