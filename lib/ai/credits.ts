import "server-only";
// Two-bucket usage credits: the money-out + money-in logic between the AI
// features and the creed_credits wallet. Every user has one wallet row with a
// GRANTED bucket (the plan's monthly allowance, resets each period, spent first)
// and a PURCHASED bucket (top-ups, roll over, spent second). BYOK stays
// untouched: it runs on the user's own key at no markup and never touches a
// bucket. All balance mutations go through the three service-role RPCs
// (grant_allowance / debit_credits / credit_topup); this module owns the only
// calls to them.
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import {
  CREDIT_MARKUP,
  GRANT_LIFETIME_USD,
  GRANT_MONTHLY_USD,
  GRANT_YEARLY_USD,
} from "@/lib/ai/credit-config";
import { getFeatureModelId } from "@/lib/ai/model-catalog";
import type { AiFeature } from "@/lib/ai/features";
import { readAiSettings, type AiMode } from "@/lib/ai/persistence";
import { decryptSecret } from "@/lib/secret-crypto";
import { log } from "@/lib/observability";

// Floor every debit so a near-zero call still records a charge. 1000 micro = $0.001.
const MIN_DEBIT_MICRO = 1000;
const MICRO_PER_USD = 1_000_000;

type RpcClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ResolvedAiCredential = {
  apiKey: string;
  modelId: string;
  mode: AiMode;
};

export type PublicCreditTransaction = {
  id: string;
  type: "topup" | "debit" | "grant";
  amountUsd: number;
  balanceAfterUsd: number;
  feature: string | null;
  modelId: string | null;
  bucket: string | null;
  createdAt: string;
};

export type CreditsState = {
  grantedMicroUsd: number;
  purchasedMicroUsd: number;
  balanceMicroUsd: number;
  grantedUsd: number;
  purchasedUsd: number;
  balanceUsd: number;
  // This period's granted allowance size in USD (0 when the plan grants none).
  // Lets the UI compute the "80% spent" soft warning and the spent / total line.
  allowanceUsd: number;
  // Whether the allowance refreshes on a cadence (monthly/yearly) vs a one-time
  // grant (lifetime). Drives the "This month" vs "Included credits" label.
  allowanceResets: boolean;
  // Total credits spent over all time (sum of debits). Surfaced on the lifetime
  // card as an "all-time spend" figure.
  allTimeSpentUsd: number;
  transactions: PublicCreditTransaction[];
};

type Allowance = { micro: number; periodKey: string };

export function getOpenRouterPlatformKey(): string {
  const value = process.env.OPENROUTER_PLATFORM_KEY?.trim();
  if (!value) {
    // Credits-specific copy. Never surface the BYOK "paste a key" error to a
    // credits user, who has no key to paste.
    throw new Error("Credits are temporarily unavailable");
  }
  return value;
}

function microToUsd(micro: number) {
  return micro / MICRO_PER_USD;
}

// The period key for the monthly allowance reset: UTC year-month. Monthly and
// yearly plans both reset on this cadence (yearly is a monthly drip). Lifetime
// uses a fixed key so its one-time grant is issued once and never advances.
function monthlyPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Map the user's entitlement to their granted allowance + the period key that
// resets it. Reads the entitlement directly via the admin client (no dependency
// on lib/stripe, which would create an import cycle). Returns null when the plan
// grants no allowance (no row, refunded, or canceled).
async function resolveAllowance(userId: string): Promise<Allowance | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = await admin
    .from("creed_entitlements")
    .select("billing_mode, billing_interval, status, stripe_session_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    log.error("credit_allowance_read_failed", { userId, message: error.message });
    return null;
  }
  const row = data as
    | {
        billing_mode?: string;
        billing_interval?: string | null;
        status?: string;
        stripe_session_id?: string | null;
      }
    | null;
  if (!row) return null;

  if (row.billing_mode === "lifetime") {
    if (row.status !== "paid") return null;
    // One-time grant, keyed to the specific purchase (the checkout session id
    // changes on a genuine re-purchase). So a refund-then-repurchase grants the
    // welcome credit again, while repeated calls for the same purchase never do.
    return {
      micro: GRANT_LIFETIME_USD * MICRO_PER_USD,
      periodKey: `lifetime:${row.stripe_session_id ?? "grant"}`,
    };
  }

  // Subscription (monthly or yearly): active-ish states get the monthly drip.
  if (row.status === "active" || row.status === "trialing" || row.status === "past_due") {
    const usd = row.billing_interval === "year" ? GRANT_YEARLY_USD : GRANT_MONTHLY_USD;
    return { micro: usd * MICRO_PER_USD, periodKey: monthlyPeriodKey() };
  }
  return null;
}

// Apply the (already-resolved) allowance grant. Idempotent per period inside the
// RPC, so calling it on every AI call and settings/credits read is cheap and
// safe. Returns the post-grant combined balance (micro-USD) the RPC reports, so
// a caller can gate without a second balance read; returns null on RPC failure
// (logged, non-fatal) so the caller falls back to a direct balance read.
async function applyGrant(userId: string, allowance: Allowance): Promise<number | null> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("grant_allowance", {
    p_user_id: userId,
    p_allowance_micro: allowance.micro,
    p_period_key: allowance.periodKey,
  });
  if (error) {
    log.error("credit_grant_failed", { userId, message: error.message });
    return null;
  }
  const balance = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return Number.isFinite(balance) ? balance : null;
}

async function readBalanceMicro(
  client: unknown,
  userId: string
): Promise<{ granted: number; purchased: number; total: number }> {
  const db = client as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_credits")
    .select("granted_micro_usd, purchased_micro_usd")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    log.error("credit_balance_read_failed", { userId, message: error.message });
    throw new Error("Credits are temporarily unavailable");
  }
  const row = data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const granted = row ? Number(row.granted_micro_usd) || 0 : 0;
  const purchased = row ? Number(row.purchased_micro_usd) || 0 : 0;
  return { granted, purchased, total: granted + purchased };
}

// Pick the key + model for an AI call based on the user's ai_mode. The model is
// server-selected per feature (hidden from the user) in BOTH modes. BYOK reuses
// the user's own key at no markup. Credits validates the platform key, refreshes
// the monthly allowance just-in-time, then gates on a positive combined balance.
// The balance is read via the admin client so the money decision never depends
// on RLS being applied to the caller's client.
export async function resolveAiCredential(
  client: unknown,
  userId: string,
  feature: AiFeature
): Promise<ResolvedAiCredential> {
  const row = await readAiSettings(client, userId);
  const mode: AiMode = row?.ai_mode === "byok" ? "byok" : "credits";
  const modelId = getFeatureModelId(feature);

  if (mode === "byok") {
    const encryptedKey = row?.encrypted_api_key;
    if (!encryptedKey || row?.key_status !== "valid") {
      throw new Error("Add an OpenRouter key in Settings");
    }
    return { apiKey: decryptSecret(encryptedKey), modelId, mode: "byok" };
  }

  const apiKey = getOpenRouterPlatformKey();
  // No allowance means no active entitlement (refunded, canceled, lapsed, or no
  // plan). App access is already gated on the same condition; blocking here
  // closes the direct-API path so platform credits can't be spent without a live
  // plan. Purchased credits aren't lost - they become spendable again on renewal.
  const allowance = await resolveAllowance(userId);
  if (!allowance) {
    throw new Error("Out of credits");
  }
  // grant_allowance returns the post-grant combined balance, so gate on that and
  // only fall back to a direct read if the grant RPC failed.
  const totalMicro =
    (await applyGrant(userId, allowance)) ??
    (await readBalanceMicro(getSupabaseAdminClient(), userId)).total;
  if (totalMicro <= 0) {
    throw new Error("Out of credits");
  }

  return { apiKey, modelId, mode: "credits" };
}

// Deduct realCost x markup after a successful call, draining the granted bucket
// first then purchased (the RPC does the split atomically). The OpenRouter spend
// has already happened, so a failure here must NOT fail the user's request: we
// log it so the gap can be reconciled against creed_ai_usage, and return null.
export async function deductCredits({
  userId,
  costUsd,
  feature,
  modelId,
}: {
  userId: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  const chargedMicroUsd = Math.max(
    MIN_DEBIT_MICRO,
    Math.ceil(costUsd * CREDIT_MARKUP * MICRO_PER_USD)
  );
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("debit_credits", {
    p_user_id: userId,
    p_amount_micro: chargedMicroUsd,
    p_feature: feature,
    p_model_id: modelId,
  });
  if (error) {
    log.error("credit_debit_failed_after_spend", {
      userId,
      micro: chargedMicroUsd,
      feature,
      modelId,
      message: error.message,
    });
    return null;
  }
  // debit_credits returns the combined post-debit balance in micro-USD.
  const balanceMicro = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return {
    chargedMicroUsd,
    balanceUsd: Number.isFinite(balanceMicro) ? balanceMicro / MICRO_PER_USD : 0,
  };
}

// Idempotent money-in (top-up), called by the Stripe webhook + the confirm route
// after a PaymentIntent succeeds. Lands in the PURCHASED bucket; the RPC dedupes
// on the PaymentIntent id, so a Stripe redelivery is a no-op.
export async function creditTopup({
  userId,
  amountMicro,
  paymentIntentId,
}: {
  userId: string;
  amountMicro: number;
  paymentIntentId: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { error } = await admin.rpc("credit_topup", {
    p_user_id: userId,
    p_amount_micro: amountMicro,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    log.error("credit_topup_failed", { userId, paymentIntentId, message: error.message });
    throw new Error("Could not credit balance");
  }
}

// Balance (both buckets) + recent ledger for the settings card. Refreshes the
// monthly allowance first so the card reflects a new-period reset even before
// the next AI call. Reads via the caller's session client (RLS select-own).
export async function getCreditsState(client: unknown, userId: string): Promise<CreditsState> {
  // Resolve the allowance once (used both to refresh the grant and to render the
  // allowance figures below), then apply the idempotent grant so the card
  // reflects a new-period reset even before the next AI call. Non-fatal.
  const allowance = await resolveAllowance(userId);
  if (allowance) {
    await applyGrant(userId, allowance).catch(() => null);
  }

  const db = client as SupabaseLikeClient;
  const [balanceResult, txResult, spendResult] = await Promise.all([
    db
      .from("creed_credits")
      .select("granted_micro_usd, purchased_micro_usd")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("creed_credit_transactions")
      .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    // All-time spend via a security-definer RPC (PostgREST aggregates are
    // disabled on this project). Scoped to the caller by auth.uid().
    (db as unknown as RpcClient).rpc("credit_spend_total", {}),
  ]);

  if (balanceResult.error) {
    log.error("credits_state_balance_failed", { userId, message: balanceResult.error.message });
    throw new Error("Could not load credits");
  }
  if (txResult.error) {
    log.error("credits_state_history_failed", { userId, message: txResult.error.message });
    throw new Error("Could not load credits");
  }

  const balanceRow = balanceResult.data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const grantedMicroUsd = balanceRow ? Number(balanceRow.granted_micro_usd) || 0 : 0;
  const purchasedMicroUsd = balanceRow ? Number(balanceRow.purchased_micro_usd) || 0 : 0;
  const balanceMicroUsd = grantedMicroUsd + purchasedMicroUsd;

  const rows =
    (txResult.data as Array<{
      id: string;
      type: "topup" | "debit" | "grant";
      amount_micro_usd: number | string;
      balance_after_micro_usd: number | string;
      feature: string | null;
      model_id: string | null;
      bucket: string | null;
      created_at: string;
    }> | null) ?? [];

  const transactions: PublicCreditTransaction[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    amountUsd: microToUsd(Number(row.amount_micro_usd) || 0),
    balanceAfterUsd: microToUsd(Number(row.balance_after_micro_usd) || 0),
    feature: row.feature,
    modelId: row.model_id,
    bucket: row.bucket,
    createdAt: row.created_at,
  }));

  const allTimeSpentUsd = spendResult.error ? 0 : microToUsd(Number(spendResult.data) || 0);

  return {
    grantedMicroUsd,
    purchasedMicroUsd,
    balanceMicroUsd,
    grantedUsd: microToUsd(grantedMicroUsd),
    purchasedUsd: microToUsd(purchasedMicroUsd),
    balanceUsd: microToUsd(balanceMicroUsd),
    allowanceUsd: allowance ? microToUsd(allowance.micro) : 0,
    // The lifetime grant uses a "lifetime:*" period key and never resets.
    allowanceResets: allowance ? !allowance.periodKey.startsWith("lifetime") : false,
    allTimeSpentUsd,
    transactions,
  };
}
