"use client";

// Billing modal, opened from the profile dropdown. Reads the current
// entitlement from /api/stripe/status and offers the right actions:
//
//   lifetime owner → "You own Creed" - nothing to manage.
//   subscriber     → renewal/cancel summary, "Manage billing" (Stripe portal),
//                    and "Own it for life" (upgrade-to-own checkout).
//   no plan        → link out to pricing (shouldn't happen inside the gated
//                    app, but handled so the dialog never dead-ends).

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
import { useStripeCheckout } from "@/components/marketing/use-stripe-checkout";

type BillingStatus = {
  paid: boolean;
  plan: string | null;
  billingMode: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type BillingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function planLabel(plan: string | null): string {
  if (plan === "company") return "Company";
  return "Personal";
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function BillingDialog({ open, onOpenChange }: BillingDialogProps) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const { startCheckout, submitting } = useStripeCheckout();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetch("/api/stripe/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BillingStatus | null) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const openPortal = useCallback(async () => {
    if (openingPortal) return;
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Couldn't open billing");
      }
      window.location.href = data.url;
    } catch (error) {
      setOpeningPortal(false);
      toast.error(error instanceof Error ? error.message : "Couldn't open billing.");
    }
  }, [openingPortal]);

  const isLifetime = status?.billingMode === "lifetime" && status.paid;
  const isSubscriber = status?.billingMode === "subscription" && status.paid;
  const renewalDate = formatDate(status?.currentPeriodEnd ?? null);
  // Monthly and yearly both come back as billingMode "subscription"; the
  // interval is the only discriminator. Default to monthly for legacy rows
  // that predate the interval column.
  const cadenceWord = status?.interval === "year" ? "yearly" : "monthly";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
          <DialogDescription>
            {isLifetime
              ? "You own Creed."
              : isSubscriber
                ? `${planLabel(status?.plan ?? null)} plan, billed ${cadenceWord}.`
                : "Manage your Creed plan."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-[var(--creed-text-tertiary)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : isLifetime ? (
          <div className="space-y-4 py-2">
            <div className="rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] p-4">
              <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                {planLabel(status?.plan ?? null)} - lifetime
              </div>
              <p className="mt-1 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                You bought Creed outright. There&apos;s nothing to manage.
              </p>
            </div>
          </div>
        ) : isSubscriber ? (
          <div className="space-y-4 py-2">
            <div className="rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                  {planLabel(status?.plan ?? null)} - {cadenceWord}
                </span>
                {status?.status === "past_due" ? (
                  <span className="text-[12px] font-medium text-[#B45309] dark:text-[#F5A623]">
                    Payment past due
                  </span>
                ) : null}
              </div>
              {renewalDate ? (
                <p className="mt-1 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                  {status?.cancelAtPeriodEnd
                    ? `Access ends on ${renewalDate}.`
                    : `Renews on ${renewalDate}.`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                onClick={() => void startCheckout({ plan: "personal", cadence: "lifetime" })}
                disabled={submitting}
                className="h-10 w-full bg-[#2563EB] text-[14px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-70"
              >
                {submitting ? "Starting" : "Own it for life - $199"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void openPortal()}
                disabled={openingPortal}
                className="h-10 w-full border-[var(--creed-border)] bg-transparent text-[14px] font-medium text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
              >
                {openingPortal ? "Opening" : "Manage billing"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-[13px] leading-6 text-[var(--creed-text-secondary)]">
              You don&apos;t have an active plan.
            </p>
            <Link
              href="/pricing"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#2563EB] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
            >
              View plans
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
