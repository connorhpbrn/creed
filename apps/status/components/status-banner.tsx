import type { OverallState } from "@/lib/types";

const COPY: Record<OverallState, string> = {
  ok: "Fully operational",
  degraded: "Partial outage",
  down: "Major outage",
};

const BG: Record<OverallState, string> = {
  ok: "var(--status-ok)",
  degraded: "var(--status-degraded)",
  down: "var(--status-down)",
};

export function StatusBanner({
  state,
  uptime,
}: {
  state: OverallState;
  uptime: number;
}) {
  return (
    <div
      className="flex h-16 items-center justify-between rounded-2xl px-5"
      style={{ backgroundColor: BG[state] }}
      role="status"
      aria-live="polite"
    >
      <span
        className="text-[17px] font-semibold"
        style={{ color: "var(--status-glyph-ink)" }}
      >
        {COPY[state]}
      </span>
      <span
        className="tabular text-right text-[17px] font-semibold"
        style={{ color: "var(--status-glyph-ink)" }}
      >
        {uptime.toFixed(2)}%
      </span>
    </div>
  );
}
