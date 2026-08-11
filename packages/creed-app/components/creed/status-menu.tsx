"use client";

import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { motion, useSpring } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@creed/ui/dropdown-menu";
import {
  CircleGaugeIcon,
  type CircleGaugeIconHandle,
} from "@creed/ui/circle-gauge";
import { barIndexAt, tooltipCentre } from "@creed/core/mini-chart-geometry";
import { useAccountAlignedPanel } from "@/lib/use-account-aligned-panel";
import { cn } from "@creed/ui/utils";

const STATUS_URL = "https://status.creed.md";
const POLL_MS = 60_000;
// The mini panel is ~230px wide, so 90 sub-pixel bars would smear. The last
// 30 days keep each bar legible while still reading as the status page chart.
const MINI_DAYS = 30;

type DayCode = "o" | "d" | "x" | "-";
type OverallState = "ok" | "degraded" | "down";

type DashboardComponent = {
  name: string;
  label: string;
  host: string;
  state: "ok" | "degraded" | "down" | "no-data";
  uptimePct: number;
  days: string;
  pcts: number[];
};

type Dashboard = {
  overall: OverallState;
  uptimePct: number;
  startDay: string | null;
  components: DashboardComponent[];
};

const BAR_COLOR: Record<DayCode, string> = {
  o: "var(--creed-status-ok, #22c55e)",
  d: "var(--creed-status-degraded, #f59e0b)",
  x: "var(--creed-status-down, #ef4444)",
  "-": "var(--creed-border)",
};

const STATE_COLOR: Record<DashboardComponent["state"], string> = {
  ok: BAR_COLOR.o,
  degraded: BAR_COLOR.d,
  down: BAR_COLOR.x,
  "no-data": BAR_COLOR["-"],
};

const OVERALL_COPY: Record<OverallState, string> = {
  ok: "Fully operational",
  degraded: "Partial outage",
  down: "Major outage",
};

function fmtPct(n: number): string {
  return n >= 99.995 ? "100" : n.toFixed(2);
}

const STATE_LABEL: Record<DayCode, string> = {
  o: "Operational",
  d: "Degraded",
  x: "Down",
  "-": "No data",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// `startDay` is the first of the 90 UTC day keys; index i is i days later.
function dayLabel(startDay: string | null, index: number): string {
  if (!startDay) return "";
  const [y, m, d] = startDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + index));
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

// useLayoutEffect warns when rendered on the server, which this menu is.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const MINI_GAP = 1.5; // px between bars , keep in sync with the row's gap-[1.5px]

function MiniBars({
  days,
  pcts,
  startDay,
  offset,
}: {
  days: string;
  pcts: number[];
  startDay: string | null;
  offset: number;
}) {
  const window = days.slice(-MINI_DAYS).split("") as DayCode[];
  const rowRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(0);

  // Tooltip x glides between bars with a spring, the same cursor-follow the
  // status page chart uses.
  const x = useSpring(0, { stiffness: 320, damping: 30, mass: 0.5 });

  // Resolve a pointer x to a bar from the row's geometry rather than per-bar
  // enter handlers, which is what lets a touch drag scrub continuously: the
  // pointer is captured by the row, so it keeps reporting after it has left the
  // bar it started on. Only the bar is chosen here; positioning the tooltip
  // needs its width, which is not known until the new label has rendered.
  function selectAt(clientX: number) {
    const row = rowRef.current;
    if (!row || window.length === 0) return;
    const rect = row.getBoundingClientRect();
    setHovered(
      barIndexAt(clientX - rect.left, rect.width, window.length, MINI_GAP)
    );
    if (!active) setActive(true);
  }

  // Measure after the active label renders because its width controls the chart
  // clamp. A layout effect commits the position before the browser paints.
  const commanded = useRef<number | null>(null);
  useIsoLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !active || window.length === 0) {
      commanded.current = null;
      return;
    }
    const rowWidth = row.getBoundingClientRect().width;
    // The panel is measured and resized as it opens, so the row can be laid out
    // at zero width for a beat. Positioning against that would place the tooltip
    // outside the chart, so leave it uncommitted until there is a real width.
    if (rowWidth <= 0) {
      commanded.current = null;
      return;
    }
    const target = tooltipCentre(
      hovered,
      rowWidth,
      window.length,
      MINI_GAP,
      tooltipRef.current?.offsetWidth ?? 0
    );
    if (commanded.current === null) {
      // First appearance: place it rather than letting the spring travel in
      // from its resting zero at the row's left edge.
      x.jump(target);
    } else if (Math.abs(commanded.current - target) > 0.5) {
      x.set(target);
    }
    commanded.current = target;
  }, [active, hovered, window.length, x]);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Touch and pen only scrub after contact; mouse keeps the hover model.
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    selectAt(e.clientX);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") {
      // Keep the press from reaching the menu, which would otherwise treat a
      // scrub as an interaction with the item underneath.
      e.stopPropagation();
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    selectAt(e.clientX);
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") setActive(false);
  }

  const code = window[hovered];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-end">
      <motion.div
        aria-hidden={!active}
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5"
        style={{ x }}
        // Start hidden. Without this Motion takes the mount state from the DOM,
        // where opacity is 1, and animates *down* to 0 , so the tooltip paints
        // visible at the chart's left edge and fades out. That was the flicker.
        initial={false}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 4 }}
        transition={{ duration: 0.13, ease: "easeOut" }}
      >
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            "-translate-x-1/2 whitespace-nowrap rounded-[10px] border border-[var(--creed-border)]",
            "bg-[var(--creed-surface)] px-2.5 py-2 text-[12px]",
            "shadow-[0_12px_32px_rgba(28,28,26,0.18)]"
          )}
        >
          <div className="font-medium text-[var(--creed-text-primary)]">
            {dayLabel(startDay, offset + hovered)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[var(--creed-text-secondary)]">
            <span
              className="h-2 w-2 rounded-[3px]"
              style={{ backgroundColor: BAR_COLOR[code] ?? BAR_COLOR["-"] }}
            />
            <span>{STATE_LABEL[code] ?? STATE_LABEL["-"]}</span>
            {code === "d" || code === "x" ? (
              <span className="tabular-nums text-[var(--creed-text-tertiary)]">
                · {fmtPct(pcts[offset + hovered] ?? 0)}%
              </span>
            ) : null}
          </div>
        </div>
      </motion.div>

      <div
        ref={rowRef}
        // touch-pan-y keeps vertical scrolling with the page while horizontal
        // drags scrub the chart.
        className="flex h-full min-h-2 w-full touch-pan-y items-stretch gap-[1.5px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(false);
        }}
      >
        {window.map((barCode, i) => (
          <div
            key={i}
            // The hit area is padded vertically so 8px-tall bars are still
            // comfortable to hit, without changing the bars' own height.
            className="relative min-w-0 flex-1 py-1 -my-1"
          >
            <div
              className="h-full w-full rounded-[1.5px] transition-opacity duration-100"
              style={{
                backgroundColor: BAR_COLOR[barCode] ?? BAR_COLOR["-"],
                opacity: active && i !== hovered ? 0.45 : 1,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusMenuItem({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const iconRef = useRef<CircleGaugeIconHandle | null>(null);

  // The panel's bottom edge lands on the bottom of the account button, so it
  // reads as a rectangle hanging off the Status row.
  const { triggerRef, height: panelHeight } = useAccountAlignedPanel(open);

  // Only fetch while the panel is open, then keep it fresh on the same cadence
  // the status page polls at. The response is CDN-cached for everyone.
  useEffect(() => {
    if (!open) return;
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/status/dashboard", {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error("unavailable");
        const body = (await res.json()) as Dashboard;
        if (!alive) return;
        setData(body);
        setFailed(false);
      } catch {
        if (alive && !data) setFailed(true);
      }
    }

    // Mirrors the status page's LiveIndicator: interval plus focus and
    // visibility catch-up, so a panel left open never shows stale health.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onFocus = () => void load();

    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
    // `data` is read only to decide whether a failure should replace content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const overall = data?.overall ?? "ok";

  return (
    // The account menu owns the active panel so Status and Feedback cannot
    // remain selected at the same time.
    <DropdownMenuSub open={open} onOpenChange={onOpenChange}>
      <DropdownMenuSubTrigger
        ref={triggerRef}
        onMouseEnter={() => iconRef.current?.startAnimation()}
        onMouseLeave={() => iconRef.current?.stopAnimation()}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") {
            event.preventDefault();
            onOpenChange(!open);
          }
        }}
        className={cn(
          "group/status gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] focus:bg-[var(--creed-surface-raised)] data-[state=open]:bg-[var(--creed-surface-raised)]",
          "[&>svg:last-of-type]:hidden"
        )}
      >
        <CircleGaugeIcon
          ref={iconRef}
          size={14}
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
        />
        <span className="flex-1 text-left">Status</span>
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "group-hover/status:rotate-180",
            open && "rotate-180 text-[var(--creed-text-primary)]"
          )}
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          sideOffset={14}
          alignOffset={0}
          style={
            panelHeight
              ? { height: panelHeight, minHeight: panelHeight }
              : undefined
          }
          className={cn(
            // overflow-visible overrides the menu's default clipping: the chart
            // tooltips are absolutely positioned and their soft shadow reaches
            // past the panel's edge, which the default overflow-hidden cut into
            // a hard vertical line.
            "relative flex min-h-[196px] w-[min(230px,calc(100vw-2.5rem))] flex-col overflow-visible border-[var(--creed-border)] bg-[var(--creed-surface)] p-2.5",
            "before:pointer-events-auto before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-['']"
          )}
        >
          {/* Overall banner , the status page chip, shrunk. Label ink is the
              surface color, so it flips with the theme like the status page. */}
          <div
            className="flex h-8 shrink-0 items-center justify-between rounded-[9px] px-2.5"
            // A failed fetch says nothing about health, so the chip goes
            // neutral rather than claiming green.
            style={{
              backgroundColor: failed
                ? "var(--creed-surface-raised)"
                : STATE_COLOR[overall],
            }}
          >
            <span
              className="text-[12px] font-semibold"
              style={{
                color: failed
                  ? "var(--creed-text-secondary)"
                  : "var(--creed-surface)",
              }}
            >
              {failed ? "Status unavailable" : OVERALL_COPY[overall]}
            </span>
            {data ? (
              <span
                className="text-[11px] font-medium tabular-nums opacity-85"
                style={{ color: "var(--creed-surface)" }}
              >
                {fmtPct(data.uptimePct)}%
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-1 flex-col gap-2">
            {/* `site` is the synthetic website probe , the overall banner
                already covers it, so the mini panel skips the row. */}
            {(data?.components ?? [])
              .filter((component) => component.name !== "site")
              .map((component) => (
                <div key={component.name} className="flex min-h-0 flex-1 flex-col gap-1">
                  <div className="flex shrink-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--creed-text-primary)]">
                      {component.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--creed-text-tertiary)]">
                      {fmtPct(component.uptimePct)}%
                    </span>
                  </div>
                  <MiniBars
                    days={component.days}
                    pcts={component.pcts ?? []}
                    startDay={data?.startDay ?? null}
                    offset={Math.max(0, component.days.length - MINI_DAYS)}
                  />
                </div>
              ))}

            {!data ? (
              <p className="flex-1 text-[12px] text-[var(--creed-text-tertiary)]">
                {failed ? "Couldn't load live status." : "Loading…"}
              </p>
            ) : null}

            <a
              href={STATUS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
            >
              {data ? "90-day uptime · full status" : "Full status"}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
