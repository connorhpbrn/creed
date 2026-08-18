import { NextResponse } from "next/server";
import { getCreditsState } from "@creed/cloud/lib/ai/credits";
import { creditBalanceFromPaymentIntent, getStripeClient } from "@creed/cloud/lib/stripe";
import { requireApiAuth } from "@/lib/api-auth";

// Verify a just-confirmed PaymentIntent and credit the balance immediately,
// without waiting on the webhook. The PaymentIntent is re-fetched from Stripe
// (never trusting the client beyond the id) and must be succeeded and owned by
// the caller. Crediting flows through the same idempotent credit_topup RPC the
// webhook uses, so the two race safely and never double-credit.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as { paymentIntentId?: unknown };
    const paymentIntentId =
      typeof body.paymentIntentId === "string" ? body.paymentIntentId : "";
    if (!paymentIntentId) {
      return NextResponse.json({ error: "Missing payment." }, { status: 400 });
    }

    const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata?.supabaseUserId !== auth.user.id) {
      return NextResponse.json({ error: "Payment doesn't match this account." }, { status: 400 });
    }
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Payment isn't complete yet." }, { status: 409 });
    }

    await creditBalanceFromPaymentIntent(paymentIntent);
    const toppedUpCreedId =
      typeof paymentIntent.metadata?.creedId === "string"
        ? paymentIntent.metadata.creedId.trim()
        : undefined;
    const credits = await getCreditsState(
      auth.supabase,
      auth.user.id,
      toppedUpCreedId,
    );
    return NextResponse.json({ credits });
  } catch {
    return NextResponse.json(
      { error: "Could not confirm the payment." },
      { status: 400 }
    );
  }
}
