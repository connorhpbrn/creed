"use client";

// Purchases only. Daily spend lives on the Model usage chart; Cloud/bonus
// grants follow credits home and stay out of this dialog.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import type { CreditTransaction } from "@/components/creed/settings-preload";

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function CreditsHistoryDialog({
  open,
  onOpenChange,
  transactions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: CreditTransaction[];
}) {
  const purchases = transactions
    .filter((tx) => tx.type === "topup")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Added credits</DialogTitle>
          <DialogDescription>
            Purchases for this Creed, newest first.
          </DialogDescription>
        </DialogHeader>
        {purchases.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--creed-text-tertiary)]">
            No purchases yet.
          </p>
        ) : (
          <div className="min-h-0 overflow-y-auto creed-scrollbar">
            <ul className="flex flex-col">
              {purchases.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-4 border-b border-[var(--creed-border)] py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-[var(--creed-text-primary)]">
                      Added credits
                    </div>
                    <div className="truncate text-[11px] text-[var(--creed-text-tertiary)]">
                      {formatWhen(tx.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[13px] text-[#15803D] dark:text-[#4ADE80]">
                      +{formatUsd(tx.amountUsd)}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--creed-text-tertiary)]">
                      Balance {formatUsd(tx.balanceAfterUsd)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
