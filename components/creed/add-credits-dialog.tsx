"use client";

// Add-credits modal. Two steps in one dialog: pick an amount, then confirm
// payment inline with the Stripe Payment Element (no redirect). The balance is
// credited by the webhook, so after a successful confirm we poll
// GET /api/app/credits briefly to reflect the new balance, then close.

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_TOPUP_USD, MIN_TOPUP_USD, PRESET_TOPUPS_USD } from "@/lib/ai/credit-config";
import { cn } from "@/lib/utils";

const PRESETS = PRESET_TOPUPS_USD;

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

type AddCreditsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalanceUsd: number;
  onToppedUp: () => void;
};

export function AddCreditsDialog({
  open,
  onOpenChange,
  currentBalanceUsd,
  onToppedUp,
}: AddCreditsDialogProps) {
  const [amount, setAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  // Reset to the amount step each time the dialog opens.
  useEffect(() => {
    if (open) {
      setClientSecret(null);
      setPublishableKey(null);
      setCreating(false);
    }
  }, [open]);

  const customValue = customAmount.trim() ? Number(customAmount) : null;
  const effectiveAmount =
    customValue !== null && Number.isFinite(customValue) ? customValue : amount;
  const amountValid =
    Number.isFinite(effectiveAmount) && effectiveAmount >= MIN_TOPUP_USD && effectiveAmount <= MAX_TOPUP_USD;

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  async function handleContinue() {
    if (!amountValid) return;
    try {
      setCreating(true);
      const response = await fetch("/api/app/credits/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: effectiveAmount }),
      });
      const payload = (await response.json()) as {
        clientSecret?: string;
        publishableKey?: string;
        error?: string;
      };
      if (!response.ok || !payload.clientSecret || !payload.publishableKey) {
        throw new Error(payload.error || "Could not start the payment");
      }
      setPublishableKey(payload.publishableKey);
      setClientSecret(payload.clientSecret);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the payment");
    } finally {
      setCreating(false);
    }
  }

  function handlePaid() {
    onToppedUp();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Add credits</DialogTitle>
          <DialogDescription>
            {`${formatUsd(currentBalanceUsd)} available. Top-ups roll over and never expire.`}
          </DialogDescription>
        </DialogHeader>

        {clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: isDark ? "night" : "stripe" } }}
          >
            <PaymentForm
              amountUsd={effectiveAmount}
              onPaid={handlePaid}
              onBack={() => setClientSecret(null)}
            />
          </Elements>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((preset) => {
                  const active = customValue === null && amount === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAmount(preset);
                        setCustomAmount("");
                      }}
                      className={cn(
                        "h-9 rounded-lg border bg-[var(--creed-surface)] text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
                        !active &&
                          "border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                      )}
                      style={
                        active
                          ? {
                              borderColor: "var(--creed-text-primary)",
                              color: "var(--creed-text-primary)",
                              background:
                                "linear-gradient(135deg, color-mix(in srgb, var(--creed-text-primary) 10%, transparent) 0%, color-mix(in srgb, var(--creed-text-primary) 15%, transparent) 100%)",
                              boxShadow:
                                "0 0 0 1px var(--creed-text-primary) inset",
                            }
                          : undefined
                      }
                    >
                      ${preset}
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                  Or enter an amount (USD)
                </label>
                <Input
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(event) => {
                    const raw = event.target.value;
                    // Numbers only, at most 2 decimal places, no negatives.
                    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                      setCustomAmount(raw);
                    }
                  }}
                  placeholder={`${MIN_TOPUP_USD} - ${MAX_TOPUP_USD}`}
                  className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
                />
                {customAmount.trim() && !amountValid ? (
                  <p className="mt-2 text-[12px] text-[#DC2626]">
                    Enter an amount between ${MIN_TOPUP_USD} and ${MAX_TOPUP_USD}.
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
              <Button variant="ghost" className="rounded-md" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
                onClick={() => void handleContinue()}
                disabled={!amountValid || creating}
              >
                {creating ? "Starting" : "Continue to payment"}
                {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  amountUsd,
  onPaid,
  onBack,
}: {
  amountUsd: number;
  onPaid: () => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handlePay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: window.location.href },
      });
      if (error) {
        toast.error(error.message || "Payment failed");
        return;
      }
      if (paymentIntent && paymentIntent.status === "succeeded") {
        // Credit immediately by verifying the PaymentIntent server-side. This
        // is idempotent with the webhook (both key off the PaymentIntent id),
        // so the balance lands now and the webhook stays the prod backstop.
        try {
          const response = await fetch("/api/app/credits/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
          });
          if (!response.ok) {
            throw new Error("confirm failed");
          }
          toast.success("Credits added");
        } catch {
          // Payment is captured; the webhook will reconcile the balance.
          toast.success("Payment received");
        }
        onPaid();
        return;
      }
      toast.success("Payment submitted");
      onPaid();
    } catch {
      toast.error("Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <PaymentElement />
      </div>
      <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
        <Button
          variant="ghost"
          className="rounded-md"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </Button>
        <Button
          className="rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
          onClick={() => void handlePay()}
          disabled={!stripe || submitting}
        >
          {submitting ? "Processing" : `Pay ${formatUsd(amountUsd)}`}
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        </Button>
      </DialogFooter>
    </>
  );
}
