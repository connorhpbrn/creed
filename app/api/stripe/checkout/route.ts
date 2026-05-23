import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  getEntitlement,
  getStripeClient,
  getStripePriceId,
} from "@/lib/stripe";
import { getSiteUrl } from "@/lib/supabase/env";
import { log } from "@/lib/observability";

// Auth-required. Creates a one-time Checkout Session for the Hosted plan
// keyed to the current Supabase user. We attach the user id in BOTH
// `client_reference_id` (Stripe-native) and `metadata.supabaseUserId`
// (read by our webhook + success-page upsert) so the payment is
// unambiguously linked to a real account.
//
// If the user already owns Creed, returns 409 — the pricing card should
// be showing them the "Owned" pill, but a deep-link or stale tab could
// still POST here and we want a clear signal rather than an extra charge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  if (!user.email) {
    return NextResponse.json(
      { error: "Account is missing an email. Sign in again with Google." },
      { status: 400 }
    );
  }

  try {
    const existing = await getEntitlement(user.id);
    if (existing && existing.status === "paid") {
      return NextResponse.json(
        { error: "You already own Creed.", alreadyPaid: true },
        { status: 409 }
      );
    }

    const stripe = getStripeClient();
    const priceId = getStripePriceId();
    const baseUrl = getSiteUrl();
    const email = user.email.trim().toLowerCase();

    // Idempotency key: `{userId}:{priceId}`. A user who double-clicks the
    // Get Started button (or whose request retries on a transient network
    // hiccup) receives the SAME Checkout Session URL rather than two new
    // ones — Stripe deduplicates the create call within a 24h window. The
    // key intentionally doesn't include a timestamp because that would
    // defeat the purpose: we want repeat-creates within the same purchase
    // attempt to collapse, not generate a fresh session each click.
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        client_reference_id: user.id,
        metadata: {
          supabaseUserId: user.id,
          email,
          product: "creed_hosted",
        },
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        // Surface promo-code support up-front so we can hand out codes later
        // without redeploying.
        allow_promotion_codes: true,
      },
      { idempotencyKey: `creed-checkout:${user.id}:${priceId}` }
    );

    if (!session.url) {
      throw new Error("Stripe returned a session without a URL.");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error(
      "stripe_checkout_failed",
      { userId: user.id },
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Couldn't start checkout. Please try again." },
      { status: 502 }
    );
  }
}
