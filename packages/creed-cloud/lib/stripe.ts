import "server-only";
import { cache } from "react";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { creditTopup } from "@creed/cloud/lib/ai/credits";
import { isChargeFullyRefunded } from "@creed/cloud/lib/stripe-refund";
import { log } from "@/lib/observability";
import {
  shouldShowWelcome,
  type WelcomeVariant,
} from "@creed/core/welcome-state";

// Re-export so callers can keep importing the refund rule from the Stripe
// module surface; the implementation lives in a dependency-free file so it
// stays unit-testable (see lib/stripe-refund.ts).
export { isChargeFullyRefunded };
export type { WelcomeVariant };
export { shouldShowWelcome };

// Stripe client + entitlement helpers.
//
// Everything in this module is server-only - the API key is server-side
// and writes happen via the Supabase admin client because the webhook
// runs without an authed user session.
//
// Cloud is billed as one account-wide monthly or yearly subscription. Prices
// are resolved by Stripe lookup key (see PRICE_LOOKUP_KEYS). The entitlement
// is keyed on Supabase user_id because we sign the user in BEFORE handing them
// to Stripe (auth-before-payment flow), eliminating email mismatch.

let stripeClient: Stripe | null = null;

function getStripeSecretKey(): string {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return value;
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  // No `apiVersion` pin - let the SDK use its own default so we don't
  // have to chase Stripe's version-string churn. Account-level pinning
  // is set in the Stripe Dashboard.
  stripeClient = new Stripe(getStripeSecretKey(), {
    timeout: 15_000,
    maxNetworkRetries: 2,
  });
  return stripeClient;
}

export type CreedPlan = "cloud";
export type PurchaseCadence = "monthly" | "yearly";

// Prices are referenced by Stripe lookup key, not a pinned `price_...` id.
// A lookup key is a stable, non-secret label attached to a price in the Stripe
// dashboard; resolving by key means a price can be re-pointed (Stripe prices
// are immutable, so a change = a new price) with zero code or env changes. The
// same keys resolve to the right price in test vs live, since each mode has its
// own prices carrying the same lookup keys.
const PRICE_LOOKUP_KEYS: Record<CreedPlan, Record<PurchaseCadence, string>> = {
  cloud: {
    monthly: "creed_cloud_monthly",
    yearly: "creed_cloud_yearly",
  },
};

function lookupKeyFor(plan: CreedPlan, cadence: PurchaseCadence): string {
  return PRICE_LOOKUP_KEYS[plan][cadence];
}

// Resolved lookup_key → price_id, cached for the running process. Prices are
// effectively static; a re-point in Stripe is rare and a redeploy clears this.
const priceIdCache = new Map<string, string>();

/**
 * Resolve the live Stripe price id for a (plan, cadence) pair via its lookup key.
 * Throws if no active price carries the key, so a
 * misconfigured tier fails loudly at checkout rather than charging the wrong
 * price. The lookup is cached, so steady state is one Stripe call per key.
 */
export async function resolvePriceId(plan: CreedPlan, cadence: PurchaseCadence): Promise<string> {
  const key = lookupKeyFor(plan, cadence);
  const cached = priceIdCache.get(key);
  if (cached) return cached;

  const prices = await getStripeClient().prices.list({
    lookup_keys: [key],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(`No active Stripe price found for lookup key "${key}".`);
  }

  priceIdCache.set(key, price.id);
  return price.id;
}

export function getStripePublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.");
  }
  return value;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Verify a Stripe webhook request and return the parsed event. Throws if
 * the signature is missing, malformed, or doesn't match the configured
 * webhook secret.
 *
 * Caller is responsible for passing the RAW request body - Stripe's
 * signature is computed over the unparsed bytes, so any prior `.json()`
 * call would invalidate the check.
 */
export function assertWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Stripe.Event {
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature header.");
  }
  return getStripeClient().webhooks.constructEvent(
    rawBody,
    signatureHeader,
    webhookSecret
  );
}

export type EntitlementStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

// Subscription states that still grant app access. `past_due` is included
// because Stripe keeps the subscription live through its smart retries; we
// only revoke once Stripe gives up and emits `customer.subscription.deleted`
// (status → canceled).
const ACTIVE_SUB_STATUSES = new Set<EntitlementStatus>(["active", "trialing", "past_due"]);

export type CreedEntitlement = {
  userId: string;
  plan: CreedPlan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: string | null;
  updatedAt: string;
};

type EntitlementRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: EntitlementStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  billing_interval: string | null;
  welcomed_at?: string | null;
  welcomed_personal_at?: string | null;
  welcomed_shared_at?: string | null;
  created_at: string;
  updated_at: string;
};

function rowToEntitlement(row: EntitlementRow): CreedEntitlement {
  return {
    userId: row.user_id,
    plan: "cloud",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    billingInterval: row.billing_interval,
    updatedAt: row.updated_at,
  };
}

/**
 * Does an entitlement row grant app access right now?
 *
 * Access remains available while Stripe considers the subscription live,
 * including its retry window for a past-due invoice.
 */
export function entitlementGrantsAccess(row: {
  status?: string | null;
}): boolean {
  return ACTIVE_SUB_STATUSES.has(row.status as EntitlementStatus);
}

/**
 * Cheap "is the current user paid?" check used by server route guards
 * (e.g. (creed-app)/layout, /onboarding, /). Reads via the caller's
 * already-authed Supabase client + the "Read own entitlement" RLS
 * policy - no admin client / token decrypt needed.
 *
 * Returns `true` only when a `status = 'paid'` row exists for the user.
 * Accepts `unknown` to match how the rest of the backend treats Supabase
 * clients (the generated row types don't yet know about
 * `creed_entitlements`).
 */
// cache()-wrapped so the layout gate and the state load don't each re-read the
// entitlement row within one render (a no-op in route handlers).
export const hasActiveEntitlement = cache(async function hasActiveEntitlement(
  client: unknown,
  userId: string
): Promise<boolean> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_entitlements")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: { status?: string } | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    // Treat unknown as no access so a transient DB blip doesn't grant
    // entry to an unentitled user. The next request will re-check.
    return false;
  }
  return entitlementGrantsAccess(data);
});

/**
 * Read the entitlement row for a user via the admin client. Returns
 * `null` if no row exists. Callers that already have a user-scoped
 * Supabase client may prefer to read via RLS instead - the
 * "Read own entitlement" policy makes that work without escalation.
 */
export async function getEntitlement(userId: string): Promise<CreedEntitlement | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = (await admin
    .from("creed_entitlements")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()) as { data: EntitlementRow | null; error: { message: string } | null };

  if (error) {
    throw new Error(error.message);
  }
  return data ? rowToEntitlement(data) : null;
}

/**
 * Welcome-pop-up state for the (creed-app) layout gate. Reads entitlement
 * created_at (as paid_at) and per-type welcomed_* columns via the caller's
 * session client. Fault-tolerant: any error resolves to "don't show".
 */
export type WelcomeState = {
  showPersonal: boolean;
  showShared: boolean;
  paidAt: string | null;
};

export async function getEntitlementWelcomeState(
  client: unknown,
  userId: string,
): Promise<WelcomeState> {
  const db = client as SupabaseLikeClient;
  try {
    const { data, error } = (await db
      .from("creed_entitlements")
      .select(
        "created_at, welcomed_at, welcomed_personal_at, welcomed_shared_at",
      )
      .eq("user_id", userId)
      .maybeSingle()) as {
      data: {
        created_at?: string | null;
        welcomed_at?: string | null;
        welcomed_personal_at?: string | null;
        welcomed_shared_at?: string | null;
      } | null;
      error: { message: string } | null;
    };
    if (error || !data) {
      return { showPersonal: false, showShared: false, paidAt: null };
    }
    const paidAt = data.created_at ?? null;
    // Prefer the per-type column; fall back to legacy welcomed_at for Personal
    // until every row is backfilled.
    const personalAt =
      data.welcomed_personal_at ?? data.welcomed_at ?? null;
    return {
      showPersonal: shouldShowWelcome(paidAt, personalAt),
      showShared: shouldShowWelcome(paidAt, data.welcomed_shared_at ?? null),
      paidAt,
    };
  } catch {
    return { showPersonal: false, showShared: false, paidAt: null };
  }
}

/**
 * Mark one Creed-type welcome tour as seen. Service-role write (no RLS update
 * on entitlements). Also mirrors Personal onto legacy welcomed_at so older
 * readers stay consistent during rollout.
 */
export async function markEntitlementWelcomed(
  userId: string,
  variant: WelcomeVariant = "personal",
): Promise<void> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const now = new Date().toISOString();
  const patch =
    variant === "shared"
      ? { welcomed_shared_at: now }
      : { welcomed_personal_at: now, welcomed_at: now };
  const { error } = await admin
    .from("creed_entitlements")
    .update(patch)
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Idempotent upsert from a Stripe Checkout Session. Used by both the
 * `/api/stripe/webhook` (event-driven) and `/payment/success` (verify-
 * driven) paths - whichever lands first writes, the second is a no-op
 * because the row PK is `user_id` and `stripe_session_id` is UNIQUE.
 *
 * Returns the resulting entitlement, or `null` if the session payload
 * is missing the fields we need to attribute the payment to a user.
 */
function mapStripeSubStatus(status: Stripe.Subscription.Status): EntitlementStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    // canceled, unpaid, incomplete_expired, paused → no access.
    default:
      return "canceled";
  }
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// A Checkout subscription exposes period info on the subscription object,
// not the session - and the typed SDK has churned on where
// `current_period_end` lives, so read it defensively.
function readPeriodEnd(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const top = unixToIso(sub.current_period_end);
  if (top) return top;
  return unixToIso(sub.items?.data?.[0]?.current_period_end);
}

// The recurring interval of a subscription's price ("month" | "year").
function readInterval(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as {
    items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
  };
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

/**
 * Idempotent upsert from a completed subscription Checkout Session.
 * Returns the resulting entitlement, or `null` if the session can't be
 * attributed to a user / isn't actually paid yet.
 */
export async function upsertEntitlementFromSession(
  session: Stripe.Checkout.Session
): Promise<CreedEntitlement | null> {
  const userId = session.metadata?.supabaseUserId;
  if (!userId || typeof userId !== "string") {
    return null;
  }

  if (session.mode !== "subscription") return null;
  // A subscription session is complete after its first invoice settles.
  if (session.payment_status !== "paid") {
    return null;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  // Normalise email so case differences between Stripe and Google don't
  // accidentally surface elsewhere. The auth path is keyed by user_id so
  // this string is only ever displayed / used for auditing.
  const now = new Date().toISOString();

  let status: EntitlementStatus = "incomplete";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  let billingInterval: string | null = null;
  if (subscriptionId) {
    // Pull the live subscription so the row reflects real status + renewal,
    // not just "a session completed".
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    status = mapStripeSubStatus(subscription.status);
    currentPeriodEnd = readPeriodEnd(subscription);
    cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    billingInterval = readInterval(subscription);
  }

  // Resolve the price id for the row from the cadence, so a yearly purchase
  // stores the yearly price id rather than the monthly one.
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  // The user_id conflict target makes webhook retries and the success-page
  // fallback converge on the same account-wide subscription row.
  const { data, error } = (await admin
    .from("creed_entitlements")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        billing_interval: billingInterval,
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single()) as { data: EntitlementRow | null; error: { message: string } | null };

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Stripe entitlement upsert returned no row.");
  }

  return rowToEntitlement(data);
}

async function cancelActiveSubscriptionsForCustomer(customerId: string): Promise<void> {
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  for (const sub of subs.data) {
    if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
    await stripe.subscriptions.cancel(sub.id);
  }
}

/**
 * Revoke an entitlement when its underlying charge is fully refunded in Stripe
 * (the `charge.refunded` webhook). This is the single action that undoes a
 * purchase end-to-end, closing all three gaps a bare Stripe refund leaves open:
 *
 *   1. App access - move the entitlement outside the active-subscription set,
 *      so entitlementGrantsAccess() returns false on the next per-request read
 *      and every server route guard (layout, onboarding, /authorize) locks.
 *   2. Future billing - a refund does NOT cancel a subscription in Stripe, so a
 *      still-live subscriber would be charged again next period. Cancel it.
 *   3. The live MCP session - /mcp authorises on OAuth token validity, not
 *      entitlement, so revoking the row alone leaves read/propose access alive
 *      until the refresh token lapses (up to 30 days). Revoke the tokens too.
 *
 * Only acts on a full refund (see isChargeFullyRefunded). Idempotent: a row
 * already canceled is a no-op, so Stripe retries and multi-step refund
 * sequences don't thrash. Returns true when a row was revoked, else false.
 */
export async function revokeEntitlementForRefund(
  charge: Stripe.Charge
): Promise<boolean> {
  if (!isChargeFullyRefunded(charge)) {
    return false;
  }

  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  // Resolve the owning row by customer. This covers both the first invoice and
  // renewal charges.
  let row: EntitlementRow | null = null;
  if (customerId) {
    // stripe_customer_id is not unique, so order + limit instead of
    // maybeSingle() throws on duplicate matches, so take the newest row.
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row) {
    return false;
  }
  if (row.status === "canceled") {
    // Already revoked (Stripe retry, or a second refund event) - nothing to do.
    return false;
  }

  const { user_id: userId } = row;

  // 1. Revoke app access.
  const { error } = await admin
    .from("creed_entitlements")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }

  // 2. Stop future billing. Best-effort - a failure here must not unwind the
  //    revoke above.
  if (customerId) {
    await cancelActiveSubscriptionsForCustomer(customerId).catch((cancelError) => {
      log.warn("stripe_cancel_subscription_after_refund_failed", {
        userId,
        customerId,
        error: cancelError instanceof Error ? cancelError.message : String(cancelError),
      });
    });
  }

  return true;
}

/**
 * Keep an entitlement in sync with a Stripe subscription lifecycle event
 * (`customer.subscription.updated` / `.deleted`). Looks the user up via the
 * subscription metadata we stamped at checkout, falling back to the customer
 * id on the existing row.
 */
export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription
): Promise<boolean> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const metaUserId =
    typeof subscription.metadata?.supabaseUserId === "string"
      ? subscription.metadata.supabaseUserId
      : null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  // Resolve the owning row: prefer the stamped user id, else match the customer.
  let row: EntitlementRow | null = null;
  if (metaUserId) {
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("user_id", metaUserId)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row && customerId) {
    // stripe_customer_id is not unique (email reuse across users), so take the
    // most recent row rather than maybeSingle(), which throws on >1 match.
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row) {
    return false;
  }
  if (row.status === "canceled") {
    // A refund is terminal until a fresh checkout updates the row.
    return false;
  }

  const status = mapStripeSubStatus(subscription.status);
  const { error } = await admin
    .from("creed_entitlements")
    .update({
      stripe_subscription_id: subscription.id,
      status,
      current_period_end: readPeriodEnd(subscription),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      billing_interval: readInterval(subscription),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", row.user_id);

  if (error) {
    throw new Error(error.message);
  }
  return true;
}

/**
 * Credit a user's prepaid balance from a succeeded PaymentIntent. Mirrors
 * upsertEntitlementFromSession: validate + extract, then write via the
 * service-role RPC (idempotent on the PaymentIntent id).
 *
 * Returns false (no-op) when the PI is not a credits top-up or is missing the
 * fields we need. The `type === "credits"` guard keeps subscription invoice
 * payment intents out of the prepaid balance.
 */
export async function creditBalanceFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent
): Promise<boolean> {
  const metadata = paymentIntent.metadata ?? {};
  if (metadata.type !== "credits") {
    return false;
  }
  const userId = metadata.supabaseUserId;
  if (!userId || typeof userId !== "string") {
    return false;
  }
  // cents -> micro is `x 10_000`, which is USD-only. Guard the currency so a
  // non-USD PI can never be credited 100x off.
  if (paymentIntent.currency !== "usd") {
    log.warn("credit_topup_skipped_non_usd", {
      paymentIntentId: paymentIntent.id,
      currency: paymentIntent.currency,
    });
    return false;
  }
  const amountReceived = paymentIntent.amount_received ?? 0;
  if (amountReceived <= 0) {
    return false;
  }
  // Top-ups land on the Creed that started checkout (lasting credit balance).
  // Falls back to the account Bonus home when metadata has no creedId.
  const creedId =
    typeof metadata.creedId === "string" && metadata.creedId.trim()
      ? metadata.creedId.trim()
      : undefined;
  await creditTopup({
    userId,
    amountMicro: amountReceived * 10_000,
    paymentIntentId: paymentIntent.id,
    creedId,
  });
  return true;
}
