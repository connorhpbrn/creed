import type { CSSProperties } from "react";
import type { OverallState } from "@/lib/types";

const statusLogo = "/assets/brand/status.svg";

const ACCENT: Record<OverallState, string> = {
  ok: "var(--status-ok)",
  degraded: "var(--status-degraded)",
  down: "var(--status-down)",
};

export function StatusLogo({
  state,
  className = "h-[18px] w-auto",
}: {
  state: OverallState;
  className?: string;
}) {
  const mask = {
    WebkitMaskImage: `url("${statusLogo}")`,
    maskImage: `url("${statusLogo}")`,
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  } satisfies CSSProperties;

  return (
    <span
      role="img"
      aria-label="Creed Status"
      className={`relative block aspect-[1063/244] ${className}`}
    >
      <span
        className="absolute inset-0 bg-[var(--status-text-primary)]"
        style={mask}
      />
      <span
        className="absolute inset-0 [clip-path:inset(0_85.23%_0_0)]"
        style={{ ...mask, backgroundColor: ACCENT[state] }}
      />
    </span>
  );
}
