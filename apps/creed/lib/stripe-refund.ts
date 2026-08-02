// Pure refund-rule helper, kept dependency-free (no `server-only`, no Stripe
// SDK, no path-aliased imports) so the partial-vs-full decision can be unit
// tested under `node --test` without standing up Stripe or Supabase. The
// stateful revoke flow that consumes it lives in lib/stripe.ts.

/**
 * True only when a charge has been *fully* refunded. A partial refund (e.g. a
 * goodwill credit that leaves the purchase mostly intact) keeps access. Stripe
 * sets `charge.refunded` to true once the full amount is back; the amount
 * comparison is a belt-and-braces fallback for older/edge payloads.
 */
export function isChargeFullyRefunded(charge: {
  refunded?: boolean | null;
  amount?: number | null;
  amount_refunded?: number | null;
}): boolean {
  if (charge.refunded === true) {
    return true;
  }
  const amount = charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  return amount > 0 && refunded >= amount;
}
