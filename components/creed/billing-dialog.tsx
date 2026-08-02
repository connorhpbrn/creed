"use client";

// Billing modal, opened from the profile dropdown. Lists every plan the user
// owns - their personal plan plus each company Creed they own - as one statement
// of rows rather than a wall of cards: what the plan is, what it costs, how much
// of its credit allowance is left, and the one action that belongs to it. It is
// not scoped to the active Creed: you see everything you own from one place, no
// matter where you are.
//
// Personal and company are told apart by a 3px accent rail, the same device the
// file sections use, rather than by tinting the whole row. The tint encoded one
// bit that the row's own label already carries, and it was the loudest thing in
// a dialog whose job is to show numbers.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPANY_PRICING,
  PERSONAL_PRICING,
  type BillingCycle,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

export type PlanCredits = {
  balanceUsd: number;
  allowanceUsd: number;
  allowanceResets: boolean;
  purchasedUsd: number;
};

export type PlanCard = {
  scope: "personal" | "company";
  creedId: string | null;
  name: string;
  paid: boolean;
  billingMode: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  credits: PlanCredits | null;
};

type BillingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Dev-only: renders these rows instead of fetching, so every plan shape can
  // be looked at side by side. See the B shortcut in welcome-dev-preview.
  previewPlans?: PlanCard[];
};

const COMPANY_ACCENT = "#D97706";

function billingCycle(plan: PlanCard): BillingCycle {
  if (plan.billingMode === "lifetime") return "lifetime";
  return plan.interval === "year" ? "yearly" : "monthly";
}

function cadenceLabel(plan: PlanCard): string {
  if (!plan.paid) return "Free";
  const cycle = billingCycle(plan);
  if (cycle === "lifetime") return "Lifetime";
  return cycle === "yearly" ? "Annual" : "Monthly";
}

// The plan's list price, read from the same table the pricing page renders so
// the two can never disagree. Deliberately the list price and not the invoice:
// a company's actual charge includes extra seats, which this endpoint does not
// return, so the row states the plan's price and stays quiet about the rest.
function listPrice(plan: PlanCard): string | null {
  if (!plan.paid) return null;
  const table = plan.scope === "company" ? COMPANY_PRICING : PERSONAL_PRICING;
  const { price, cadence } = table[billingCycle(plan)];
  return cadence === "one-time" ? price : `${price}${cadence}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// What is left of the plan's own allowance, kept apart from topped-up credits.
// `balanceUsd` is granted + purchased, so spending it straight against the
// allowance would read as over 100% for anyone who has ever topped up.
function allowanceState(credits: PlanCredits) {
  const remaining = Math.max(
    0,
    Math.min(credits.balanceUsd - credits.purchasedUsd, credits.allowanceUsd),
  );
  return {
    remaining,
    allowance: credits.allowanceUsd,
    extra: credits.purchasedUsd,
  };
}

function PlanRowSkeleton() {
  return (
    <div className="flex gap-3 py-3.5">
      <div className="w-[3px] shrink-0 rounded-full bg-[var(--creed-surface-raised)]" />
      <div className="min-w-0 flex-1 animate-pulse motion-reduce:animate-none">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3.5 w-28 rounded-[6px] bg-[var(--creed-surface-raised)]" />
          <div className="h-3.5 w-14 rounded-[6px] bg-[var(--creed-surface-raised)]" />
        </div>
        <div className="mt-2.5 h-3 w-44 rounded-[6px] bg-[var(--creed-surface-raised)]" />
      </div>
    </div>
  );
}

export function BillingDialog({
  open,
  onOpenChange,
  previewPlans,
}: BillingDialogProps) {
  const [plans, setPlans] = useState<PlanCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalBusyKey, setPortalBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (previewPlans) {
      setPlans(previewPlans);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetch("/api/app/billing/plans", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { plans?: PlanCard[] } | null) => {
        if (active) setPlans(data?.plans ?? []);
      })
      .catch(() => {
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, previewPlans]);

  // Manage billing opens the Stripe portal for the right customer: the personal
  // entitlement's, or a specific company's.
  const openPortal = useCallback(
    async (plan: PlanCard) => {
      const key = plan.creedId ?? "personal";
      if (portalBusyKey) return;
      setPortalBusyKey(key);
      if (previewPlans) {
        window.setTimeout(() => setPortalBusyKey(null), 1200);
        return;
      }
      try {
        const res =
          plan.scope === "company"
            ? await fetch("/api/app/company/portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ creedId: plan.creedId }),
              })
            : await fetch("/api/stripe/portal", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.url)
          throw new Error(data.error || "Couldn't open billing");
        window.location.href = data.url;
      } catch (error) {
        setPortalBusyKey(null);
        toast.error(
          error instanceof Error ? error.message : "Couldn't open billing.",
        );
      }
    },
    [portalBusyKey, previewPlans],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
          <DialogDescription>
            The plans you own and the credits they include.
          </DialogDescription>
        </DialogHeader>

        {/* Own enough company Creeds and the list outgrows a short window, and
            the dialog itself does not scroll. */}
        <div className="creed-scrollbar max-h-[60vh] divide-y divide-[var(--creed-border)] overflow-y-auto">
          {loading ? (
            // Same geometry as a real row, so the dialog does not resize under
            // the cursor when the plans land.
            <>
              <PlanRowSkeleton />
              <PlanRowSkeleton />
            </>
          ) : (plans ?? []).length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--creed-text-tertiary)]">
              No plans yet.
            </p>
          ) : (
            (plans ?? []).map((plan) => {
              const key = plan.creedId ?? "personal";
              const isCompany = plan.scope === "company";
              const accent = isCompany
                ? COMPANY_ACCENT
                : "var(--creed-accent)";
              const isSubscription =
                plan.paid && plan.billingMode === "subscription";
              const renewal = formatDate(plan.currentPeriodEnd);
              const price = listPrice(plan);
              const allowance =
                plan.credits && plan.credits.allowanceUsd > 0
                  ? allowanceState(plan.credits)
                  : null;
              const metaNote =
                isSubscription && renewal
                  ? `${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}`
                  : plan.paid && plan.billingMode === "lifetime"
                    ? "Yours forever"
                    : null;

              return (
                <div key={key} className="flex gap-3 py-3.5">
                  <div
                    aria-hidden="true"
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                          {/* The company's own name. Every company row used to
                              read "Company", which made two of them identical. */}
                          {plan.name}
                        </span>
                        <span className="shrink-0 rounded-[6px] bg-[var(--creed-surface-raised)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--creed-text-secondary)]">
                          {cadenceLabel(plan)}
                        </span>
                        {plan.status === "past_due" ? (
                          <span className="shrink-0 text-[12px] font-medium text-[#B45309] dark:text-[#F5A623]">
                            Past due
                          </span>
                        ) : null}
                      </div>
                      {price ? (
                        <span className="shrink-0 text-[14px] font-medium tabular-nums text-[var(--creed-text-primary)]">
                          {price}
                        </span>
                      ) : null}
                    </div>

                    {/* One meta line: what is left, what is extra, when it
                        renews. Kept as plain figures - a bar per row turned a
                        list of numbers into a chart nobody asked for. */}
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px]">
                      <div className="flex min-w-0 items-center gap-1.5 truncate">
                        {allowance ? (
                          <span className="tabular-nums text-[var(--creed-text-secondary)]">
                            {formatUsd(allowance.remaining)} of{" "}
                            {formatUsd(allowance.allowance)} left
                          </span>
                        ) : plan.credits ? (
                          <span className="tabular-nums text-[var(--creed-text-secondary)]">
                            {formatUsd(plan.credits.balanceUsd)} in credits
                          </span>
                        ) : null}

                        {/* Top-ups roll over and are not part of the allowance,
                            so they are counted beside it, never inside it. */}
                        {allowance && allowance.extra > 0 ? (
                          <>
                            <span className="text-[var(--creed-text-tertiary)]">
                              &middot;
                            </span>
                            <span className="tabular-nums text-[var(--creed-text-tertiary)]">
                              {formatUsd(allowance.extra)} extra
                            </span>
                          </>
                        ) : null}

                        {metaNote ? (
                          <>
                            {allowance || plan.credits ? (
                              <span className="text-[var(--creed-text-tertiary)]">
                                &middot;
                              </span>
                            ) : null}
                            <span className="truncate text-[var(--creed-text-tertiary)]">
                              {metaNote}
                            </span>
                          </>
                        ) : null}
                      </div>

                      {/* One quiet link per row. Three plans used to mean three
                          full-width buttons stacked down the dialog. */}
                      {isSubscription ? (
                        <button
                          type="button"
                          onClick={() => void openPortal(plan)}
                          disabled={portalBusyKey === key}
                          className={cn(
                            "shrink-0 font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]",
                            portalBusyKey === key && "opacity-60",
                          )}
                        >
                          {portalBusyKey === key ? "Opening" : "Manage"}
                        </button>
                      ) : !plan.paid && plan.scope === "personal" ? (
                        <Link
                          href="/pricing"
                          className="shrink-0 font-medium text-[var(--creed-accent)] transition-colors duration-150 hover:text-[var(--creed-accent-hover)]"
                        >
                          View plans
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
