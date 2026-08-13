import { cn } from "@creed/ui/utils";
import type { RoadmapColumnId } from "@/lib/marketing/roadmap";

// Per-status colour pairs, modelled on the "Connected" badge in settings
// (components/creed/settings-screen.tsx): a soft tinted fill with a saturated
// label, tuned separately for light and dark so contrast holds in both. Shipped
// reuses the exact Connected green. Must live under components/ (not lib/) so
// Tailwind picks up the arbitrary colour classes (globals.css scopes scanning
// to app/ and components/).
export const ROADMAP_STATUS_STYLE: Record<
  RoadmapColumnId,
  { fill: string; text: string }
> = {
  next: {
    fill: "bg-[#EFF6FF] dark:bg-[#102341]/60",
    text: "text-[var(--creed-accent-hover)] dark:text-[#60A5FA]",
  },
  in_progress: {
    fill: "bg-[#FFFBEB] dark:bg-[#3a2a12]/50",
    text: "text-[#B45309] dark:text-[#FBBF24]",
  },
  shipped: {
    fill: "bg-[#ECFDF5] dark:bg-[#052e1a]/50",
    text: "text-[#047857] dark:text-[#4ade80]",
  },
};

// The small inline status pill used on the /roadmap board column headers.
// Styled to match the settings "Connected" tag: rounded-[6px], compact, tinted
// fill + saturated text, no dot.
export function RoadmapStatusPill({
  id,
  label,
}: {
  id: RoadmapColumnId;
  label: string;
}) {
  const style = ROADMAP_STATUS_STYLE[id];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium",
        style.fill,
        style.text,
      )}
    >
      {label}
    </span>
  );
}

const ROADMAP_LABEL_STYLE: Record<string, string> = {
  feature:
    "bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#102341]/60 dark:text-[#60A5FA]",
  improvement:
    "bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#2E175F]/55 dark:text-[#C4B5FD]",
  bug: "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/55 dark:text-[#FCA5A5]",
};

export function RoadmapLabelTag({ label }: { label: string }) {
  const style =
    ROADMAP_LABEL_STYLE[label.toLocaleLowerCase()] ??
    "bg-[var(--creed-surface-raised)] text-[var(--creed-text-secondary)]";
  const displayLabel = `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium",
        style,
      )}
    >
      {displayLabel}
    </span>
  );
}
