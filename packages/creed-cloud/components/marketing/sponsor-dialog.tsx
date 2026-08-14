"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@creed/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { Input } from "@creed/ui/input";
import { PurchasePresetButton } from "@creed/cloud/components/creed/purchase-preset-button";
import { EditableProfileAvatar } from "@/components/creed/profile-avatar";
import {
  MAX_SPONSOR_USD,
  MIN_SPONSOR_USD,
  PRESET_SPONSOR_USD,
} from "@creed/cloud/lib/sponsor-config";

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function SponsorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const avatarUrl = useMemo(
    () => (avatar ? URL.createObjectURL(avatar) : undefined),
    [avatar]
  );

  useEffect(() => {
    return () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  useEffect(() => {
    if (open) {
      setClientSecret(null);
      setPublishableKey(null);
      setPaymentIntentId(null);
      setCreating(false);
      setAttemptId(crypto.randomUUID());
    }
  }, [open]);

  const customValue = customAmount.trim() ? Number(customAmount) : null;
  const effectiveAmount =
    customValue !== null && Number.isFinite(customValue) ? customValue : amount;
  const amountValid =
    Number.isFinite(effectiveAmount) &&
    effectiveAmount >= MIN_SPONSOR_USD &&
    effectiveAmount <= MAX_SPONSOR_USD;
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  async function handleContinue() {
    if (!amountValid) return;
    try {
      setCreating(true);
      let anonymousId = crypto.randomUUID();
      try {
        anonymousId = localStorage.getItem("creed-sponsor-id") || anonymousId;
        localStorage.setItem("creed-sponsor-id", anonymousId);
      } catch {
        // Storage can be unavailable in strict privacy modes. The payment remains valid.
      }
      const response = await fetch("/api/sponsor/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: effectiveAmount,
          attemptId,
          anonymousId,
          name,
          message,
        }),
      });
      const payload = (await response.json()) as {
        clientSecret?: string;
        publishableKey?: string;
        paymentIntentId?: string;
        error?: string;
      };
      if (!response.ok || !payload.clientSecret || !payload.publishableKey || !payload.paymentIntentId) {
        throw new Error(payload.error || "Could not start the payment");
      }
      setPublishableKey(payload.publishableKey);
      setClientSecret(payload.clientSecret);
      setPaymentIntentId(payload.paymentIntentId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the payment"
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Contribute</DialogTitle>
          <DialogDescription>
            Choose an amount to support Creed.
          </DialogDescription>
        </DialogHeader>

        {clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: isDark ? "night" : "stripe" },
            }}
          >
            <SponsorPaymentForm
              amountUsd={effectiveAmount}
              avatar={avatar}
              paymentIntentId={paymentIntentId}
              onPaid={() => onOpenChange(false)}
              onBack={() => {
                setClientSecret(null);
                setPaymentIntentId(null);
                setAttemptId(crypto.randomUUID());
              }}
            />
          </Elements>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {PRESET_SPONSOR_USD.map((preset) => (
                  <PurchasePresetButton
                    key={preset}
                    active={customValue === null && amount === preset}
                    onClick={() => {
                      setAmount(preset);
                      setCustomAmount("");
                    }}
                  >
                    ${preset}
                  </PurchasePresetButton>
                ))}
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
                    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                      setCustomAmount(raw);
                    }
                  }}
                  placeholder={`${MIN_SPONSOR_USD} - ${MAX_SPONSOR_USD}`}
                  className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
                />
                {customAmount.trim() && !amountValid ? (
                  <p className="mt-2 text-[12px] text-[#DC2626]">
                    Enter an amount between ${MIN_SPONSOR_USD} and ${MAX_SPONSOR_USD}.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3">
                <EditableProfileAvatar
                  kind="person"
                  name={name}
                  avatarUrl={avatarUrl}
                  disabled={creating}
                  size="input"
                  onFile={(file) => {
                    if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                      toast.error("Use a JPG, PNG, or WebP image smaller than 3 MB.");
                      setAvatar(null);
                      return;
                    }
                    setAvatar(file);
                  }}
                />
                <Input
                  value={name}
                  maxLength={50}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Anonymous"
                  aria-label="Sponsor name"
                  className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                  Message (optional)
                </label>
                <textarea
                  value={message}
                  maxLength={240}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Leave a note"
                  className="min-h-20 w-full resize-none rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-[var(--creed-text-tertiary)] focus:border-[var(--creed-accent)]"
                />
                <div className="mt-1 text-right text-[11px] tabular-nums text-[var(--creed-text-tertiary)]">
                  {message.length}/240
                </div>
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
              <Button
                variant="ghost"
                className="rounded-md"
                onClick={() => onOpenChange(false)}
              >
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

function SponsorPaymentForm({
  amountUsd,
  avatar,
  paymentIntentId,
  onPaid,
  onBack,
}: {
  amountUsd: number;
  avatar: File | null;
  paymentIntentId: string | null;
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
        confirmParams: { return_url: `${window.location.origin}/sponsor` },
      });
      if (error) {
        toast.error(error.message || "Payment failed");
        return;
      }
      if (paymentIntent?.status === "succeeded") {
        try {
          const response = await fetch("/api/sponsor/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
          });
          if (!response.ok) throw new Error("Confirmation failed");
          if (avatar && paymentIntentId) {
            const form = new FormData();
            form.set("file", avatar);
            form.set("paymentIntentId", paymentIntentId);
            const upload = await fetch("/api/sponsor/avatar", { method: "POST", body: form });
            if (!upload.ok) toast.error("Payment succeeded, but the picture could not be saved.");
          }
          toast.success("Thank you for supporting Creed.");
        } catch {
          toast.success("Payment received.");
        }
        onPaid();
        return;
      }
      toast.success("Payment submitted.");
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
