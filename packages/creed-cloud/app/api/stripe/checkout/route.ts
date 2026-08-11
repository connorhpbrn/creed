import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireApiAuth } from "@/lib/api-auth";
import {
  type CreedPlan,
  type PurchaseCadence,
  getEntitlement,
  getStripeClient,
  resolvePriceId,
} from "@creed/cloud/lib/stripe";
import { getSiteUrl } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";
import { hasManagedBilling } from "@creed/cloud/lib/managed-services";

// Auth-required. Creates a subscription Checkout Session for the selected
// cadence, keyed to the current Supabase user. The user id rides in both
// `client_reference_id` and `metadata.supabaseUserId` (read by the webhook +
// success-page upsert); for subscriptions it's also stamped on
// `subscription_data.metadata` so later subscription lifecycle events can be
// attributed without a session.
//
// An active subscriber manages cadence and cancellation in Stripe's portal.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePlan(value: unknown): CreedPlan | null {
  return value === undefined || value === "personal" || value === "cloud" ? "cloud" : null;
}

function parseCadence(value: unknown): PurchaseCadence {
  if (value === "yearly") return "yearly";
  return "monthly";
}

export async function POST(request: Request) {
  if (!hasManagedBilling()) {
    return NextResponse.json(
      { error: "Managed Cloud billing is not available on this deployment." },
      { status: 503 },
    );
  }
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  if (!user.email) {
    return NextResponse.json(
      { error: "Account is missing an email. Sign in again with Google." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    plan?: unknown;
    cadence?: unknown;
    returnTo?: unknown;
  };
  const plan = parsePlan(body.plan);
  const cadence = parseCadence(body.cadence);
  if (!plan) {
    return NextResponse.json({ error: "Cloud is the only managed plan." }, { status: 400 });
  }

  // Allowlisted only. Pricing buyers cancel/succeed back to pricing; the
  // onboarding funnel cancels to onboarding and succeeds into the app.
  const returnTo =
    body.returnTo === "/pricing" || body.returnTo === "pricing"
      ? "/pricing"
      : "/onboarding";
  const successNext = returnTo === "/pricing" ? "/pricing" : "/file";

  try {
    const existing = await getEntitlement(user.id);
    if (existing && ["active", "trialing", "past_due"].includes(existing.status)) {
      // Already subscribed (monthly or yearly). Switching cadence goes through
      // the Stripe billing portal, not a second checkout.
      return NextResponse.json(
        { error: "You already have an active subscription.", alreadySubscribed: true },
        { status: 409 }
      );
    }

    const stripe = getStripeClient();
    const priceId = await resolvePriceId(plan, cadence);
    const baseUrl = getSiteUrl();
    const email = user.email.trim().toLowerCase();
    const reuseCustomerId = existing?.stripeCustomerId ?? null;

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: {
        supabaseUserId: user.id,
        email,
        product: "creed_cloud",
        plan,
        cadence,
        returnTo,
      },
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(successNext)}`,
      cancel_url: `${baseUrl}${returnTo}`,
      allow_promotion_codes: true,
    };

    // Reuse the existing Stripe customer when available so checkout and the
    // billing portal stay attached to one customer.
    if (reuseCustomerId) {
      params.customer = reuseCustomerId;
    } else {
      params.customer_email = email;
    }

    params.subscription_data = {
      metadata: { supabaseUserId: user.id, plan, cadence },
    };

    // No idempotency key: a Checkout Session is just a hosted payment page,
    // not a charge, so creating an extra one is harmless - only the session
    // the user actually completes matters. A static key would be worse here:
    // Stripe caches it for 24h, so a subscriber who cancels and re-subscribes
    // the same day would be handed their old, already-completed session URL.
    // Rapid double-clicks are guarded client-side and by the active-subscription
    // check above.
    const session = await stripe.checkout.sessions.create(params);

    if (!session.url) {
      throw new Error("Stripe returned a session without a URL");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error(
      "stripe_checkout_failed",
      { userId: user.id, plan, cadence },
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Couldn't start checkout. Please try again." },
      { status: 502 }
    );
  }
}
