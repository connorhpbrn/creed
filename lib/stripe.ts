import "server-only";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { creditTopup } from "@/lib/ai/credits";
import { revokeOAuthTokensForUser } from "@/lib/oauth";
import { isChargeFullyRefunded } from "@/lib/stripe-refund";
import { log } from "@/lib/observability";

// Re-export so callers can keep importing the refund rule from the Stripe
// module surface; the implementation lives in a dependency-free file so it
// stays unit-testable (see lib/stripe-refund.ts).
export { isChargeFullyRefunded };

// Stripe client + entitlement helpers.
//
// Everything in this module is server-only - the API key is server-side
// and writes happen via the Supabase admin client because the webhook
// runs without an authed user session.
//
// Plans are billable as a subscription or a one-time lifetime purchase, with
// prices resolved by Stripe lookup key (see PRICE_LOOKUP_KEYS). The entitlement
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
  stripeClient = new Stripe(getStripeSecretKey());
  return stripeClient;
}

// Plan + billing mode model.
//
//   plan:         which tier the entitlement is for.
//   billing_mode: how it's paid - a recurring subscription, or a one-time
//                 lifetime purchase that grants permanent ownership.
//
// Company is defined here so the data model and webhook are forward-ready,
// but the pricing UI keeps Company "Coming Soon" and the checkout route
// refuses Company sessions until the Company price ids are set.
export type CreedPlan = "personal" | "company";
// The persisted billing shape (creed_entitlements.billing_mode): a recurring
// subscription, or a one-time lifetime purchase. A yearly plan is still a
// "subscription" here; monthly-vs-yearly is a separate axis (PurchaseCadence)
// that only decides which price is charged.
export type BillingMode = "subscription" | "lifetime";
// What the buyer picks at checkout. Monthly and yearly are both subscriptions
// (Stripe mode "subscription") on different recurring prices; lifetime is a
// one-time payment. This axis selects the Stripe price.
export type PurchaseCadence = "monthly" | "yearly" | "lifetime";

// Prices are referenced by Stripe lookup key, not a pinned `price_...` id.
// A lookup key is a stable, non-secret label attached to a price in the Stripe
// dashboard; resolving by key means a price can be re-pointed (Stripe prices
// are immutable, so a change = a new price) with zero code or env changes. The
// same keys resolve to the right price in test vs live, since each mode has its
// own prices carrying the same lookup keys. Company keys aren't assigned yet,
// so Company stays "Coming Soon".
const PRICE_LOOKUP_KEYS: Record<CreedPlan, Record<PurchaseCadence, string | null>> = {
  personal: {
    monthly: "creed_personal_monthly",
    yearly: "creed_personal_yearly",
    lifetime: "creed_personal_lifetime",
  },
  company: {
    monthly: null,
    yearly: null,
    lifetime: null,
  },
};

function lookupKeyFor(plan: CreedPlan, cadence: PurchaseCadence): string | null {
  return PRICE_LOOKUP_KEYS[plan][cadence];
}

// Resolved lookup_key → price_id, cached for the process lifetime. Prices are
// effectively static; a re-point in Stripe is rare and a redeploy clears this.
const priceIdCache = new Map<string, string>();

/**
 * Resolve the live Stripe price id for a (plan, cadence) pair via its lookup key.
 * Throws if the tier has no key configured or no active price carries it, so a
 * misconfigured tier fails loudly at checkout rather than charging the wrong
 * price. The lookup is cached, so steady state is one Stripe call per key.
 */
export async function resolvePriceId(plan: CreedPlan, cadence: PurchaseCadence): Promise<string> {
  const key = lookupKeyFor(plan, cadence);
  if (!key) {
    throw new Error(`No Stripe price configured for ${plan}/${cadence}.`);
  }

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

/** True when a plan's core lookup keys are configured (used to gate Company). */
export function isPlanPurchasable(plan: CreedPlan): boolean {
  return Boolean(lookupKeyFor(plan, "monthly") && lookupKeyFor(plan, "lifetime"));
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

// `paid`/`refunded` describe a lifetime purchase; the subscription states
// mirror Stripe's. `billing_mode` disambiguates which set applies.
export type EntitlementStatus =
  | "paid"
  | "refunded"
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
  email: string;
  plan: CreedPlan;
  billingMode: BillingMode;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  stripePriceId: string;
  amountCents: number;
  currency: string;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: string | null;
  paidAt: string;
  updatedAt: string;
};

type EntitlementRow = {
  user_id: string;
  email: string;
  plan: CreedPlan;
  billing_mode: BillingMode;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_price_id: string;
  amount_cents: number;
  currency: string;
  status: EntitlementStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  billing_interval: string | null;
  paid_at: string;
  updated_at: string;
};

function rowToEntitlement(row: EntitlementRow): CreedEntitlement {
  return {
    userId: row.user_id,
    email: row.email,
    plan: row.plan,
    billingMode: row.billing_mode,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripePriceId: row.stripe_price_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    billingInterval: row.billing_interval,
    paidAt: row.paid_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Does an entitlement row grant app access right now?
 *
 *   lifetime     → owned forever once `status = 'paid'`.
 *   subscription → access while the subscription is active/trialing/past_due.
 *
 * Lifetime ownership is terminal and beats any subscription state, so a user
 * who upgraded keeps access even if their old subscription row data lingers.
 */
export function entitlementGrantsAccess(row: {
  billing_mode?: string | null;
  status?: string | null;
}): boolean {
  if (row.billing_mode === "lifetime") {
    return row.status === "paid";
  }
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
export async function hasActiveEntitlement(
  client: unknown,
  userId: string
): Promise<boolean> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_entitlements")
    .select("billing_mode, status")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: { billing_mode?: string; status?: string } | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    // Treat unknown as no access so a transient DB blip doesn't grant
    // entry to an unentitled user. The next request will re-check.
    return false;
  }
  return entitlementGrantsAccess(data);
}

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

// The recurring interval of a subscription's price ("month" | "year"). This is
// the only thing that distinguishes a monthly plan from a yearly one, since
// both persist as billing_mode "subscription". Returns null when there is no
// recurring price (a lifetime purchase) or the shape is unexpected.
function readInterval(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as {
    items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
  };
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

/**
 * Idempotent upsert from a completed Checkout Session. Handles BOTH billing
 * modes:
 *
 *   payment (lifetime)   → status 'paid', billing_mode 'lifetime'. If the
 *                          user had an active subscription, it's canceled
 *                          (you can't own it and keep paying a subscription).
 *   subscription         → status mirrors the live Stripe subscription,
 *                          billing_mode 'subscription'.
 *
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

  const mode: BillingMode = session.mode === "subscription" ? "subscription" : "lifetime";

  // A subscription session is "done" at payment_status 'paid' (first invoice
  // settled). A one-time session is the same. Anything else isn't entitled.
  if (session.payment_status !== "paid") {
    return null;
  }

  const plan: CreedPlan = session.metadata?.plan === "company" ? "company" : "personal";
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  // Normalise email so case differences between Stripe and Google don't
  // accidentally surface elsewhere. The auth path is keyed by user_id so
  // this string is only ever displayed / used for auditing.
  const rawEmail = session.customer_details?.email ?? session.customer_email ?? "";
  const email = rawEmail.trim().toLowerCase();
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? "usd").toLowerCase();
  const now = new Date().toISOString();

  let status: EntitlementStatus = "paid";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  let billingInterval: string | null = null;
  // A subscription is monthly or yearly; both persist as billing_mode
  // "subscription", so the cadence (and thus the price to store) is derived
  // from the live subscription's recurring interval. Lifetime stays "lifetime".
  let cadence: PurchaseCadence = "lifetime";

  if (mode === "subscription" && subscriptionId) {
    // Pull the live subscription so the row reflects real status + renewal,
    // not just "a session completed".
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    status = mapStripeSubStatus(subscription.status);
    currentPeriodEnd = readPeriodEnd(subscription);
    cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    billingInterval = readInterval(subscription);
    cadence = billingInterval === "year" ? "yearly" : "monthly";
  }

  // Resolve the price id for the row from the cadence, so a yearly purchase
  // stores the yearly price id rather than the monthly one.
  const priceId = await resolvePriceId(plan, cadence);

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = (await admin
    .from("creed_entitlements")
    .upsert(
      {
        user_id: userId,
        email,
        plan,
        billing_mode: mode,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_price_id: priceId,
        amount_cents: amount,
        currency,
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

  // Ownership is terminal: buying lifetime cancels any active subscription so
  // the user is never charged again. Best-effort - a failure here must not
  // unwind the entitlement they just paid for.
  if (mode === "lifetime" && customerId) {
    await cancelActiveSubscriptionsForCustomer(customerId).catch((cancelError) => {
      log.warn("stripe_cancel_subscription_after_lifetime_failed", {
        userId,
        customerId,
        error: cancelError instanceof Error ? cancelError.message : String(cancelError),
      });
    });
  }

  return rowToEntitlement(data);
}

/**
 * Cancel every still-live subscription on a customer. Called when a user
 * upgrades to lifetime. Idempotent: subscriptions already ending are skipped.
 */
export async function cancelActiveSubscriptionsForCustomer(customerId: string): Promise<void> {
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
 *   1. App access - flip the entitlement to `refunded`. That value falls
 *      outside both the lifetime `paid` check and the active-subscription set,
 *      so entitlementGrantsAccess() returns false on the next per-request read
 *      and every server route guard (layout, onboarding, /authorize) locks.
 *   2. Future billing - a refund does NOT cancel a subscription in Stripe, so a
 *      still-live subscriber would be charged again next period. Cancel it.
 *   3. The live MCP session - /mcp authorises on OAuth token validity, not
 *      entitlement, so revoking the row alone leaves read/propose access alive
 *      until the refresh token lapses (up to 30 days). Revoke the tokens too.
 *
 * Only acts on a full refund (see isChargeFullyRefunded). Idempotent: a row
 * already `refunded` is a no-op, so Stripe retries and multi-step refund
 * sequences don't thrash. Returns true when a row was revoked, else false.
 */
export async function revokeEntitlementForRefund(
  charge: Stripe.Charge
): Promise<boolean> {
  if (!isChargeFullyRefunded(charge)) {
    return false;
  }

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  // Resolve the owning row. Prefer the exact payment_intent - it's the charge
  // that paid for a lifetime purchase (and a subscription's first invoice).
  // Fall back to the customer, which covers subscription renewal charges whose
  // PI was never stored on the row.
  let row: EntitlementRow | null = null;
  if (paymentIntentId) {
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row && customerId) {
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row) {
    return false;
  }
  if (row.status === "refunded") {
    // Already revoked (Stripe retry, or a second refund event) - nothing to do.
    return false;
  }

  const { user_id: userId, billing_mode: billingMode } = row;

  // 1. Revoke app access.
  const { error } = await admin
    .from("creed_entitlements")
    .update({
      status: "refunded",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }

  // 2. Stop future billing. Best-effort - a failure here must not unwind the
  //    revoke above (the syncSubscriptionFromStripe guard keeps `refunded`
  //    intact even when the cancel's `subscription.deleted` lands later).
  if (billingMode === "subscription" && customerId) {
    await cancelActiveSubscriptionsForCustomer(customerId).catch((cancelError) => {
      log.warn("stripe_cancel_subscription_after_refund_failed", {
        userId,
        customerId,
        error: cancelError instanceof Error ? cancelError.message : String(cancelError),
      });
    });
  }

  // 3. Cut the MCP/OAuth session now. revokeOAuthTokensForUser flips revoked_at
  //    on every token pair, which both rejects the live access token and blocks
  //    refresh - so access doesn't linger for the token's remaining TTL.
  //    Best-effort: the entitlement is already revoked; the web app is locked
  //    regardless, and a transient failure here can be retried by Stripe (we
  //    rethrow nothing, so the webhook still 200s).
  await revokeOAuthTokensForUser(userId).catch((revokeError) => {
    log.warn("oauth_revoke_after_refund_failed", {
      userId,
      error: revokeError instanceof Error ? revokeError.message : String(revokeError),
    });
  });

  return true;
}

/**
 * Keep an entitlement in sync with a Stripe subscription lifecycle event
 * (`customer.subscription.updated` / `.deleted`). Looks the user up via the
 * subscription metadata we stamped at checkout, falling back to the customer
 * id on the existing row.
 *
 * Guard: a lifetime owner is never downgraded by a subscription event. After
 * an upgrade, Stripe still emits a `.deleted` for the canceled subscription;
 * applying it would wrongly revoke a paid-for-life user.
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
    const { data } = (await admin
      .from("creed_entitlements")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .maybeSingle()) as { data: EntitlementRow | null };
    row = data;
  }
  if (!row) {
    return false;
  }
  if (row.billing_mode === "lifetime") {
    // Owned outright - ignore subscription churn entirely.
    return false;
  }
  if (row.status === "refunded") {
    // A refund is terminal until a fresh purchase re-creates the row. Don't let
    // a post-refund `subscription.deleted` (often from our own cancel in
    // revokeEntitlementForRefund) rewrite 'refunded' to 'canceled'.
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
 * fields we need. The one-time lifetime Checkout emits its own
 * `payment_intent.succeeded`, which lands here too and must be skipped - the
 * `type === 'credits'` guard
 * does that (the Checkout PI carries no such metadata).
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
  await creditTopup({
    userId,
    amountMicro: amountReceived * 10_000,
    paymentIntentId: paymentIntent.id,
  });
  return true;
}
