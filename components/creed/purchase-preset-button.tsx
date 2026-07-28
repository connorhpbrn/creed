"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PurchasePresetButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-lg border bg-[var(--creed-surface)] text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
        active
          ? "border-[var(--creed-accent)] text-[var(--creed-accent)] shadow-[inset_0_0_0_1px_var(--creed-accent)]"
          : "border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
      )}
      style={
        active
          ? {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--creed-accent) 10%, transparent) 0%, color-mix(in srgb, var(--creed-accent) 15%, transparent) 100%)",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}
