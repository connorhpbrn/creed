"use client";

// Read-only ledger of credit top-ups and per-call debits, newest first.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreditTransaction } from "@/components/creed/settings-preload";
import { featureMeta } from "@/lib/ai/features";
import { cn } from "@/lib/utils";

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

function labelForDebit(feature: string | null) {
  return feature ? featureMeta(feature).label : "AI usage";
}

export function CreditsHistoryDialog({
  open,
  onOpenChange,
  transactions,
  allowanceResets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: CreditTransaction[];
  // Whether the plan's allowance recurs (subscriptions) or is a one-time grant
  // (lifetime), so grant rows read correctly for each.
  allowanceResets: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Credit history</DialogTitle>
          <DialogDescription>Top-ups and per-call charges, newest first.</DialogDescription>
        </DialogHeader>
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--creed-text-tertiary)]">
            No credit activity yet.
          </p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <ul className="flex flex-col">
              {transactions.map((tx) => {
                const isCredit = tx.type === "topup" || tx.type === "grant";
                const label =
                  tx.type === "topup"
                    ? "Added credits"
                    : tx.type === "grant"
                      ? allowanceResets
                        ? "Monthly allowance"
                        : "Welcome credits"
                      : labelForDebit(tx.feature);
                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-4 border-b border-[var(--creed-border)] py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] text-[var(--creed-text-primary)]">{label}</div>
                      <div className="truncate text-[11px] text-[var(--creed-text-tertiary)]">
                        {formatWhen(tx.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "font-mono text-[13px]",
                          isCredit ? "text-[#16A34A]" : "text-[var(--creed-text-primary)]"
                        )}
                      >
                        {isCredit ? "+" : "-"}
                        {formatUsd(tx.amountUsd)}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--creed-text-tertiary)]">
                        {formatUsd(tx.balanceAfterUsd)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
