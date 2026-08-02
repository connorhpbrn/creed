import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getEntitlement, getStripeClient } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/supabase/env";
import { resolveOwnedCompanyCreedId } from "@/lib/creed-context";
import { getCompanyBilling } from "@/lib/company-billing";
import { log } from "@/lib/observability";

// Auth-required. Opens the Stripe Customer Portal so a subscriber can update
// their card, view invoices, or cancel. Requires a Stripe customer on the
// entitlement row - lifetime-only owners with no customer (or unpaid users)
// get a clear 400 rather than a broken portal link.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;

  try {
    // When the active Creed is a company this user owns, manage the COMPANY
    // subscription's customer; otherwise the personal entitlement's.
    const companyId = await resolveOwnedCompanyCreedId(auth.supabase, user);
    let customerId: string | null = null;
    if (companyId) {
      const billing = await getCompanyBilling(companyId);
      customerId = billing?.stripe_customer_id ?? null;
    } else {
      const entitlement = await getEntitlement(user.id);
      customerId = entitlement?.stripeCustomerId ?? null;
    }
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
