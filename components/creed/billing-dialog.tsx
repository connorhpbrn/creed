"use client";

// Billing modal, opened from the profile dropdown. Lists every plan the user
// owns - their personal plan plus each company Creed they own - as a colored
// card (personal blue, company amber) showing the plan, its credits, and the
// right action. It is not scoped to the active Creed: you see everything you own
// from one place, no matter where you are.

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanCredits = {
  balanceUsd: number;
  allowanceUsd: number;
  allowanceResets: boolean;
  purchasedUsd: number;
};

type PlanCard = {
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
};

function cadenceLabel(plan: PlanCard): string {
  if (!plan.paid) return "Free";
  if (plan.billingMode === "lifetime") return "Lifetime";
  return plan.interval === "year" ? "Annual" : "Monthly";
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingDialog({ open, onOpenChange }: BillingDialogProps) {
  const [plans, setPlans] = useState<PlanCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalBusyKey, setPortalBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // Manage billing opens the Stripe portal for the right customer: the personal
  // entitlement's, or a specific company's.
  const openPortal = useCallback(
    async (plan: PlanCard) => {
      const key = plan.creedId ?? "personal";
      if (portalBusyKey) return;
      setPortalBusyKey(key);
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
    [portalBusyKey],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
          <DialogDescription>
            The plans you own and the credits they include.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-[var(--creed-text-tertiary)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {(plans ?? []).map((plan) => {
              const key = plan.creedId ?? "personal";
              const isCompany = plan.scope === "company";
              const cadence = cadenceLabel(plan);
              const isSubscription =
                plan.paid && plan.billingMode === "subscription";
              const renewal = formatDate(plan.currentPeriodEnd);
              const credits = plan.credits;
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-md border p-4",
                    isCompany
                      ? "border-[#FDE68A] bg-[#FFFBEB] dark:border-[#78350F]/50 dark:bg-[#422006]/30"
                      : "border-[#BFDBFE] bg-[#EFF6FF] dark:border-[#1E3A8A]/50 dark:bg-[#172554]/30",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                        {/* Company cards don't show the company's name - just
                            that it's a company plan (one card per company). */}
                        {isCompany ? "Company" : plan.name}
                      </span>
                      <span
                        className={cn(
                          "ml-2 inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
                          isCompany
                            ? "bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F]/50 dark:text-[#FBBF24]"
                            : "bg-[#DBEAFE] text-[var(--creed-accent-hover)] dark:bg-[#1E3A8A]/50 dark:text-[#60A5FA]",
                        )}
                      >
                        {cadence}
                      </span>
                      {plan.status === "past_due" ? (
                        <span className="ml-2 text-[12px] font-medium text-[#B45309] dark:text-[#F5A623]">
                          Payment past due
                        </span>
                      ) : null}
                    </div>
                    {credits ? (
                      <span className="shrink-0 font-mono text-[13px] text-[var(--creed-text-primary)]">
                        {formatUsd(credits.balanceUsd)}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-[13px] leading-6 text-[var(--creed-text-primary)]">
                    {credits
                      ? credits.allowanceResets
                        ? `${formatUsd(credits.allowanceUsd)} in credits, refreshed monthly.`
                        : `${formatUsd(credits.allowanceUsd)} in credits included.`
                      : "No credits on this plan."}
                    {isSubscription && renewal
                      ? ` ${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}.`
                      : ""}
                  </p>

                  {isSubscription ? (
                    <Button
                      variant="outline"
                      onClick={() => void openPortal(plan)}
                      disabled={portalBusyKey === key}
                      className="mt-3 h-9 w-full border-[var(--creed-border)] bg-transparent text-[13px] font-medium text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
                    >
                      {portalBusyKey === key ? "Opening" : "Manage billing"}
                    </Button>
                  ) : !plan.paid && plan.scope === "personal" ? (
                    <Link
                      href="/pricing"
                      className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-[var(--creed-accent)] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
                    >
                      View plans
                    </Link>
                  ) : null}
                </div>
              );
            })}

            {(plans ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--creed-text-tertiary)]">
                No plans yet.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
