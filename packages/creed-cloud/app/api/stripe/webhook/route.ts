import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  assertWebhookSignature,
  creditBalanceFromPaymentIntent,
  getStripeWebhookSecret,
  revokeEntitlementForRefund,
  syncSubscriptionFromStripe,
  upsertEntitlementFromSession,
} from "@creed/cloud/lib/stripe";
import { log } from "@/lib/observability";
import { refundCreditTopup } from "@creed/cloud/lib/ai/credits";

// Stripe webhook receiver.
//
// Verifies the `Stripe-Signature` header against the raw body, then handles:
//   - checkout.session.completed       → grant entitlement
//   - customer.subscription.updated/.deleted → sync subscription lifecycle
//   - charge.refunded                  → revoke Cloud entitlement
//   - payment_intent.succeeded         → credit prepaid balance
// Other event types are acknowledged with 200 (so Stripe doesn't retry)
// and noted in the log.
//
// NOTE: `charge.refunded` must be enabled on the webhook endpoint in the
// Stripe Dashboard for refund revocation to fire - Stripe only delivers the
// event types the endpoint subscribes to.
//
// Idempotency: the row's PK is `user_id` and `stripe_session_id` is
// UNIQUE, so a retry from Stripe (or a race with /payment/success'
// belt-and-braces upsert) is a no-op.
//
// Raw body required: `request.text()` preserves the bytes Stripe signed.
// `request.json()` would re-serialise and invalidate the HMAC.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    log.error("stripe_webhook_secret_missing", {
      hint: "Set STRIPE_WEBHOOK_SECRET. Returning 503 so Stripe retries the event.",
    });
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = assertWebhookSignature(rawBody, signature, webhookSecret);
  } catch (error) {
    log.warn("stripe_webhook_signature_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.plan === "shared") {
        return NextResponse.json({ ok: true, applied: false });
      }

      const entitlement = await upsertEntitlementFromSession(session);
      if (!entitlement) {
        log.warn("stripe_webhook_session_skipped", {
          eventId: event.id,
          sessionId: session.id,
          reason: "missing_user_id_or_not_paid",
        });
        return NextResponse.json({ ok: true, applied: false });
      }
      // Log the user id only - `sessionId` is sensitive (paired with the
      // public success URL it can act as a soft bearer token while the
      // entitlement is being written). The event id is enough for
      // cross-referencing with Stripe Dashboard when we need it.
      log.info("stripe_webhook_entitlement_granted", {
        eventId: event.id,
        userId: entitlement.userId,
      });
      return NextResponse.json({ ok: true, applied: true });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // Keep the entitlement in step with the subscription's lifecycle:
      // renewals, cancellations, past_due, and final deletion.
      const subscription = event.data.object as Stripe.Subscription;
      const personalApplied = await syncSubscriptionFromStripe(subscription);
      log.info("stripe_webhook_subscription_synced", {
        eventId: event.id,
        type: event.type,
        subscriptionId: subscription.id,
        applied: personalApplied,
        scope: "personal",
      });
      return NextResponse.json({ ok: true, applied: personalApplied });
    }

    if (event.type === "charge.refunded") {
      // A full refund in Stripe revokes Cloud access and future billing. Partial refunds and
      // charges that map to no entitlement are no-ops inside the helper.
      const charge = event.data.object as Stripe.Charge;
      const personalRevoked = await revokeEntitlementForRefund(charge);
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
      const creditsRefunded = paymentIntentId
        ? await refundCreditTopup(paymentIntentId)
        : false;
      log.info("stripe_webhook_refund_processed", {
        eventId: event.id,
        chargeId: charge.id,
        revoked: personalRevoked,
        creditsRefunded,
        scope: "personal",
      });
      return NextResponse.json({ ok: true, applied: personalRevoked || creditsRefunded });
    }

    if (event.type === "payment_intent.succeeded") {
      // Prepaid credits top-up. Non-credit payment intents are acknowledged
      // without crediting.
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const credited = await creditBalanceFromPaymentIntent(paymentIntent);
      if (!credited) {
        log.info("stripe_webhook_payment_intent_skipped", {
          eventId: event.id,
          paymentIntentId: paymentIntent.id,
        });
        return NextResponse.json({ ok: true, applied: false });
      }
      log.info("stripe_webhook_credits_topped_up", {
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
      });
      return NextResponse.json({ ok: true, applied: true });
    }

    // Acknowledge everything else without action. Returning 200 stops
    // Stripe from retrying events we don't currently handle.
    log.info("stripe_webhook_ignored_event", { eventId: event.id, type: event.type });
    return NextResponse.json({ ok: true, applied: false });
  } catch (error) {
    log.error(
      "stripe_webhook_handler_failed",
      { eventId: event.id, type: event.type },
      error instanceof Error ? error : new Error(String(error))
    );
    // 5xx tells Stripe to retry the event with backoff.
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
