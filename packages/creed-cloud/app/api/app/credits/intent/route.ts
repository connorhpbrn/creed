import { NextResponse } from "next/server";
import { MAX_TOPUP_USD, MIN_TOPUP_USD } from "@creed/cloud/lib/ai/credit-config";
import { getStripeClient, getStripePublishableKey } from "@creed/cloud/lib/stripe";
import { requireApiAuth } from "@/lib/api-auth";
import {
  resolveActiveCreed,
  resolveMemberCreedById,
} from "@/lib/creed-context";
import { hasManagedBilling, hasManagedCredits } from "@creed/cloud/lib/managed-services";

// Creates a Stripe PaymentIntent for a prepaid credits top-up. The client
// confirms it with the Payment Element; the balance is credited only by the
// `payment_intent.succeeded` webhook (the source of truth), never here.
// Top-ups land on the Creed in metadata.creedId (lasting per-Creed balance).

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasManagedBilling() || !hasManagedCredits()) {
    return NextResponse.json(
      { error: "Managed credits are not available on this deployment. Use BYOK instead." },
      { status: 503 },
    );
  }
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      amountUsd?: unknown;
      creedId?: unknown;
    };
    const amountUsd =
      typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);

    if (!Number.isFinite(amountUsd) || amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD) {
      return NextResponse.json(
        { error: `Enter an amount between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}.` },
        { status: 400 }
      );
    }

    const requestedCreedId =
      typeof body.creedId === "string" ? body.creedId.trim() : "";
    const requested = requestedCreedId
      ? await resolveMemberCreedById(auth.supabase, auth.user, requestedCreedId)
      : null;
    if (requestedCreedId && !requested) {
      return NextResponse.json({ error: "Creed not found." }, { status: 403 });
    }
    if (requested && requested.role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can add credits to this Creed." },
        { status: 403 },
      );
    }

    const active = requested
      ? null
      : await resolveActiveCreed(auth.supabase, auth.user);
    const creedId = requested?.id ?? active?.creedId ?? null;
    if (!creedId) {
      return NextResponse.json({ error: "Pick a Creed first." }, { status: 400 });
    }
    if (!requested && active?.role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can add credits to this Creed." },
        { status: 403 },
      );
    }

    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountUsd * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        supabaseUserId: auth.user.id,
        type: "credits",
        product: "creed_managed_credits",
        creedId,
      },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      publishableKey: getStripePublishableKey(),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not start the payment." },
      { status: 400 }
    );
  }
}
