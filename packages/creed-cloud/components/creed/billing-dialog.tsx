"use client";

// Billing modal for the account-wide Cloud subscription.
//
// Credits are deliberately not here. They move constantly and they already have
// a home next to the usage chart in Settings; repeating them turned a plan list
// into a dashboard. This answers "what am I paying for" and nothing else.
//
// Only an active paid plan is listed. There is no free tier to describe.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { Button } from "@creed/ui/button";
import { cn } from "@creed/ui/utils";
import { CLOUD_PRICING, type BillingCycle } from "@/lib/marketing/pricing";

export type PlanCard = {
  scope: "cloud";
  creedId: string | null;
  name: string;
  paid: boolean;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type BillingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Dev-only: renders these rows instead of fetching, so every plan shape can
  // be looked at side by side. See ⌘/Ctrl+B / the Cmd+D panel in
  // welcome-dev-preview.
  previewPlans?: PlanCard[];
};

const CADENCE_TAG_CLASS =
  "bg-[#DBEAFE] text-[var(--creed-accent-hover)] dark:bg-[#1E3A8A]/50 dark:text-[#60A5FA]";

function billingCycle(plan: PlanCard): BillingCycle {
  return plan.interval === "year" ? "yearly" : "monthly";
}

function cadenceLabel(plan: PlanCard): string {
  const cycle = billingCycle(plan);
  return cycle === "yearly" ? "Annual" : "Monthly";
}

// The plan's list price, read from the same table the pricing page renders so
// the two can never disagree.
function listPrice(plan: PlanCard): string {
  const { price, cadence } = CLOUD_PRICING[billingCycle(plan)];
  return `${price}${cadence}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Measured against a real row rather than approximated: a 22.5px name line, a
// 4px gap, a 19.5px detail line, and the same 32px of vertical padding, so the
// list does not change height when the plans arrive. Bar heights follow the
// convention used by the route skeletons - roughly 0.72x the text they stand in
// for, inside a box of the text's real line height.
function PlanRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 last:pb-0">
      <div className="min-w-0 flex-1 animate-pulse motion-reduce:animate-none">
        <div className="flex h-[22.5px] items-center gap-2">
          <div className="h-[11px] w-28 rounded-[6px] bg-[var(--creed-surface-raised)]" />
          <div className="h-[20.5px] w-[54px] rounded-[6px] bg-[var(--creed-surface-raised)]" />
        </div>
        <div className="mt-1 flex h-[19.5px] items-center">
          <div className="h-[9px] w-44 rounded-[6px] bg-[var(--creed-surface-raised)]" />
        </div>
      </div>
      <div className="h-8 w-[77px] shrink-0 animate-pulse rounded-md bg-[var(--creed-surface-raised)] motion-reduce:animate-none" />
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
    fetch("/api/stripe/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        paid?: boolean;
        interval?: string | null;
        status?: string | null;
        currentPeriodEnd?: string | null;
        cancelAtPeriodEnd?: boolean;
      } | null) => {
        if (active) setPlans(data?.paid ? [{
          scope: "cloud",
          creedId: null,
          name: "Creed Cloud",
          paid: true,
          interval: data.interval ?? null,
          status: data.status ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
        }] : []);
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

  // Manage billing opens Stripe's portal for the account subscription.
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
        const res = await fetch("/api/stripe/portal", { method: "POST" });
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

  const paidPlans = (plans ?? []).filter((plan) => plan.paid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
          <DialogDescription>The plans you own.</DialogDescription>
        </DialogHeader>

        {/* Every rule runs the full width of the panel: the block is pulled out
            through the dialog's padding and the rows put it back on themselves,
            so the lines reach both edges while the text stays aligned with the
            header above it.

            min-w-0 because the dialog lays its children out in a grid, and a
            grid item will not shrink below its content unless told to. */}
        <div className="-mx-5 min-w-0">
          <div aria-hidden="true" className="h-px bg-[var(--creed-border)]" />
          <div className="divide-y divide-[var(--creed-border)]">
            {loading ? (
              // Same geometry as a real row, so the dialog does not resize under
              // the cursor when the plans land.
              <>
                <PlanRowSkeleton />
                <PlanRowSkeleton />
              </>
            ) : paidPlans.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--creed-text-tertiary)]">
                No plans yet.
              </p>
            ) : (
              paidPlans.map((plan) => {
                const key = plan.creedId ?? "personal";
                const renewal = formatDate(plan.currentPeriodEnd);
                const price = listPrice(plan);
                // Amber warns, red ends: past due is recoverable, cancelled is
                // the plan on its way out.
                const flag =
                  plan.status === "past_due"
                    ? {
                        label: "Past due",
                        className: "text-[#B45309] dark:text-[#F5A623]",
                      }
                    : plan.cancelAtPeriodEnd
                      ? {
                          label: "Cancelled",
                          className: "text-[#DC2626] dark:text-[#F87171]",
                        }
                      : null;

                // One line of context under the name: price and next charge.
                const detail = [
                  price,
                  renewal
                    ? `${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-4 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-[var(--creed-text-primary)]">
                          {plan.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
                            CADENCE_TAG_CLASS,
                          )}
                        >
                          {cadenceLabel(plan)}
                        </span>
                        {flag ? (
                          <span
                            className={cn(
                              "shrink-0 text-[12px] font-medium",
                              flag.className,
                            )}
                          >
                            {flag.label}
                          </span>
                        ) : null}
                      </div>
                      {detail ? (
                        <div className="mt-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
                          {detail}
                        </div>
                      ) : null}
                    </div>

                    <Button
                      onClick={() => void openPortal(plan)}
                      disabled={portalBusyKey === key}
                      className="h-8 shrink-0 rounded-md bg-[var(--creed-accent)] px-3.5 text-[13px] text-white hover:bg-[var(--creed-accent-hover)]"
                    >
                      {portalBusyKey === key ? "Opening" : "Manage"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
