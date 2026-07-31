import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import {
  getStripeClient,
  cancelActiveSubscriptionsForCustomer,
  resolveSeatPriceId,
} from "@/lib/stripe";
import { isChargeFullyRefunded } from "@/lib/stripe-refund";
import { log } from "@/lib/observability";
import {
  COMPANY_GRANT_MONTHLY_USD,
  COMPANY_GRANT_LIFETIME_USD,
  monthlyAllowancePeriodKey,
} from "@/lib/ai/credit-config";

// Company billing provisioning + reads.
//
// A company Checkout Session (metadata.plan = "company") provisions a company
// Creed instead of writing the personal creed_entitlements row: a creeds row
// (type company, onboarding_stage 'questions'), the buyer's owner membership,
// a creed_company_billing row, and the initial usage grant. Everything is keyed
// by creed_id and idempotent on stripe_session_id, so the webhook and the
// success-page verify path can both run it safely.
//
// The credit grant uses the creed-keyed grant_allowance RPC (Company Batch B).
// Creating the Creed + membership + billing row works on Batch A alone; the
// grant lands once Batch B is deployed alongside this code.

// Allowance amounts live in credit-config (shared with the grant path in
// lib/ai/credits) so provisioning and metering can never disagree.
const MICRO_PER_USD = 1_000_000;

type CompanyBillingRow = {
  creed_id: string;
  owner_user_id: string;
  stripe_customer_id: string | null;
  stripe_session_id: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  billing_mode: "subscription" | "lifetime";
  billing_interval: "month" | "year" | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  seats_included: number;
  extra_seats: number;
};

function mapStripeSubStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    default:
      return "canceled";
  }
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function readPeriodEnd(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  return unixToIso(sub.current_period_end) ?? unixToIso(sub.items?.data?.[0]?.current_period_end);
}

function readInterval(subscription: Stripe.Subscription): "month" | "year" | null {
  const sub = subscription as unknown as {
    items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
  };
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

/** Does the user already own a company Creed? Used to gate a second purchase. */
export async function userOwnsCompany(userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = (await admin
    .from("creeds")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("type", "company")
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };
  return Boolean(data);
}

/**
 * Idempotent company provisioning from a completed Checkout Session. Returns the
 * provisioned company Creed id, or null when the session cannot be attributed /
 * is not a paid company session.
 */
export async function provisionCompanyFromSession(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  if (session.metadata?.plan !== "company") return null;
  if (session.payment_status !== "paid") return null;
  const userId = session.metadata?.supabaseUserId;
  if (!userId || typeof userId !== "string") return null;

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  // Re-run the idempotent provisioning steps on webhook retries. In particular,
  // do not return early for an existing billing row: the previous attempt may
  // have failed while granting the initial AI allowance.

  const mode: "subscription" | "lifetime" =
    session.mode === "subscription" ? "subscription" : "lifetime";
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  // The one-time (lifetime) charge's PaymentIntent, so charge.refunded can match
  // this company later. Subscriptions bill per-invoice, so their session PI is
  // less useful; matching there falls back to the customer.
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? "usd").toLowerCase();
  const now = new Date();

  let status = "paid";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  let billingInterval: "month" | "year" | null = null;

  if (mode === "subscription" && subscriptionId) {
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    status = mapStripeSubStatus(subscription.status);
    currentPeriodEnd = readPeriodEnd(subscription);
    cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    billingInterval = readInterval(subscription);
  }

  // Reuse an in-flight company shell for this owner if one exists (e.g. a retry
  // before the billing row was written), else create the Creed.
  let creedId: string;
  const { data: shell } = (await admin
    .from("creeds")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("type", "company")
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };

  if (shell) {
    creedId = shell.id;
  } else {
    const { data: created, error: createError } = (await admin
      .from("creeds")
      .insert({ type: "company", name: "Your company", owner_user_id: userId, onboarding_stage: "questions" })
      .select("id")
      .single()) as { data: { id: string } | null; error: { message: string; code?: string } | null };
    if (createError?.code === "23505") {
      const { data: concurrentShell } = (await admin
        .from("creeds")
        .select("id")
        .eq("owner_user_id", userId)
        .eq("type", "company")
        .single()) as { data: { id: string } | null };
      if (!concurrentShell) throw new Error("Could not resolve the company Creed.");
      creedId = concurrentShell.id;
    } else if (createError || !created) {
      throw new Error(createError?.message ?? "Could not create the company Creed.");
    } else {
      creedId = created.id;
    }
  }

  // Owner membership (idempotent via the (creed_id, user_id) PK). This and the
  // billing row below are load-bearing: they run after payment succeeded, so a
  // silent failure would leave a paying customer with no company access and no
  // way to recover. Throw so the webhook 500s and Stripe retries.
  const { error: memberError } = await admin.from("creed_members").upsert(
    { creed_id: creedId, user_id: userId, role: "owner" },
    { onConflict: "creed_id,user_id" }
  );
  if (memberError) {
    throw new Error(memberError.message ?? "Could not create owner membership.");
  }

  // Billing row (idempotent on the creed_id PK).
  const { error: billingError } = await admin.from("creed_company_billing").upsert(
    {
      creed_id: creedId,
      owner_user_id: userId,
      stripe_customer_id: customerId,
      stripe_session_id: session.id,
      stripe_subscription_id: subscriptionId,
      stripe_payment_intent_id: paymentIntentId,
      billing_mode: mode,
      billing_interval: billingInterval,
      status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      amount_cents: amount,
      currency,
      paid_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "creed_id" }
  );
  if (billingError) {
    throw new Error(billingError.message ?? "Could not create company billing row.");
  }

  // Initial usage grant on the shared creed_id-keyed wallet (grant_allowance,
  // same RPC personal uses). Subscription -> $50 this month; lifetime -> one-time
  // $200 keyed to the session so it never resets. Failure is retryable through
  // Stripe because provisioning and the grant are idempotent.
  const grantMicro =
    (mode === "lifetime" ? COMPANY_GRANT_LIFETIME_USD : COMPANY_GRANT_MONTHLY_USD) *
    MICRO_PER_USD;
  const periodKey = mode === "lifetime" ? `lifetime:${session.id}` : monthlyAllowancePeriodKey(now);
  const rpc = admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
  const { error: grantError } = await rpc.rpc("grant_allowance", {
    p_creed_id: creedId,
    p_allowance_micro: grantMicro,
    p_period_key: periodKey,
  });
  if (grantError) {
    log.error("company_initial_grant_failed", {
      creedId,
      error: grantError instanceof Error ? grantError.message : String(grantError),
    });
    throw new Error("Could not grant the company AI allowance.");
  }

  return creedId;
}

/**
 * Keep a company billing row in step with a Stripe subscription lifecycle event
 * (updated / deleted): status, renewal, cancel flag, interval. Matches by
 * stripe_subscription_id, so a personal subscription (no company row) is a
 * no-op. Returns true when a company row was updated.
 */
export async function syncCompanySubscriptionFromStripe(
  subscription: Stripe.Subscription
): Promise<boolean> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data: row } = (await admin
    .from("creed_company_billing")
    .select("creed_id, billing_mode, status")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle()) as { data: { creed_id: string; billing_mode: string; status: string } | null };
  if (!row) return false;
  if (row.billing_mode === "lifetime" || row.status === "refunded") return false;

  // Reconcile extra_seats from the seat line item so a seat change made in the
  // Stripe portal (add or remove) reflects in capacity. Guarded: if seat prices
  // aren't configured, leave extra_seats untouched rather than break the sync.
  let seatUpdate: { extra_seats: number } = {} as { extra_seats: number };
  try {
    const cadence = readInterval(subscription) === "year" ? "yearly" : "monthly";
    const seatPriceId = await resolveSeatPriceId(cadence);
    const seatItem = subscription.items.data.find((item) => item.price.id === seatPriceId);
    seatUpdate = { extra_seats: seatItem?.quantity ?? 0 };
  } catch {
    seatUpdate = {} as { extra_seats: number };
  }

  const { error } = await admin
    .from("creed_company_billing")
    .update({
      status: mapStripeSubStatus(subscription.status),
      current_period_end: readPeriodEnd(subscription),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      billing_interval: readInterval(subscription),
      ...seatUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq("creed_id", row.creed_id);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Freeze a company on a full refund, mirroring revokeEntitlementForRefund for
 * personal. Matches the charge to a company by its paying PaymentIntent (the
 * lifetime one-time charge) or the customer (subscription renewals), sets the
 * billing row to 'refunded' (which deriveCompanyAccessState reads as frozen:
 * read-only, no data deleted), and cancels any active subscription. Idempotent:
 * a second refund event or a Stripe retry no-ops. Returns true when a company
 * was frozen. Only acts on full refunds; partial refunds are a no-op.
 */
export async function revokeCompanyForRefund(charge: Stripe.Charge): Promise<boolean> {
  if (!isChargeFullyRefunded(charge)) return false;

  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  const customerId =
    typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  let row: CompanyBillingRow | null = null;
  if (paymentIntentId) {
    const { data } = (await admin
      .from("creed_company_billing")
      .select("*")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle()) as { data: CompanyBillingRow | null };
    row = data;
  }
  if (!row && customerId) {
    // One company per owner today, but a customer could in theory back more than
    // one billing row; take the most recent rather than erroring on .maybeSingle.
    const { data } = (await admin
      .from("creed_company_billing")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: CompanyBillingRow | null };
    row = data;
  }
  if (!row) return false;
  if (row.status === "refunded") return false;

  const { error } = await admin
    .from("creed_company_billing")
    .update({ status: "refunded", cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("creed_id", row.creed_id);
  if (error) throw new Error(error.message);

  if (row.billing_mode === "subscription" && customerId) {
    await cancelActiveSubscriptionsForCustomer(customerId).catch((cancelError) => {
      log.warn("company_cancel_subscription_after_refund_failed", {
        creedId: row?.creed_id,
        error: cancelError instanceof Error ? cancelError.message : String(cancelError),
      });
    });
  }

  return true;
}

export type SeatPurchaseResult =
  | { ok: true; kind: "applied"; extraSeats: number }
  | { ok: true; kind: "redirect"; url: string }
  | { ok: false; error: string; status: number };

/**
 * Buy `quantity` extra seats for a company. Owner-gated by the caller.
 *
 * Subscription (monthly/yearly): raise the recurring seat line item's quantity
 * and invoice the proration immediately (proration_behavior "always_invoice"),
 * so the card on file is charged now. extra_seats is set to the new seat count
 * (Stripe is the source of truth), so the capacity reflects at once.
 *
 * Lifetime: seats are a one-time charge, so return a Checkout URL; the webhook
 * applies the seats on completion (applyLifetimeSeatPurchase), idempotently.
 */
export async function buyCompanySeats(params: {
  creedId: string;
  quantity: number;
  baseUrl: string;
}): Promise<SeatPurchaseResult> {
  const { creedId, quantity } = params;
  const billing = await getCompanyBilling(creedId);
  if (!billing) {
    return { ok: false, error: "No billing account for this company yet.", status: 400 };
  }
  if (billing.status === "refunded") {
    return { ok: false, error: "This company's billing is inactive.", status: 400 };
  }
  const stripe = getStripeClient();

  if (billing.billing_mode === "lifetime") {
    if (!billing.stripe_customer_id) {
      return { ok: false, error: "No billing account to charge.", status: 400 };
    }
    const seatPriceId = await resolveSeatPriceId("lifetime");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: billing.stripe_customer_id,
      line_items: [{ price: seatPriceId, quantity }],
      metadata: { kind: "company_seats", creedId, seats: String(quantity) },
      success_url: `${params.baseUrl}/settings?seats=added`,
      cancel_url: `${params.baseUrl}/settings`,
    });
    if (!session.url) {
      return { ok: false, error: "Could not start the seat purchase.", status: 502 };
    }
    return { ok: true, kind: "redirect", url: session.url };
  }

  // Subscription: raise the seat line item quantity, charging the proration now.
  if (!billing.stripe_subscription_id) {
    return { ok: false, error: "No active subscription to add seats to.", status: 400 };
  }
  const cadence = billing.billing_interval === "year" ? "yearly" : "monthly";
  const seatPriceId = await resolveSeatPriceId(cadence);
  const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
  const seatItem = subscription.items.data.find((item) => item.price.id === seatPriceId);
  const newSeatQuantity = (seatItem?.quantity ?? 0) + quantity;

  // Stripe owns the authoritative quantity. Concurrent dashboard purchases can
  // race on this read-modify-write, but the next subscription webhook always
  // reconciles `extra_seats` from Stripe, so the local row is never authoritative.

  await stripe.subscriptions.update(subscription.id, {
    items: [
      seatItem
        ? { id: seatItem.id, quantity: newSeatQuantity }
        : { price: seatPriceId, quantity: newSeatQuantity },
    ],
    proration_behavior: "always_invoice",
  });

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { error } = await admin
    .from("creed_company_billing")
    .update({ extra_seats: newSeatQuantity, updated_at: new Date().toISOString() })
    .eq("creed_id", creedId);
  if (error) throw new Error(error.message);

  return { ok: true, kind: "applied", extraSeats: newSeatQuantity };
}

/**
 * Set the absolute number of EXTRA seats on a subscription company (owner-gated
 * by the caller). Lifetime seats are purchased capacity and can't be removed, so
 * this is subscription-only. Guards against dropping capacity below current
 * usage (members + pending invites). Proration is credited at the next cycle
 * (proration_behavior "create_prorations") rather than refunded mid-cycle. When
 * extra seats reach zero the recurring seat line item is removed entirely.
 */
export async function setCompanySeatQuantity(params: {
  creedId: string;
  extraSeats: number;
}): Promise<SeatPurchaseResult> {
  const { creedId, extraSeats } = params;
  if (!Number.isInteger(extraSeats) || extraSeats < 0) {
    return { ok: false, error: "Choose a valid seat count.", status: 400 };
  }
  const billing = await getCompanyBilling(creedId);
  if (!billing) {
    return { ok: false, error: "No billing account for this company yet.", status: 400 };
  }
  if (billing.billing_mode === "lifetime") {
    return {
      ok: false,
      error: "Lifetime seats are purchased capacity and can't be removed.",
      status: 400,
    };
  }
  if (billing.status === "refunded") {
    return { ok: false, error: "This company's billing is inactive.", status: 400 };
  }
  if (!billing.stripe_subscription_id) {
    return { ok: false, error: "No active subscription to change.", status: 400 };
  }

  // Never drop capacity below what's in use. Capacity model: removing a member
  // keeps the seat open, so the owner must remove members/invites BEFORE the
  // seat. The floor is (used - included), never below zero. Dynamic import of
  // getSeatUsage avoids a module cycle with company-invites.
  const { getSeatUsage } = await import("@/lib/company-invites");
  const usage = await getSeatUsage(creedId);
  const minExtra = Math.max(0, usage.used - billing.seats_included);
  if (extraSeats < minExtra) {
    return {
      ok: false,
      error: "Remove members or revoke invites before reducing seats.",
      status: 400,
    };
  }

  const cadence = billing.billing_interval === "year" ? "yearly" : "monthly";
  const seatPriceId = await resolveSeatPriceId(cadence);
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
  const seatItem = subscription.items.data.find((item) => item.price.id === seatPriceId);

  if (extraSeats === 0) {
    // Drop the seat line item outright when it exists; otherwise nothing to do.
    if (seatItem) {
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: seatItem.id, deleted: true }],
        proration_behavior: "create_prorations",
      });
    }
  } else {
    await stripe.subscriptions.update(subscription.id, {
      items: [
        seatItem
          ? { id: seatItem.id, quantity: extraSeats }
          : { price: seatPriceId, quantity: extraSeats },
      ],
      proration_behavior: "create_prorations",
    });
  }

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { error } = await admin
    .from("creed_company_billing")
    .update({ extra_seats: extraSeats, updated_at: new Date().toISOString() })
    .eq("creed_id", creedId);
  if (error) throw new Error(error.message);

  return { ok: true, kind: "applied", extraSeats };
}

/**
 * Apply a completed lifetime seat Checkout to the company's capacity. Idempotent:
 * the seat purchase is recorded in creed_seat_purchases keyed on the session id,
 * so a webhook retry (or the success-page belt-and-braces path) can't double-add.
 * Returns true when seats were newly applied.
 */
export async function applyLifetimeSeatPurchase(
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  if (session.metadata?.kind !== "company_seats") return false;
  if (session.payment_status !== "paid") return false;
  const creedId = session.metadata?.creedId;
  const seats = Number(session.metadata?.seats);
  if (!creedId || !Number.isInteger(seats) || seats <= 0) return false;

  const rpc = getSupabaseAdminClient() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpc.rpc("apply_company_lifetime_seat_purchase", {
    p_stripe_session_id: session.id,
    p_creed_id: creedId,
    p_seats: seats,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Read a company billing row via the admin client (owner-only under RLS). */
export async function getCompanyBilling(creedId: string): Promise<CompanyBillingRow | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = (await admin
    .from("creed_company_billing")
    .select("*")
    .eq("creed_id", creedId)
    .maybeSingle()) as { data: CompanyBillingRow | null };
  return data;
}

export type { CompanyBillingRow };
