import { NextResponse } from "next/server";
import { MAX_TOPUP_USD, MIN_TOPUP_USD } from "@/lib/ai/credit-config";
import { getStripeClient, getStripePublishableKey } from "@/lib/stripe";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveOwnedCompanyCreedId } from "@/lib/creed-context";

// Creates a Stripe PaymentIntent for a prepaid credits top-up. The client
// confirms it with the Payment Element; the balance is credited only by the
// `payment_intent.succeeded` webhook (the source of truth), never here.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as { amountUsd?: unknown };
    const amountUsd =
      typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);

    if (!Number.isFinite(amountUsd) || amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD) {
      return NextResponse.json(
        { error: `Enter an amount between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}.` },
        { status: 400 }
      );
    }

    // An owner topping up the active company Creed tags the PaymentIntent with
    // the company creed_id, so crediting lands in the pooled company balance.
    const companyId = await resolveOwnedCompanyCreedId(auth.supabase, auth.user);

    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountUsd * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        supabaseUserId: auth.user.id,
        type: "credits",
        product: companyId ? "company_credits" : "personal_credits",
        ...(companyId ? { creedId: companyId } : {}),
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
