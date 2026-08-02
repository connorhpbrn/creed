"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { ActivityStatus } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

export type ActivityFilterValue = "all" | Exclude<ActivityStatus, "pending" | "stale">;
export type ActivityFilterTone = "blue" | "green" | "red" | "orange";

export const ACTIVITY_FILTERS: ReadonlyArray<{
  label: string;
  value: ActivityFilterValue;
}> = [
  { label: "All", value: "all" },
  { label: "Direct", value: "direct" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
];

export function getActivityFilterTone(value: ActivityFilterValue): ActivityFilterTone {
  if (value === "accepted") return "green";
  if (value === "rejected") return "red";
  if (value === "direct") return "orange";
  return "blue";
}

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  direct: "Direct",
  rejected: "Rejected",
  stale: "Stale",
};

export function getActivityStatusStyles(status: ActivityStatus) {
  if (status === "pending") {
    return "bg-[#EFF6FF] text-[var(--creed-accent-hover)] dark:bg-[#1e3a8a]/25 dark:text-[#93c5fd]";
  }
  if (status === "direct") {
    return "bg-[#FFF6E8] text-[#C26A00] dark:bg-[#451a03]/40 dark:text-[#fbbf24]";
  }
  if (status === "accepted") {
    return "bg-[#F0FDF4] text-[#15803D] dark:bg-[#052e1a]/50 dark:text-[#4ade80]";
  }
  if (status === "stale") {
    return "bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#2e1065]/40 dark:text-[#c4b5fd]";
  }
  return "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/40 dark:text-[#fca5a5]";
}

export function ActivityFilterPill({
  active,
  tone = "blue",
  onClick,
  children,
}: {
  active: boolean;
  tone?: ActivityFilterTone;
  onClick: () => void;
  children: ReactNode;
}) {
  const activeClass =
    tone === "green"
      ? "border-[#22C55E] bg-[#F0FDF4] text-[#15803D] shadow-[inset_0_0_0_1px_#22C55E] dark:border-[#4ade80] dark:bg-[#052e1a]/50 dark:text-[#4ade80] dark:shadow-[inset_0_0_0_1px_#4ade80]"
      : tone === "red"
        ? "border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C] shadow-[inset_0_0_0_1px_#EF4444] dark:border-[#F87171] dark:bg-[#3F1212]/40 dark:text-[#fca5a5] dark:shadow-[inset_0_0_0_1px_#F87171]"
        : tone === "orange"
          ? "border-[#F59E0B] bg-[#FFF7ED] text-[#C26A00] shadow-[inset_0_0_0_1px_#F59E0B] dark:border-[#fbbf24] dark:bg-[#451a03]/40 dark:text-[#fbbf24] dark:shadow-[inset_0_0_0_1px_#fbbf24]"
          : "border-[var(--creed-accent)] bg-[#EFF6FF] text-[#1447E6] shadow-[inset_0_0_0_1px_#2563EB] dark:border-[#93c5fd] dark:bg-[#1e3a8a]/30 dark:text-[#93c5fd] dark:shadow-[inset_0_0_0_1px_#93c5fd]";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
        active
          ? activeClass
          : "border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      )}
    >
      {children}
    </motion.button>
  );
}
