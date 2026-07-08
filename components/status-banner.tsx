import type { OverallState } from "@/lib/types";
import { CheckIcon, AlertIcon } from "./icons";

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

const FG: Record<OverallState, string> = {
  ok: "var(--status-on-ok)",
  degraded: "var(--status-on-degraded)",
  down: "var(--status-on-down)",
};

export function StatusBanner({ state }: { state: OverallState }) {
  return (
    <div
      className="flex h-16 items-center justify-between rounded-2xl px-5"
      style={{ backgroundColor: BG[state], color: FG[state] }}
      role="status"
      aria-live="polite"
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: "#0e0e0d", color: BG[state] }}
      >
        {state === "ok" ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <AlertIcon className="h-[18px] w-[18px]" />
        )}
      </span>
      <span className="text-[17px] font-semibold">{COPY[state]}</span>
    </div>
  );
}
