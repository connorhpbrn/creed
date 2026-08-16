import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  assertWebhookSignature,
  creditBalanceFromPaymentIntent,
  getStripeClient,
  getStripeWebhookSecret,
  revokeEntitlementForRefund,
  syncSubscriptionFromStripe,
  upsertEntitlementFromSession,
} from "@creed/cloud/lib/stripe";
import { log } from "@/lib/observability";
import { refundCreditTopup } from "@creed/cloud/lib/ai/credits";
import {
  disputeSponsorPayment,
  failSponsorPayment,
  recordSponsorPayment,
  refundSponsorPayment,
} from "@creed/cloud/lib/sponsors";

// Stripe signs the original bytes, so this route must read the body as text.
// Persistent Stripe identifiers and atomic sponsor facts make every handler
// safe to retry, including when lifecycle events arrive out of order.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sponsorPaymentIntentFromCharge(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  return paymentIntentId
    ? getStripeClient().paymentIntents.retrieve(paymentIntentId)
    : null;
}

async function chargeFromRefund(refund: Stripe.Refund) {
  const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  return chargeId ? getStripeClient().charges.retrieve(chargeId) : null;
}

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
      const sponsorIntent = await sponsorPaymentIntentFromCharge(charge);
      const sponsorRefunded = sponsorIntent
        ? await refundSponsorPayment(sponsorIntent, charge.amount_refunded, event.created)
        : false;
      log.info("stripe_webhook_refund_processed", {
        eventId: event.id,
        chargeId: charge.id,
        revoked: personalRevoked,
        creditsRefunded,
        sponsorRefunded,
        scope: "personal",
      });
      return NextResponse.json({
        ok: true,
        applied: personalRevoked || creditsRefunded || sponsorRefunded,
      });
    }

    if (event.type === "payment_intent.succeeded") {
      // PaymentIntent metadata separates credit and sponsor writes so other
      // Stripe payments are acknowledged without changing either balance.
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const credited = await creditBalanceFromPaymentIntent(paymentIntent);
      const sponsored = await recordSponsorPayment(paymentIntent, event.created);
      if (!credited && !sponsored) {
        log.info("stripe_webhook_payment_intent_skipped", {
          eventId: event.id,
          paymentIntentId: paymentIntent.id,
        });
        return NextResponse.json({ ok: true, applied: false });
      }
      log.info("stripe_webhook_payment_intent_applied", {
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
        credited,
        sponsored,
      });
      return NextResponse.json({ ok: true, applied: credited || sponsored });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const applied = await failSponsorPayment(paymentIntent, event.created);
      return NextResponse.json({ ok: true, applied });
    }

    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed" ||
      event.type === "charge.dispute.funds_reinstated" ||
      event.type === "charge.dispute.funds_withdrawn"
    ) {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const charge = await getStripeClient().charges.retrieve(chargeId);
      const paymentIntent = await sponsorPaymentIntentFromCharge(charge);
      const applied = paymentIntent
        ? await disputeSponsorPayment(paymentIntent, dispute.status, event.created)
        : false;
      log.info("stripe_webhook_sponsor_dispute_processed", {
        eventId: event.id,
        disputeId: dispute.id,
        status: dispute.status,
        applied,
      });
      return NextResponse.json({ ok: true, applied });
    }

    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      const refund = event.data.object as Stripe.Refund;
      const charge = await chargeFromRefund(refund);
      const paymentIntent = charge ? await sponsorPaymentIntentFromCharge(charge) : null;
      const applied = charge && paymentIntent
        ? await refundSponsorPayment(paymentIntent, charge.amount_refunded, event.created)
        : false;
      log.info("stripe_webhook_sponsor_refund_synced", {
        eventId: event.id,
        refundId: refund.id,
        refundStatus: refund.status,
        applied,
      });
      return NextResponse.json({ ok: true, applied });
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
