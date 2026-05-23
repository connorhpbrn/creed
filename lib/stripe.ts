import "server-only";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Stripe client + entitlement helpers.
//
// Everything in this module is server-only — the API key is server-side
// and writes happen via the Supabase admin client because the webhook
// runs without an authed user session.
//
// One-time payment, one product (`STRIPE_PRICE_ID`). The entitlement is
// keyed on Supabase user_id because we sign the user in BEFORE handing
// them to Stripe (auth-before-payment flow), eliminating email mismatch.

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
  // No `apiVersion` pin — let the SDK use its own default so we don't
  // have to chase Stripe's version-string churn. Account-level pinning
  // is set in the Stripe Dashboard.
  stripeClient = new Stripe(getStripeSecretKey());
  return stripeClient;
}

export function getStripePriceId(): string {
  const value = process.env.STRIPE_PRICE_ID?.trim();
  if (!value) {
    throw new Error("STRIPE_PRICE_ID is not configured.");
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
 * Caller is responsible for passing the RAW request body — Stripe's
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

export type CreedEntitlement = {
  userId: string;
  email: string;
  stripeCustomerId: string | null;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  stripePriceId: string;
  amountCents: number;
  currency: string;
  status: "paid" | "refunded";
  paidAt: string;
  updatedAt: string;
};

type EntitlementRow = {
  user_id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_price_id: string;
  amount_cents: number;
  currency: string;
  status: "paid" | "refunded";
  paid_at: string;
  updated_at: string;
};

function rowToEntitlement(row: EntitlementRow): CreedEntitlement {
  return {
    userId: row.user_id,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripePriceId: row.stripe_price_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Cheap "is the current user paid?" check used by server route guards
 * (e.g. (creed-app)/layout, /onboarding, /). Reads via the caller's
 * already-authed Supabase client + the "Read own entitlement" RLS
 * policy — no admin client / token decrypt needed.
 *
 * Returns `true` only when a `status = 'paid'` row exists for the user.
 * Accepts `unknown` to match how the rest of the backend treats Supabase
 * clients (the generated row types don't yet know about
 * `creed_entitlements`).
 */
export async function hasPaidEntitlement(
  client: unknown,
  userId: string
): Promise<boolean> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_entitlements")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle()) as { data: { status?: string } | null; error: { message: string } | null };

  if (error) {
    // Treat unknown as not paid so a transient DB blip doesn't grant
    // access to an unpaid user. The next request will re-check.
    return false;
  }
  return data?.status === "paid";
}

/**
 * Read the entitlement row for a user via the admin client. Returns
 * `null` if no row exists. Callers that already have a user-scoped
 * Supabase client may prefer to read via RLS instead — the
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
 * driven) paths — whichever lands first writes, the second is a no-op
 * because the row PK is `user_id` and `stripe_session_id` is UNIQUE.
 *
 * Returns the resulting entitlement, or `null` if the session payload
 * is missing the fields we need to attribute the payment to a user.
 */
export async function upsertEntitlementFromSession(
  session: Stripe.Checkout.Session
): Promise<CreedEntitlement | null> {
  const userId = session.metadata?.supabaseUserId;
  if (!userId || typeof userId !== "string") {
    return null;
  }
  if (session.payment_status !== "paid") {
    return null;
  }

  const priceId = getStripePriceId();
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  // Normalise email so case differences between Stripe and Google don't
  // accidentally surface elsewhere. The auth path is keyed by user_id so
  // this string is only ever displayed / used for auditing.
  const rawEmail = session.customer_details?.email ?? session.customer_email ?? "";
  const email = rawEmail.trim().toLowerCase();
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? "usd").toLowerCase();
  const now = new Date().toISOString();

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = (await admin
    .from("creed_entitlements")
    .upsert(
      {
        user_id: userId,
        email,
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_price_id: priceId,
        amount_cents: amount,
        currency,
        status: "paid",
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
