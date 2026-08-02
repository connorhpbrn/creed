import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getStripeClient } from "@/lib/stripe";
import { getCreedRole } from "@/lib/creed-membership";
import { getCompanyBilling } from "@/lib/company-billing";
import { getSiteUrl } from "@/lib/supabase/env";
import { log } from "@/lib/observability";

// POST /api/app/company/portal { creedId } - opens the Stripe Customer Portal
// for a company's billing. Owner-only (billing belongs to the owner).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as { creedId?: unknown };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const role = await getCreedRole(auth.supabase, auth.user.id, b.creedId);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner manages billing." }, { status: 403 });
  }
  try {
    const billing = await getCompanyBilling(b.creedId);
    if (!billing?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account to manage yet." }, { status: 400 });
    }
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${getSiteUrl()}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error("company_portal_failed", { creedId: b.creedId }, error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: "Couldn't open billing. Please try again." }, { status: 502 });
  }
}
