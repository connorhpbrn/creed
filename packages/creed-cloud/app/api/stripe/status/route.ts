import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { entitlementGrantsAccess } from "@creed/cloud/lib/stripe";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { hasPrivateCloudAccess } from "@creed/cloud/lib/cloud-access";

// Billing status for the current user.
//
// Reads via the user's session client + the "Read own entitlement" RLS
// policy, so this stays cheap (no admin client, no token decrypts) and
// safe (a user can only see their own row). Unauthed callers get a
// no-access payload without a 401 - the marketing chrome polls this on
// every signed-in render and we don't want a wall of red 401s when
// someone signs out.
//
// `paid` is the "has Cloud access" boolean that the marketing header and
// onboarding gate read.
// The richer fields drive the billing dialog and the pricing-card CTAs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `Cache-Control: private, no-store` because the payload differs per user
// and a stale value (an unpaid user seeing a previous paid user's `true`)
// would unlock the app for someone who hasn't bought it.

type StatusPayload = {
  paid: boolean;
  plan: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  personal?: PlanStatus;
};

type PlanStatus = {
  paid: boolean;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const NO_ACCESS: StatusPayload = {
  paid: false,
  plan: null,
  interval: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  personal: undefined,
};

function legacyPayloadFromPlan(
  plan: string | null,
  status: PlanStatus | null,
): Omit<StatusPayload, "personal"> {
  return {
    paid: Boolean(status?.paid),
    plan,
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

  if (hasPrivateCloudAccess(user.email)) {
    const personal: PlanStatus = {
      paid: true,
      interval: null,
      status: "development",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    return NextResponse.json(
      { ...legacyPayloadFromPlan("cloud", personal), personal },
      { headers: NO_STORE_HEADERS },
    );
  }

  // Access is decided from subscription status, never the stored price id, so
  // re-pointing a Stripe price does not affect subscribers. billing_interval
  // arrived in a later migration; read the full row when the column exists and
  // fall back to the core columns if it does not, so a deploy gap (code ahead of
  // the DB) can never strip a paying user's ownership out of the UI.
  type EntitlementRead = {
    status?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    billing_interval?: string | null;
  };
  const CORE_COLUMNS = "status, current_period_end, cancel_at_period_end";

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
        interval: row.billing_interval ?? null,
        status: row.status ?? null,
        currentPeriodEnd: row.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      }
    : undefined;

  const payload: StatusPayload = {
    ...legacyPayloadFromPlan(row ? "cloud" : null, personal ?? null),
    personal,
  };

  return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
}
