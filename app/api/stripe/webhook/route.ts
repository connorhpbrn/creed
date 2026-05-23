import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  assertWebhookSignature,
  getStripeWebhookSecret,
  upsertEntitlementFromSession,
} from "@/lib/stripe";
import { log } from "@/lib/observability";

// Stripe webhook receiver.
//
// Verifies the `Stripe-Signature` header against the raw body, then
// handles `checkout.session.completed` by upserting the entitlement.
// Other event types are acknowledged with 200 (so Stripe doesn't retry)
// and noted in the log.
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
    // Loud log so the missing config can't hide — Stripe retries 5xx
    // responses aggressively (capped at three days), so returning 503
    // would flood our logs and Stripe's dashboard with red. Instead we
    // ack with 200 + `applied: false` and rely on this `error`-level
    // line + the success-page belt-and-braces upsert to keep the system
    // self-healing once the env var is set.
    log.error("stripe_webhook_secret_missing", {
      hint: "Set STRIPE_WEBHOOK_SECRET. The webhook is silently no-op without it.",
    });
    return NextResponse.json({ ok: true, applied: false, configured: false });
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
      const entitlement = await upsertEntitlementFromSession(session);
      if (!entitlement) {
        log.warn("stripe_webhook_session_skipped", {
          eventId: event.id,
          sessionId: session.id,
          reason: "missing_user_id_or_not_paid",
        });
        return NextResponse.json({ ok: true, applied: false });
      }
      // Log the user id only — `sessionId` is sensitive (paired with the
      // public success URL it can act as a soft bearer token while the
      // entitlement is being written). The event id is enough for
      // cross-referencing with Stripe Dashboard when we need it.
      log.info("stripe_webhook_entitlement_granted", {
        eventId: event.id,
        userId: entitlement.userId,
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
