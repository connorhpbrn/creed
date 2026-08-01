import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { requireApiAuth } from "@/lib/api-auth";
import { entitlementGrantsAccess } from "@/lib/stripe";
import { getCreditsState, getCompanyCreditsState } from "@/lib/ai/credits";
import { listUserCreeds } from "@/lib/creed-membership";
import { getCompanyBilling } from "@/lib/company-billing";
import { deriveCompanyAccessState } from "@/lib/creed-permissions";

// Every plan the caller owns, for the billing dialog: their one personal plan
// plus each company Creed they OWN (billing is owner-only). Each card carries
// the plan shape + its credit balance, so the dialog shows what you own and the
// one-time / monthly credits it grants - regardless of which Creed is active.

export const runtime = "nodejs";

type PlanCredits = {
  balanceUsd: number;
  allowanceUsd: number;
  allowanceResets: boolean;
  purchasedUsd: number;
};

type PlanCard = {
  scope: "personal" | "company";
  creedId: string | null;
  name: string;
  paid: boolean;
  billingMode: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  credits: PlanCredits | null;
};

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const plans: PlanCard[] = [];

  // Personal plan (everyone in the app has a personal Creed).
  try {
    const { data: ent } = (await auth.supabase
      .from("creed_entitlements")
      .select("plan, billing_mode, status, current_period_end, cancel_at_period_end, billing_interval")
      .eq("user_id", auth.user.id)
      .maybeSingle()) as {
      data: {
        plan?: string;
        billing_mode?: string;
        status?: string;
        current_period_end?: string | null;
        cancel_at_period_end?: boolean;
        billing_interval?: string | null;
      } | null;
    };
    const credits = await getCreditsState(auth.supabase, auth.user.id).catch(() => null);
    plans.push({
      scope: "personal",
      creedId: null,
      name: "Personal",
      paid: ent ? entitlementGrantsAccess(ent) : false,
      billingMode: ent?.billing_mode ?? null,
      interval: ent?.billing_interval ?? null,
      status: ent?.status ?? null,
      currentPeriodEnd: ent?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(ent?.cancel_at_period_end),
      credits: credits
        ? {
            balanceUsd: credits.balanceUsd,
            allowanceUsd: credits.allowanceUsd,
            allowanceResets: credits.allowanceResets,
            purchasedUsd: credits.purchasedUsd,
          }
        : null,
    });
  } catch {
    // Non-fatal: still return company plans below.
  }

  // Each company the caller OWNS.
  const creeds = await listUserCreeds(auth.supabase, auth.user.id);
  const ownedCompanies = creeds.filter((c) => c.type === "company" && c.role === "owner");
  const companyPlans = await Promise.all(ownedCompanies.map(async (creed): Promise<PlanCard | null> => {
    const [billing, credits] = await Promise.all([
      getCompanyBilling(creed.id),
      getCompanyCreditsState(creed.id).catch(() => null),
    ]);
    if (!billing) return null;
    return {
      scope: "company",
      creedId: creed.id,
      name: creed.name,
      paid: deriveCompanyAccessState(billing.status) !== "frozen",
      billingMode: billing.billing_mode ?? null,
      interval: billing.billing_interval ?? null,
      status: billing.status ?? null,
      currentPeriodEnd: billing.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(billing.cancel_at_period_end),
      credits: credits
        ? {
            balanceUsd: credits.balanceUsd,
            allowanceUsd: credits.allowanceUsd,
            allowanceResets: credits.allowanceResets,
            purchasedUsd: credits.purchasedUsd,
          }
        : null,
    };
  }));
  plans.push(...companyPlans.filter((plan) => plan !== null));

  return NextResponse.json({ plans }, { headers: NO_STORE_HEADERS });
}
