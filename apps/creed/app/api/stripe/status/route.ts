import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { entitlementGrantsAccess } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveOwnedCompanyCreedId } from "@/lib/creed-context";
import { getCompanyBilling } from "@/lib/company-billing";
import { deriveCompanyAccessState } from "@/lib/creed-permissions";
import { hasCompanyAccess, listUserCreeds } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Billing status for the current user.
//
// Reads via the user's session client + the "Read own entitlement" RLS
// policy, so this stays cheap (no admin client, no token decrypts) and
// safe (a user can only see their own row). Unauthed callers get a
// no-access payload without a 401 - the marketing chrome polls this on
// every signed-in render and we don't want a wall of red 401s when
// someone signs out.
//
// `paid` is kept as the legacy "has app access" boolean (lifetime owned OR
// active subscription) that the marketing header + onboarding gate read.
// The richer fields drive the billing dialog and the pricing-card CTAs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `Cache-Control: private, no-store` because the payload differs per user
// and a stale value (an unpaid user seeing a previous paid user's `true`)
// would unlock the app for someone who hasn't bought it.

type StatusPayload = {
  paid: boolean;
  plan: string | null;
  billingMode: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  personal?: PlanStatus;
  companyOwner?: (PlanStatus & { creedId: string; name: string }) | null;
};

type PlanStatus = {
  paid: boolean;
  billingMode: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const NO_ACCESS: StatusPayload = {
  paid: false,
  plan: null,
  billingMode: null,
  interval: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  personal: undefined,
  companyOwner: null,
};

function legacyPayloadFromPlan(
  plan: string | null,
  status: PlanStatus | null,
): Omit<StatusPayload, "personal" | "companyOwner"> {
  return {
    paid: Boolean(status?.paid),
    plan,
    billingMode: status?.billingMode ?? null,
    interval: status?.interval ?? null,
    status: status?.status ?? null,
    currentPeriodEnd: status?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(status?.cancelAtPeriodEnd),
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(NO_ACCESS, { headers: NO_STORE_HEADERS });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(NO_ACCESS, { headers: NO_STORE_HEADERS });
  }

  // Ownership is decided from the always-present columns (billing_mode + status),
  // never the stored price id, so re-pointing a Stripe price (a new price id
  // under the same lookup key) never affects who "owns" a plan. billing_interval
  // arrived in a later migration; read the full row when the column exists and
  // fall back to the core columns if it does not, so a deploy gap (code ahead of
  // the DB) can never strip a paying user's ownership out of the UI.
  type EntitlementRead = {
    plan?: string;
    billing_mode?: string;
    status?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    billing_interval?: string | null;
  };
  const CORE_COLUMNS = "plan, billing_mode, status, current_period_end, cancel_at_period_end";

  const full = await supabase
    .from("creed_entitlements")
    .select(`${CORE_COLUMNS}, billing_interval`)
    .eq("user_id", user.id)
    .maybeSingle();

  let row: EntitlementRead | null;
  if (!full.error) {
    row = full.data as EntitlementRead | null;
  } else {
    // Most likely the billing_interval column is not present yet. Retry with
    // only the guaranteed columns so ownership still resolves.
    const core = await supabase
      .from("creed_entitlements")
      .select(CORE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    if (core.error) {
      // A genuine failure (not just a missing column). Fail closed so the UI
      // doesn't show "Owned" on a transient error.
      return NextResponse.json(NO_ACCESS, { headers: NO_STORE_HEADERS });
    }
    row = core.data as EntitlementRead | null;
  }

  const personal: PlanStatus | undefined = row
    ? {
        paid: entitlementGrantsAccess(row),
        billingMode: row.billing_mode ?? null,
        interval: row.billing_interval ?? null,
        status: row.status ?? null,
        currentPeriodEnd: row.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      }
    : undefined;

  const ownedCompany = (await listUserCreeds(supabase, user.id)).find(
    (creed) => creed.type === "company" && creed.role === "owner",
  );
  const billing = ownedCompany ? await getCompanyBilling(ownedCompany.id) : null;
  const companyOwner: (PlanStatus & { creedId: string; name: string }) | null =
    ownedCompany && billing
      ? {
          creedId: ownedCompany.id,
          name: ownedCompany.name,
          paid: deriveCompanyAccessState(billing.status) !== "frozen",
          billingMode: billing.billing_mode ?? null,
          interval: billing.billing_interval ?? null,
          status: billing.status ?? null,
          currentPeriodEnd: billing.current_period_end ?? null,
          cancelAtPeriodEnd: Boolean(billing.cancel_at_period_end),
        }
      : null;

  const activeCompanyId = await resolveOwnedCompanyCreedId(supabase, user);
  const legacyBase =
    activeCompanyId && companyOwner?.creedId === activeCompanyId
      ? legacyPayloadFromPlan("company", companyOwner)
      : legacyPayloadFromPlan(row?.plan ?? null, personal ?? null);

  const payload: StatusPayload = {
    ...legacyBase,
    personal,
    companyOwner,
  };

  // A company MEMBER (not owner) has app access through the team but no personal
  // entitlement. Keep the legacy paid flag true for shared marketing chrome and
  // app gates, but do not set companyOwner above; pricing must not show member
  // access as owned billing.
  if (!payload.paid) {
    const admin = getSupabaseAdminClient();
    if (await hasCompanyAccess(supabase, admin, user.id)) {
      return NextResponse.json(
        { ...NO_ACCESS, paid: true, plan: "company" },
        { headers: NO_STORE_HEADERS },
      );
    }
  }

  return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
}
