"use client";

// Read-only display ledger: money-in events plus monthly model-usage spend.

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreditTransaction } from "@/components/creed/settings-preload";
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

function monthKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function collapseMonthlySpend(transactions: CreditTransaction[]) {
  const allowanceDateByMonth = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.type === "grant") {
      allowanceDateByMonth.set(monthKey(tx.createdAt), tx.createdAt);
    }
  }

  const output: CreditTransaction[] = [];
  const monthlySpend = new Map<string, CreditTransaction>();

  for (const tx of transactions) {
    if (tx.type !== "debit" && tx.type !== "monthly-spend") {
      output.push(tx);
      continue;
    }

    const key = monthKey(tx.createdAt);
    const current = monthlySpend.get(key);
    const displayDate = allowanceDateByMonth.get(key) ?? tx.createdAt;
    monthlySpend.set(key, {
      ...tx,
      id: `monthly-spend-${key}`,
      type: "monthly-spend",
      amountUsd: (current?.amountUsd ?? 0) + tx.amountUsd,
      balanceAfterUsd:
        !current || Date.parse(tx.createdAt) > Date.parse(current.createdAt)
          ? tx.balanceAfterUsd
          : current.balanceAfterUsd,
      createdAt: displayDate,
    });
  }

  return [...output, ...monthlySpend.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
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
  const displayTransactions = useMemo(
    () => collapseMonthlySpend(transactions),
    [transactions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Credit history</DialogTitle>
          <DialogDescription>Monthly model spend and money added, newest first.</DialogDescription>
        </DialogHeader>
        {displayTransactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--creed-text-tertiary)]">
            No credit activity yet.
          </p>
        ) : (
          <div className="min-h-0 overflow-y-auto creed-scrollbar">
            <ul className="flex flex-col">
              {displayTransactions.map((tx) => {
                const isCredit = tx.type === "topup" || tx.type === "grant";
                const label =
                  tx.type === "topup"
                    ? "Added credits"
                    : tx.type === "grant"
                      ? allowanceResets
                        ? "Monthly allowance"
                        : "Lifetime credits"
                      : "Monthly model usage";
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
                          isCredit
                            ? "text-[#15803D] dark:text-[#4ADE80]"
                            : "text-[#B91C1C] dark:text-[#F87171]"
                        )}
                      >
                        {isCredit ? "+" : "-"}
                        {formatUsd(tx.amountUsd)}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--creed-text-tertiary)]">
                        Balance {formatUsd(tx.balanceAfterUsd)}
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
