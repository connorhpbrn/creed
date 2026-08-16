"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type CheckoutPlan = "personal";
export type CheckoutCadence = "monthly" | "yearly";
// Where cancel lands, and which success `next` to attach.
// pricing: buy-from-pricing stays on the pricing surface
// onboarding: funnel checkout returns into the app / onboarding gate
export type CheckoutReturnTo = "/pricing" | "/onboarding";

// Starts a Stripe Checkout for a plan + cadence and redirects to it.
// Shared by the pricing toggle CTAs and the onboarding "Get Creed" button so
// the already-owned / already-subscribed (409) handling and error copy live in
// one place. On success the browser navigates to Stripe, so `submitting` is
// intentionally left true (the page is leaving); it's only reset on error.
//
// Defaults to personal + monthly + onboarding return (the funnel path).
export function useStripeCheckout() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const startCheckout = useCallback(
    async (opts?: {
      plan?: CheckoutPlan;
      cadence?: CheckoutCadence;
      returnTo?: CheckoutReturnTo;
    }) => {
      if (submitting) return;
      setSubmitting(true);
      const returnTo: CheckoutReturnTo = opts?.returnTo ?? "/onboarding";
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: opts?.plan ?? "personal",
            cadence: opts?.cadence ?? "monthly",
            returnTo,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          alreadySubscribed?: boolean;
        };
        if (data.alreadySubscribed) {
          toast.success("You're already subscribed");
          router.push(returnTo === "/pricing" ? "/pricing" : "/file");
          return;
        }
        if (!res.ok || !data.url) {
          throw new Error(data.error || "Couldn't start checkout");
        }
        window.location.href = data.url;
      } catch (error) {
        setSubmitting(false);
        toast.error(error instanceof Error ? error.message : "Couldn't start checkout");
      }
    },
    [router, submitting]
  );

  return { startCheckout, submitting };
}
