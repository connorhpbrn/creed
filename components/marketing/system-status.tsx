"use client";

import { cn } from "@/lib/utils";

export type SystemStatus =
  | "operational"
  | "degraded"
  | "maintenance"
  | "outage"
  | "unknown";

type StatusVariant = {
  label: string;
  dot: string;
  pulse: string;
  text: string;
};

// Pinned to "operational" until we wire this to a real status backend. The
// component already supports every state — pass `status` to override later.
const DEFAULT_STATUS: SystemStatus = "operational";

const STATUS_VARIANTS: Record<SystemStatus, StatusVariant> = {
  operational: {
    label: "All systems operational",
    dot: "bg-[#22C55E]",
    pulse: "bg-[#22C55E]/60",
    text: "text-[var(--creed-text-secondary)]",
  },
  degraded: {
    label: "Degraded performance",
    dot: "bg-[#F59E0B]",
    pulse: "bg-[#F59E0B]/60",
    text: "text-[var(--creed-text-secondary)]",
  },
  maintenance: {
    label: "Scheduled maintenance",
    dot: "bg-[#2563EB]",
    pulse: "bg-[#2563EB]/60",
    text: "text-[var(--creed-text-secondary)]",
  },
  outage: {
    label: "Service disruption",
    dot: "bg-[#DC2626]",
    pulse: "bg-[#DC2626]/60",
    text: "text-[var(--creed-text-secondary)]",
  },
  unknown: {
    label: "Status unavailable",
    dot: "bg-[var(--creed-text-tertiary)]",
    pulse: "bg-transparent",
    text: "text-[var(--creed-text-tertiary)]",
  },
};

export function SystemStatusPill({
  status = DEFAULT_STATUS,
  href,
  className,
}: {
  status?: SystemStatus;
  href?: string;
  className?: string;
}) {
  const variant = STATUS_VARIANTS[status];
  const Tag = href ? "a" : "div";
  const animatePulse = status !== "unknown";

  return (
    <Tag
      {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "t-meta inline-flex items-center gap-2 rounded-[10px] bg-[var(--creed-surface-raised)] px-3 py-2 leading-none transition-colors hover:bg-[var(--creed-border)]",
        variant.text,
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        {animatePulse ? (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              variant.pulse
            )}
          />
        ) : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", variant.dot)} />
      </span>
      <span className="leading-none">{variant.label}</span>
    </Tag>
  );
}
