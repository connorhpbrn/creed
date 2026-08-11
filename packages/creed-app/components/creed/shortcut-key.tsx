"use client";

import { cn } from "@creed/ui/utils";

export function ShortcutKey({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] text-[10px] font-medium leading-none text-[var(--creed-text-secondary)] transition-colors",
        // Match the parent's hover/focus text (same near-white as dropdown
        // menu items' focus:**:text-accent-foreground treatment).
        "group-hover:text-[var(--creed-text-primary)] group-focus-visible:text-[var(--creed-text-primary)]",
        "[:is(button:hover,_a:hover,_[role=menuitem]:hover,_[role=menuitem]:focus)_&]:text-[var(--creed-text-primary)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
