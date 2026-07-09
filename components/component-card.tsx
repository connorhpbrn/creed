import type { ComponentMeta, DailyBucket, DayState } from "@/lib/types";
import { componentUptime, fmtPct } from "@/lib/snapshots";
import { UptimeBars } from "./uptime-bars";
import { CheckIcon, AlertIcon } from "./icons";

// The card's dot reflects current status — the most recent day, not the
// worst day in the 90-day window (history lives in the bars).
function cardState(buckets: DailyBucket[]): DayState {
  return buckets[buckets.length - 1]?.state ?? "no-data";
}

function StatusDot({ state }: { state: DayState }) {
  const color =
    state === "down"
      ? "var(--status-down)"
      : state === "degraded"
        ? "var(--status-degraded)"
        : state === "no-data"
          ? "var(--status-empty)"
          : "var(--status-ok)";

  // Glyph follows the theme (white in light mode, near-black in dark mode) so
  // it reads the same way the banner chip does.
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
      style={{ backgroundColor: color, color: "var(--status-glyph-ink)" }}
    >
      {state === "down" || state === "degraded" ? (
        <AlertIcon className="h-4 w-4" />
      ) : state === "ok" ? (
        <CheckIcon className="h-[15px] w-[15px]" />
      ) : null}
    </span>
  );
}

export function ComponentCard({
  meta,
  buckets,
}: {
  meta: ComponentMeta;
  buckets: DailyBucket[];
}) {
  const state = cardState(buckets);
  const uptime = componentUptime(buckets);
  const hasData = buckets.some((b) => b.state !== "no-data");

  return (
    <section className="card-surface rounded-[var(--status-radius-card)] p-6">
      <header className="flex items-start justify-between gap-4">
        <StatusDot state={state} />
        <div className="text-right">
          <h2 className="text-[17px] font-semibold leading-tight">
            {meta.label}
          </h2>
          <p
            className="mt-0.5 text-[13px]"
            style={{ color: "var(--status-text-tertiary)" }}
          >
            {meta.host}
          </p>
        </div>
      </header>

      <div className="mt-5">
        <UptimeBars buckets={buckets} />
      </div>

      <footer
        className="mt-3 flex items-center justify-between text-[12px]"
        style={{ color: "var(--status-text-tertiary)" }}
      >
        <span>90 days</span>
        <span className="tabular">
          {hasData ? `${fmtPct(uptime)}% uptime` : "No data yet"}
        </span>
      </footer>
    </section>
  );
}
