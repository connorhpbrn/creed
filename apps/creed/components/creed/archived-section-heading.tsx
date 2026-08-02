"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArchivedSectionHeading({
  name,
  accent,
  expanded,
  onToggle,
}: {
  name: string;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const identity = (
    <>
      <span
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: accent }}
      />
      <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
        {name}
      </span>
    </>
  );

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
        {identity}
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="group hidden min-w-0 flex-1 items-center gap-2.5 text-left md:flex"
      >
        {identity}
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-primary)]",
            expanded && "rotate-90",
          )}
        />
      </button>
    </>
  );
}
