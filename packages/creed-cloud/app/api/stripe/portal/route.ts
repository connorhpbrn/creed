import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getEntitlement, getStripeClient } from "@creed/cloud/lib/stripe";
import { getSiteUrl } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";
import { hasManagedBilling } from "@creed/cloud/lib/managed-services";

// Auth-required. Opens the Stripe Customer Portal so a subscriber can update
// their card, view invoices, or cancel. Requires a Stripe customer on the
// entitlement row. Accounts without a Stripe customer get a clear 400 rather
// than a broken portal link.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!hasManagedBilling()) {
    return NextResponse.json(
      { error: "Managed Cloud billing is not available on this deployment." },
      { status: 503 },
    );
  }
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;

  try {
    const entitlement = await getEntitlement(user.id);
    const customerId = entitlement?.stripeCustomerId ?? null;
    if (!customerId) {
      return NextResponse.json(
        { error: "No billing account to manage yet." },
        { status: 400 }
      );
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getSiteUrl()}/file`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error(
      "stripe_portal_failed",
      { userId: user.id },
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Couldn't open billing. Please try again." },
      { status: 502 }
    );
  }
}
