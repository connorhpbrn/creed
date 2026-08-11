import "server-only";
// Two-bucket usage credits: the money-out + money-in logic between the AI
// features and the creed_credits wallet. Each Creed has a PURCHASED bucket
// (top-ups, roll over, lasting). Cloud Bonus lives in the GRANTED bucket on
// one assigned home Creed (resets each period). Spend on a Creed debits that
// Creed's wallet: Bonus only when it is the home, otherwise purchased only.
// BYOK stays untouched. All balance mutations go through the three service-role
// RPCs (grant_allowance / debit_credits / credit_topup); this module owns the
// only calls to them.
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import {
  CREDIT_MARKUP,
  GRANT_MONTHLY_USD,
  GRANT_YEARLY_USD,
  monthlyAllowancePeriodKey,
} from "@creed/cloud/lib/ai/credit-config";
import { getAiFeatureModel } from "@/lib/ai/feature-models";
import type { AiFeature } from "@/lib/ai/features";
import { readAiSettings, type AiMode } from "@/lib/ai/persistence";
import { decryptSecret } from "@creed/integrations/secret-crypto";
import {
  resolveCreditsHomeCreedId,
} from "@creed/cloud/lib/ai/credit-home";
import { resolveActiveCreed } from "@/lib/creed-context";
import { log } from "@/lib/observability";
import type { User } from "@supabase/supabase-js";

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
  reservationId?: string;
};

const MAX_RESERVATION_MICRO: Record<AiFeature, number> = {
  tab: 100_000,
  panel: 2_000_000,
  analysis: 2_000_000,
};

async function reserveCredits(params: {
  creedId: string;
  feature: AiFeature;
  modelId: string;
  spentBy: string | null;
  purchasedOnly?: boolean;
}): Promise<string> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("reserve_credits", {
    p_creed_id: params.creedId,
    p_amount_micro: MAX_RESERVATION_MICRO[params.feature],
    p_feature: params.feature,
    p_model_id: params.modelId,
    p_spent_by: params.spentBy,
    p_purchased_only: Boolean(params.purchasedOnly),
  });
  if (error || typeof data !== "string") {
    if (/insufficient_credits/i.test(error?.message ?? "")) throw new Error("Out of credits");
    throw new Error("Credits are temporarily unavailable");
  }
  return data;
}

export async function cancelCreditReservation(reservationId: string | undefined): Promise<void> {
  if (!reservationId) return;
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { error } = await admin.rpc("cancel_credit_reservation", { p_reservation_id: reservationId });
  if (error) log.error("credit_reservation_cancel_failed", { reservationId, message: error.message });
}

export type PublicCreditTransaction = {
  id: string;
  type: "topup" | "debit" | "grant" | "monthly-spend";
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
  // Whether the allowance refreshes with the Cloud subscription.
  allowanceResets: boolean;
  // Total credits spent over all time (sum of debits) on the viewer Creed.
  allTimeSpentUsd: number;
  // Creed that holds Cloud Bonus, and whether the viewer is currently on it.
  creditsHomeCreedId: string | null;
  isCreditsHome: boolean;
  transactions: PublicCreditTransaction[];
};

type Allowance = { micro: number; periodKey: string };

type CreditRow = {
  id: string;
  type: "topup" | "debit" | "grant";
  amount_micro_usd: number | string;
  balance_after_micro_usd: number | string;
  feature: string | null;
  model_id: string | null;
  bucket: string | null;
  grant_period_key?: string | null;
  created_at: string;
};

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

function monthKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dedupeTopupRows(rows: CreditRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.type !== "topup") return false;

    const key = [
      row.amount_micro_usd,
      row.balance_after_micro_usd,
      row.bucket,
      monthKey(row.created_at),
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// View history is purchases only. Daily spend lives on the Model usage chart;
// Cloud/bonus grants follow credits home and stay out of this Creed ledger.
function buildDisplayTransactions(
  sourceRows: CreditRow[],
): PublicCreditTransaction[] {
  return dedupeTopupRows(sourceRows)
    .map((row) => ({
      id: row.id,
      type: "topup" as const,
      amountUsd: microToUsd(Number(row.amount_micro_usd) || 0),
      balanceAfterUsd: microToUsd(Number(row.balance_after_micro_usd) || 0),
      feature: row.feature,
      modelId: row.model_id,
      bucket: row.bucket,
      createdAt: row.created_at,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// The account credit pot lives on the home Creed wallet (creed_credit_homes).
// Null when the user owns no Creed (invite-only Shared members).
async function homeCreedId(userId: string): Promise<string | null> {
  return resolveCreditsHomeCreedId(userId);
}

// Map the user's entitlement to their granted allowance + the period key that
// resets it. Reads the entitlement directly via the admin client (no dependency
// on lib/stripe, which would create an import cycle). Returns null when the plan
// grants no allowance (no row, refunded, or canceled).
async function resolveAllowance(userId: string): Promise<Allowance | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = await admin
    .from("creed_entitlements")
    .select("billing_interval, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    log.error("credit_allowance_read_failed", { userId, message: error.message });
    return null;
  }
  const row = data as
    | {
        billing_interval?: string | null;
        status?: string;
      }
    | null;
  if (!row) return null;

  // Subscription (monthly or yearly): active-ish states get the monthly drip.
  if (row.status === "active" || row.status === "trialing" || row.status === "past_due") {
    const usd = row.billing_interval === "year" ? GRANT_YEARLY_USD : GRANT_MONTHLY_USD;
    return { micro: usd * MICRO_PER_USD, periodKey: monthlyAllowancePeriodKey() };
  }
  return null;
}

// Apply the (already-resolved) allowance grant. Idempotent per period inside the
// RPC, so calling it on every AI call and settings/credits read is cheap and
// safe. Returns the post-grant combined balance (micro-USD) the RPC reports, so
// a caller can gate without a second balance read; returns null on RPC failure
// (logged, non-fatal) so the caller falls back to a direct balance read.
async function applyGrant(
  userId: string,
  allowance: Allowance,
  creedId?: string | null,
): Promise<number | null> {
  const targetCreedId = creedId ?? (await homeCreedId(userId));
  if (!targetCreedId) return null;
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("grant_allowance", {
    p_creed_id: targetCreedId,
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

async function readCreedBalanceMicro(
  creedId: string,
): Promise<{ granted: number; purchased: number; total: number }> {
  const db = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = await db
    .from("creed_credits")
    .select("granted_micro_usd, purchased_micro_usd")
    .eq("creed_id", creedId)
    .maybeSingle();
  if (error) {
    log.error("credit_balance_read_failed", { creedId, message: error.message });
    throw new Error("Credits are temporarily unavailable");
  }
  const row = data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const granted = row ? Number(row.granted_micro_usd) || 0 : 0;
  const purchased = row ? Number(row.purchased_micro_usd) || 0 : 0;
  return { granted, purchased, total: granted + purchased };
}

/** Spendable micro on a Creed: Bonus+purchased on home, purchased-only elsewhere. */
function spendableMicro(
  balance: { granted: number; purchased: number; total: number },
  isHome: boolean,
): number {
  return isHome ? balance.total : Math.max(0, balance.purchased);
}

async function resolveSpendCreedId(
  client: unknown,
  userId: string,
): Promise<string | null> {
  try {
    const active = await resolveActiveCreed(client, { id: userId } as User);
    if (active?.creedId) return active.creedId;
  } catch (error) {
    log.warn("credits_active_creed_resolve_failed", {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return homeCreedId(userId);
}

// Pick the key + model for an AI call based on the user's ai_mode. The model is
// server-selected per feature (hidden from the user) in BOTH modes. BYOK reuses
// the user's own key at no markup. Credits validates the platform key, refreshes
// Bonus on the home Creed, then gates on spendable balance for the active Creed.
export async function resolveAiCredential(
  client: unknown,
  userId: string,
  feature: AiFeature
): Promise<ResolvedAiCredential> {
  const row = await readAiSettings(client, userId);
  const mode: AiMode = row?.ai_mode === "byok" ? "byok" : "credits";
  const modelId = getAiFeatureModel(feature);

  if (mode === "byok") {
    const encryptedKey = row?.encrypted_api_key;
    if (!encryptedKey || row?.key_status !== "valid") {
      throw new Error("Add an OpenRouter key in Settings");
    }
    return { apiKey: decryptSecret(encryptedKey), modelId, mode: "byok" };
  }

  const apiKey = getOpenRouterPlatformKey();
  const allowance = await resolveAllowance(userId);
  if (!allowance) {
    throw new Error("Out of credits");
  }

  const homeId = await homeCreedId(userId);
  const spendCreedId = await resolveSpendCreedId(client, userId);
  if (!spendCreedId) {
    throw new Error("Out of credits");
  }
  await applyGrant(userId, allowance, homeId).catch(() => null);

  const balance = await readCreedBalanceMicro(spendCreedId);
  const spendable = spendableMicro(balance, spendCreedId === homeId);
  if (spendable <= 0) {
    throw new Error("Out of credits");
  }

  const reservationId = await reserveCredits({
    creedId: spendCreedId,
    feature,
    modelId,
    spentBy: userId,
    purchasedOnly: spendCreedId !== homeId,
  });
  return { apiKey, modelId, mode: "credits", reservationId };
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
  reservationId,
  creedId,
}: {
  userId: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
  reservationId?: string;
  creedId?: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  const chargedMicroUsd = Math.max(
    MIN_DEBIT_MICRO,
    Math.ceil(costUsd * CREDIT_MARKUP * MICRO_PER_USD)
  );
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const homeId = await homeCreedId(userId);
  const spendCreedId = creedId?.trim() || homeId;
  if (!spendCreedId) return null;
  const purchasedOnly = spendCreedId !== homeId;
  const { data, error } = reservationId
    ? await admin.rpc("settle_credit_reservation", { p_reservation_id: reservationId, p_actual_micro: chargedMicroUsd })
    : await admin.rpc("debit_credits", {
        p_creed_id: spendCreedId,
        p_amount_micro: chargedMicroUsd,
        p_feature: feature,
        p_model_id: modelId,
        p_spent_by: userId,
        p_purchased_only: purchasedOnly,
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
  // debit_credits / settle return the combined post-debit balance in micro-USD.
  const balanceMicro = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return {
    chargedMicroUsd,
    balanceUsd: Number.isFinite(balanceMicro) ? balanceMicro / MICRO_PER_USD : 0,
  };
}

// Shared settings reads the owner's credits for the Shared Creed on screen.
// `creedId` is both the viewer Creed and the spend Creed for lasting balance.
export async function getSharedCreditsState(
  creedId: string,
  ownerUserId: string,
): Promise<CreditsState> {
  return getCreditsState(getSupabaseAdminClient(), ownerUserId, creedId);
}

// ── Shared credits ─────────────────────────────────────────────────────────
// Shared AI in credits mode spends that Shared Creed's wallet. Cloud Bonus is
// only available when this Shared Creed is the owner's assigned home. BYOK
// still uses the Shared key.

type SharedAiSettingsRow = { ai_mode?: string; encrypted_api_key?: string | null; key_status?: string };

async function sharedOwnerUserId(creedId: string): Promise<string | null> {
  const adminDb = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = (await adminDb
    .from("creeds")
    .select("owner_user_id")
    .eq("id", creedId)
    .maybeSingle()) as { data: { owner_user_id?: string } | null };
  return data?.owner_user_id ?? null;
}

// Resolve the AI key + model for a shared AI call. Owner-set BYOK runs on the
// shared key at no markup; otherwise credits gate on this Shared Creed's pot.
export async function resolveSharedAiCredential(
  creedId: string,
  feature: AiFeature,
  spentBy: string,
): Promise<ResolvedAiCredential> {
  const adminDb = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const modelId = getAiFeatureModel(feature);
  const { data } = await adminDb
    .from("creed_ai_settings")
    .select("ai_mode, encrypted_api_key, key_status")
    .eq("creed_id", creedId)
    .maybeSingle();
  const settings = data as SharedAiSettingsRow | null;

  if (settings?.ai_mode === "byok") {
    if (!settings.encrypted_api_key || settings.key_status !== "valid") {
      throw new Error("Ask your owner to add a shared OpenRouter key");
    }
    return { apiKey: decryptSecret(settings.encrypted_api_key), modelId, mode: "byok" };
  }

  const ownerId = await sharedOwnerUserId(creedId);
  if (!ownerId) throw new Error("Out of credits");
  // Account Cloud/bonus credits belong to the owner. Members use Shared BYOK.
  if (spentBy !== ownerId) {
    throw new Error(
      "Only the owner can use credits here. Ask them to add a shared OpenRouter key.",
    );
  }

  const apiKey = getOpenRouterPlatformKey();
  const allowance = await resolveAllowance(ownerId);
  if (!allowance) {
    throw new Error("Out of credits");
  }
  const homeId = await homeCreedId(ownerId);
  if (!homeId) {
    throw new Error("Out of credits");
  }
  await applyGrant(ownerId, allowance, homeId).catch(() => null);

  const balance = await readCreedBalanceMicro(creedId);
  const spendable = spendableMicro(balance, creedId === homeId);
  if (spendable <= 0) {
    throw new Error("Out of credits");
  }

  const reservationId = await reserveCredits({
    creedId,
    feature,
    modelId,
    spentBy,
    purchasedOnly: creedId !== homeId,
  });
  return { apiKey, modelId, mode: "credits", reservationId };
}

// Deduct a shared AI call from this Shared Creed's wallet. Non-fatal on failure.
export async function deductSharedCredits({
  creedId,
  spentBy,
  costUsd,
  feature,
  modelId,
  reservationId,
}: {
  creedId: string;
  spentBy: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
  reservationId?: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  const chargedMicroUsd = Math.max(MIN_DEBIT_MICRO, Math.ceil(costUsd * CREDIT_MARKUP * MICRO_PER_USD));
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const ownerId = await sharedOwnerUserId(creedId);
  const homeId = ownerId ? await homeCreedId(ownerId) : null;
  const purchasedOnly = Boolean(homeId) && creedId !== homeId;
  const { data, error } = reservationId
    ? await admin.rpc("settle_credit_reservation", { p_reservation_id: reservationId, p_actual_micro: chargedMicroUsd })
    : await admin.rpc("debit_credits", {
        p_creed_id: creedId,
        p_amount_micro: chargedMicroUsd,
        p_feature: feature,
        p_model_id: modelId,
        p_spent_by: spentBy,
        p_purchased_only: purchasedOnly,
      });
  if (error) {
    log.error("shared_credit_debit_failed_after_spend", { creedId, micro: chargedMicroUsd, feature, message: error.message });
    return null;
  }
  const balanceMicro = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return { chargedMicroUsd, balanceUsd: Number.isFinite(balanceMicro) ? balanceMicro / MICRO_PER_USD : 0 };
}

// Idempotent money-in (top-up). Lands in the PURCHASED bucket on the target
// Creed (lasting credit balance). Defaults to home when no creed is provided.
export async function creditTopup({
  userId,
  amountMicro,
  paymentIntentId,
  creedId,
}: {
  userId: string;
  amountMicro: number;
  paymentIntentId: string;
  creedId?: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  let targetCreedId = creedId?.trim() || "";
  if (targetCreedId) {
    const ownerId = await sharedOwnerUserId(targetCreedId);
    if (ownerId !== userId) {
      log.warn("credit_topup_creed_not_owned", { userId, creedId: targetCreedId });
      targetCreedId = "";
    }
  }
  if (!targetCreedId) {
    targetCreedId = (await homeCreedId(userId)) ?? "";
  }
  if (!targetCreedId) {
    log.error("credit_topup_no_home_creed", { userId, paymentIntentId });
    throw new Error("Could not credit balance");
  }
  const { error } = await admin.rpc("credit_topup", {
    p_creed_id: targetCreedId,
    p_amount_micro: amountMicro,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    log.error("credit_topup_failed", { userId, creedId: targetCreedId, paymentIntentId, message: error.message });
    throw new Error("Could not credit balance");
  }
}

// Shared top-up: land a paid amount in that Creed's purchased bucket.
export async function creedCreditTopup({
  creedId,
  amountMicro,
  paymentIntentId,
}: {
  creedId: string;
  amountMicro: number;
  paymentIntentId: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { error } = await admin.rpc("credit_topup", {
    p_creed_id: creedId,
    p_amount_micro: amountMicro,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    log.error("shared_credit_topup_failed", { creedId, paymentIntentId, message: error.message });
    throw new Error("Could not credit balance");
  }
}

export async function refundCreditTopup(paymentIntentId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("refund_credit_topup", {
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    log.error("credit_topup_refund_failed", { paymentIntentId, message: error.message });
    throw new Error("Could not refund credit balance");
  }
  return data === true;
}

// Balance + recent ledger for Model usage. Purchased is always the viewer
// Creed's lasting balance. Granted / Bonus figures come from the home Creed.
export async function getCreditsState(
  client: unknown,
  userId: string,
  viewerCreedId?: string,
): Promise<CreditsState> {
  const allowance = await resolveAllowance(userId);
  const homeId = await homeCreedId(userId);
  const viewerId = viewerCreedId?.trim() || homeId;
  // Invite-only Shared members own no Creed and have no Bonus home. Return an
  // empty ledger rather than throwing into Account / settings reads.
  if (!viewerId) {
    return {
      grantedMicroUsd: 0,
      purchasedMicroUsd: 0,
      balanceMicroUsd: 0,
      grantedUsd: 0,
      purchasedUsd: 0,
      balanceUsd: 0,
      allowanceUsd: allowance ? microToUsd(allowance.micro) : 0,
      allowanceResets: Boolean(allowance),
      allTimeSpentUsd: 0,
      creditsHomeCreedId: null,
      isCreditsHome: false,
      transactions: [],
    };
  }
  const isHome = viewerId === homeId;

  if (allowance) {
    await applyGrant(userId, allowance, homeId).catch(() => null);
  }

  const db = client as SupabaseLikeClient;
  const adminDb = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const balanceClient = adminDb;

  const [viewerBalanceResult, homeBalanceResult, moneyInResult, spendResult] =
    await Promise.all([
      balanceClient
        .from("creed_credits")
        .select("granted_micro_usd, purchased_micro_usd")
        .eq("creed_id", viewerId)
        .maybeSingle(),
      isHome || !homeId
        ? Promise.resolve({ data: null, error: null })
        : balanceClient
            .from("creed_credits")
            .select("granted_micro_usd, purchased_micro_usd")
            .eq("creed_id", homeId)
            .maybeSingle(),
      db
        .from("creed_credit_transactions")
        .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, grant_period_key, created_at")
        .eq("creed_id", viewerId)
        .eq("type", "topup")
        .order("created_at", { ascending: false })
        .limit(50),
      (getSupabaseAdminClient() as unknown as RpcClient).rpc("credit_spend_total", {
        p_creed_id: viewerId,
      }),
    ]);

  if (viewerBalanceResult.error) {
    log.error("credits_state_balance_failed", {
      userId,
      message: viewerBalanceResult.error.message,
    });
    throw new Error("Could not load credits");
  }
  if (!isHome && homeBalanceResult.error) {
    log.error("credits_state_home_balance_failed", {
      userId,
      message: homeBalanceResult.error.message,
    });
    throw new Error("Could not load credits");
  }
  if (moneyInResult.error) {
    log.error("credits_state_history_failed", {
      userId,
      message: moneyInResult.error.message,
    });
    throw new Error("Could not load credits");
  }

  const viewerRow = viewerBalanceResult.data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const homeRow = (
    isHome ? viewerBalanceResult.data : homeBalanceResult.data
  ) as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;

  const purchasedMicroUsd = viewerRow ? Number(viewerRow.purchased_micro_usd) || 0 : 0;
  const grantedMicroUsd = homeRow ? Number(homeRow.granted_micro_usd) || 0 : 0;
  const balanceMicroUsd = isHome
    ? grantedMicroUsd + purchasedMicroUsd
    : purchasedMicroUsd;

  const transactions = buildDisplayTransactions(
    (moneyInResult.data as CreditRow[] | null) ?? [],
  );

  const allTimeSpentUsd = spendResult.error ? 0 : microToUsd(Number(spendResult.data) || 0);

  return {
    grantedMicroUsd,
    purchasedMicroUsd,
    balanceMicroUsd,
    grantedUsd: microToUsd(grantedMicroUsd),
    purchasedUsd: microToUsd(purchasedMicroUsd),
    balanceUsd: microToUsd(balanceMicroUsd),
    allowanceUsd: allowance ? microToUsd(allowance.micro) : 0,
    allowanceResets: Boolean(allowance),
    allTimeSpentUsd,
    creditsHomeCreedId: homeId,
    isCreditsHome: isHome,
    transactions,
  };
}
