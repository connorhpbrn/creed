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
  COMPANY_GRANT_MONTHLY_USD,
  COMPANY_GRANT_LIFETIME_USD,
  monthlyAllowancePeriodKey,
} from "@/lib/ai/credit-config";
import { getFeatureModelId } from "@/lib/ai/model-catalog";
import type { AiFeature } from "@/lib/ai/features";
import { readAiSettings, type AiMode } from "@/lib/ai/persistence";
import { decryptSecret } from "@/lib/secret-crypto";
import { getPersonalCreedId } from "@/lib/creed-membership";
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
}): Promise<string> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("reserve_credits", {
    p_creed_id: params.creedId,
    p_amount_micro: MAX_RESERVATION_MICRO[params.feature],
    p_feature: params.feature,
    p_model_id: params.modelId,
    p_spent_by: params.spentBy,
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
  // Whether the allowance refreshes on a cadence (monthly/yearly) vs a one-time
  // grant (lifetime). Drives the "This month" vs "Included credits" label.
  allowanceResets: boolean;
  // Total credits spent over all time (sum of debits). Surfaced on the lifetime
  // card as an "all-time spend" figure.
  allTimeSpentUsd: number;
  transactions: PublicCreditTransaction[];
};

type Allowance = { micro: number; periodKey: string; grantedAt?: string | null };

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

function isLifetimeAllowance(allowance: Allowance | null): allowance is Allowance {
  return Boolean(allowance?.periodKey.startsWith("lifetime"));
}

function fallbackGrantDate(rows: CreditRow[]) {
  const oldestRow = rows.reduce<string | null>((oldest, row) => {
    if (!oldest) return row.created_at;
    return Date.parse(row.created_at) < Date.parse(oldest) ? row.created_at : oldest;
  }, null);
  return oldestRow ?? new Date().toISOString();
}

function withSyntheticLifetimeGrant(
  rows: CreditRow[],
  allowance: Allowance | null,
): CreditRow[] {
  if (!isLifetimeAllowance(allowance) || rows.some((row) => row.type === "grant")) {
    return rows;
  }

  const createdAt = allowance.grantedAt ?? fallbackGrantDate(rows);
  return [
    ...rows,
    {
      id: `lifetime-grant-${allowance.periodKey}`,
      type: "grant",
      amount_micro_usd: allowance.micro,
      balance_after_micro_usd: allowance.micro,
      feature: null,
      model_id: null,
      bucket: "granted",
      grant_period_key: allowance.periodKey,
      created_at: createdAt,
    },
  ];
}

function dedupeMoneyInRows(rows: CreditRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.type === "debit") return true;

    const key = [
      row.type,
      row.amount_micro_usd,
      row.balance_after_micro_usd,
      row.bucket,
      row.grant_period_key ?? monthKey(row.created_at),
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDisplayTransactions(
  sourceRows: CreditRow[],
  allowance: Allowance | null,
): PublicCreditTransaction[] {
  const rows = dedupeMoneyInRows(withSyntheticLifetimeGrant(sourceRows, allowance));
  const moneyIn: PublicCreditTransaction[] = [];
  const allowanceDateByMonth = new Map<string, string>();
  const monthlySpend = new Map<
    string,
    {
      amountMicroUsd: number;
      createdAt: string;
      latestDebitAt: string;
      balanceAfterMicroUsd: number;
    }
  >();

  for (const row of rows) {
    if (row.type === "grant") {
      allowanceDateByMonth.set(monthKey(row.created_at), row.created_at);
    }
  }

  for (const row of rows) {
    const amountMicroUsd = Number(row.amount_micro_usd) || 0;
    const balanceAfterMicroUsd = Number(row.balance_after_micro_usd) || 0;

    if (row.type === "debit") {
      const key = monthKey(row.created_at);
      const current = monthlySpend.get(key);
      const displayDate = allowanceDateByMonth.get(key) ?? row.created_at;
      monthlySpend.set(key, {
        amountMicroUsd: (current?.amountMicroUsd ?? 0) + amountMicroUsd,
        createdAt: displayDate,
        latestDebitAt:
          !current || Date.parse(row.created_at) > Date.parse(current.latestDebitAt)
            ? row.created_at
            : current.latestDebitAt,
        balanceAfterMicroUsd:
          !current || Date.parse(row.created_at) > Date.parse(current.latestDebitAt)
            ? balanceAfterMicroUsd
            : current.balanceAfterMicroUsd,
      });
      continue;
    }

    moneyIn.push({
      id: row.id,
      type: row.type,
      amountUsd: microToUsd(amountMicroUsd),
      balanceAfterUsd: microToUsd(balanceAfterMicroUsd),
      feature: row.feature,
      modelId: row.model_id,
      bucket: row.bucket,
      createdAt: row.created_at,
    });
  }

  const spend: PublicCreditTransaction[] = Array.from(monthlySpend.entries()).map(
    ([key, row]) => ({
      id: `monthly-spend-${key}`,
      type: "monthly-spend",
      amountUsd: microToUsd(row.amountMicroUsd),
      balanceAfterUsd: microToUsd(row.balanceAfterMicroUsd),
      feature: null,
      modelId: null,
      bucket: null,
      createdAt: row.createdAt,
    }),
  );

  return [...moneyIn, ...spend].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

// The personal wallet is now keyed by creed_id (creed_credits + the creed_id RPCs
// are shared with the company path). Resolve the user's personal Creed id via the
// admin client so it never depends on RLS. Every personal wallet op goes through
// this, keeping the caller-facing signatures user-id based while the storage is
// creed-centric.
async function personalCreedId(userId: string): Promise<string> {
  const id = await getPersonalCreedId(getSupabaseAdminClient(), userId);
  if (!id) throw new Error("Credits are temporarily unavailable");
  return id;
}

// Map the user's entitlement to their granted allowance + the period key that
// resets it. Reads the entitlement directly via the admin client (no dependency
// on lib/stripe, which would create an import cycle). Returns null when the plan
// grants no allowance (no row, refunded, or canceled).
async function resolveAllowance(userId: string): Promise<Allowance | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = await admin
    .from("creed_entitlements")
    .select("billing_mode, billing_interval, status, stripe_session_id, paid_at")
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
        paid_at?: string | null;
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
      grantedAt: row.paid_at ?? null,
    };
  }

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
async function applyGrant(userId: string, allowance: Allowance): Promise<number | null> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("grant_allowance", {
    p_creed_id: await personalCreedId(userId),
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
    .eq("creed_id", await personalCreedId(userId))
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

  const creedId = await personalCreedId(userId);
  const reservationId = await reserveCredits({ creedId, feature, modelId, spentBy: userId });
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
}: {
  userId: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
  reservationId?: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  const chargedMicroUsd = Math.max(
    MIN_DEBIT_MICRO,
    Math.ceil(costUsd * CREDIT_MARKUP * MICRO_PER_USD)
  );
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = reservationId
    ? await admin.rpc("settle_credit_reservation", { p_reservation_id: reservationId, p_actual_micro: chargedMicroUsd })
    : await admin.rpc("debit_credits", { p_creed_id: await personalCreedId(userId), p_amount_micro: chargedMicroUsd, p_feature: feature, p_model_id: modelId, p_spent_by: userId });
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

// Company equivalent of getCreditsState, on the same creed_id-keyed wallet.
// Refreshes the pooled company allowance first (idempotent grant_allowance) so the
// card reflects a new-period reset, then reads the pooled balance + recent ledger via
// the admin client (company credits are owner-only under RLS; the caller gates on
// owner role). all-time spend is not tracked per company, so it returns 0 - the
// company card shows the allowance/balance figures, which are exact.
export async function getCompanyCreditsState(creedId: string): Promise<CreditsState> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;

  // Refresh the allowance just-in-time so the card reflects a new-period reset,
  // exactly like the personal getCreditsState. applyCompanyGrant swallows its own
  // errors (non-fatal); the balance read below is the source of truth.
  const allowance = await resolveCompanyAllowance(creedId);
  if (allowance) {
    await applyCompanyGrant(creedId, allowance);
  }

  const [balanceResult, moneyInResult, debitResult, spendResult] = await Promise.all([
    admin
      .from("creed_credits")
      .select("granted_micro_usd, purchased_micro_usd")
      .eq("creed_id", creedId)
      .maybeSingle(),
    admin
      .from("creed_credit_transactions")
      .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, grant_period_key, created_at")
      .eq("creed_id", creedId)
      .in("type", ["topup", "grant"])
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("creed_credit_transactions")
      .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, grant_period_key, created_at")
      .eq("creed_id", creedId)
      .eq("type", "debit")
      .order("created_at", { ascending: false })
      .limit(1000),
    // All-time spend (sum of debits) on the shared RPC. Called via the admin
    // (service-role) client, which credit_spend_total lets through.
    (admin as unknown as RpcClient).rpc("credit_spend_total", { p_creed_id: creedId }),
  ]);

  // Surface read failures instead of silently rendering $0 (which reads as "you
  // have no credits" when in fact the balance couldn't be loaded).
  if (balanceResult.error) {
    log.error("company_credits_balance_failed", { creedId, message: balanceResult.error.message });
    throw new Error("Could not load company credits");
  }
  if (moneyInResult.error || debitResult.error) {
    log.error("company_credits_history_failed", {
      creedId,
      message: moneyInResult.error?.message ?? debitResult.error?.message,
    });
    throw new Error("Could not load company credits");
  }

  const balanceRow = balanceResult.data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const grantedMicroUsd = balanceRow ? Number(balanceRow.granted_micro_usd) || 0 : 0;
  const purchasedMicroUsd = balanceRow ? Number(balanceRow.purchased_micro_usd) || 0 : 0;
  const balanceMicroUsd = grantedMicroUsd + purchasedMicroUsd;

  const transactions = buildDisplayTransactions([
    ...(((moneyInResult.data as CreditRow[] | null) ?? [])),
    ...(((debitResult.data as CreditRow[] | null) ?? [])),
  ], allowance);

  return {
    grantedMicroUsd,
    purchasedMicroUsd,
    balanceMicroUsd,
    grantedUsd: microToUsd(grantedMicroUsd),
    purchasedUsd: microToUsd(purchasedMicroUsd),
    balanceUsd: microToUsd(balanceMicroUsd),
    allowanceUsd: allowance ? microToUsd(allowance.micro) : 0,
    allowanceResets: allowance ? !allowance.periodKey.startsWith("lifetime") : false,
    allTimeSpentUsd: spendResult.error ? 0 : microToUsd(Number(spendResult.data) || 0),
    transactions,
  };
}

// ── Company credits ─────────────────────────────────────────────────────────
// Company AI meters on the SAME pooled creed_credits wallet + creed_id RPCs as
// personal (one wallet for both), or the owner's company BYOK key. These are thin
// adapters over that shared wallet, differing only in the allowance/settings
// source (company billing + company AI settings). The allowance amounts + period
// key are
// the shared credit-config values, so the two paths can't drift.
async function resolveCompanyAllowance(creedId: string): Promise<Allowance | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = await admin
    .from("creed_company_billing")
    .select("billing_mode, status, stripe_session_id, paid_at")
    .eq("creed_id", creedId)
    .maybeSingle();
  const row = data as
    | {
        billing_mode?: string;
        status?: string;
        stripe_session_id?: string | null;
        paid_at?: string | null;
      }
    | null;
  if (!row) return null;
  if (row.billing_mode === "lifetime") {
    if (row.status !== "paid") return null;
    return {
      micro: COMPANY_GRANT_LIFETIME_USD * MICRO_PER_USD,
      periodKey: `lifetime:${row.stripe_session_id ?? "grant"}`,
      grantedAt: row.paid_at ?? null,
    };
  }
  if (row.status === "active" || row.status === "trialing" || row.status === "past_due") {
    return { micro: COMPANY_GRANT_MONTHLY_USD * MICRO_PER_USD, periodKey: monthlyAllowancePeriodKey() };
  }
  return null;
}

// Company grant, on the SAME creed_id-keyed wallet + RPC as personal (applyGrant).
// Idempotent per (creed, period) inside the RPC. Returns the post-grant combined
// balance, or null on failure (logged, non-fatal - callers fall back to a read).
async function applyCompanyGrant(creedId: string, allowance: Allowance): Promise<number | null> {
  const admin = getSupabaseAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc("grant_allowance", {
    p_creed_id: creedId,
    p_allowance_micro: allowance.micro,
    p_period_key: allowance.periodKey,
  });
  if (error) {
    log.error("company_credit_grant_failed", { creedId, message: error.message });
    return null;
  }
  const balance = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return Number.isFinite(balance) ? balance : null;
}

type CompanyAiSettingsRow = { ai_mode?: string; encrypted_openrouter_key?: string | null; key_status?: string };

// Resolve the AI key + model for a company AI call. Owner-set BYOK runs on the
// company key at no markup; otherwise credits gate on the pooled balance after a
// just-in-time monthly grant. Returns the credential; throws a friendly error
// when the company is out of credits or BYOK is not configured.
export async function resolveCompanyAiCredential(
  creedId: string,
  feature: AiFeature
): Promise<ResolvedAiCredential> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const modelId = getFeatureModelId(feature);
  const { data } = await admin
    .from("creed_company_ai_settings")
    .select("ai_mode, encrypted_openrouter_key, key_status")
    .eq("creed_id", creedId)
    .maybeSingle();
  const settings = data as CompanyAiSettingsRow | null;

  if (settings?.ai_mode === "byok") {
    if (!settings.encrypted_openrouter_key || settings.key_status !== "present") {
      throw new Error("Ask your owner to add a company OpenRouter key");
    }
    return { apiKey: decryptSecret(settings.encrypted_openrouter_key), modelId, mode: "byok" };
  }

  const apiKey = getOpenRouterPlatformKey();
  const allowance = await resolveCompanyAllowance(creedId);
  if (!allowance) {
    throw new Error("Out of credits");
  }
  // Grant just-in-time, then gate on the combined balance the RPC reports; fall
  // back to a direct read if the grant failed. Mirrors resolveAiCredential.
  let totalMicro = await applyCompanyGrant(creedId, allowance);
  if (totalMicro === null) {
    const { data: bal } = await admin
      .from("creed_credits")
      .select("granted_micro_usd, purchased_micro_usd")
      .eq("creed_id", creedId)
      .maybeSingle();
    const b = bal as { granted_micro_usd?: number | string; purchased_micro_usd?: number | string } | null;
    totalMicro = (Number(b?.granted_micro_usd) || 0) + (Number(b?.purchased_micro_usd) || 0);
  }
  if (totalMicro <= 0) {
    throw new Error("Out of credits");
  }
  const reservationId = await reserveCredits({ creedId, feature, modelId, spentBy: null });
  return { apiKey, modelId, mode: "credits", reservationId };
}

// Deduct a company AI call from the pooled balance, attributed to the spender.
// Non-fatal on failure (the spend already happened), mirroring deductCredits.
export async function deductCompanyCredits({
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
  const { data, error } = reservationId
    ? await admin.rpc("settle_credit_reservation", { p_reservation_id: reservationId, p_actual_micro: chargedMicroUsd })
    : await admin.rpc("debit_credits", { p_creed_id: creedId, p_amount_micro: chargedMicroUsd, p_feature: feature, p_model_id: modelId, p_spent_by: spentBy });
  if (error) {
    log.error("company_credit_debit_failed_after_spend", { creedId, micro: chargedMicroUsd, feature, message: error.message });
    return null;
  }
  const balanceMicro = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
  return { chargedMicroUsd, balanceUsd: Number.isFinite(balanceMicro) ? balanceMicro / MICRO_PER_USD : 0 };
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
    p_creed_id: await personalCreedId(userId),
    p_amount_micro: amountMicro,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    log.error("credit_topup_failed", { userId, paymentIntentId, message: error.message });
    throw new Error("Could not credit balance");
  }
}

// Company top-up: land a paid amount in the pooled company purchased bucket
// (rolls over, drawn after the allowance). Uses the same creed_id-keyed
// credit_topup RPC as personal; idempotent on the PaymentIntent id, so the
// webhook + inline confirm never double-credit.
export async function companyCreditTopup({
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
    log.error("company_credit_topup_failed", { creedId, paymentIntentId, message: error.message });
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
  const creedId = await personalCreedId(userId);
  const [balanceResult, moneyInResult, debitResult, spendResult] = await Promise.all([
    db
      .from("creed_credits")
      .select("granted_micro_usd, purchased_micro_usd")
      .eq("creed_id", creedId)
      .maybeSingle(),
    db
      .from("creed_credit_transactions")
      .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, grant_period_key, created_at")
      .eq("creed_id", creedId)
      .in("type", ["topup", "grant"])
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("creed_credit_transactions")
      .select("id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id, bucket, grant_period_key, created_at")
      .eq("creed_id", creedId)
      .eq("type", "debit")
      .order("created_at", { ascending: false })
      .limit(1000),
    // All-time spend via the service-role admin client. Keep the aggregate RPC
    // off the public authenticated RPC surface; the route already gates this
    // read to the signed-in user's own personal Creed.
    (getSupabaseAdminClient() as unknown as RpcClient).rpc("credit_spend_total", {
      p_creed_id: creedId,
    }),
  ]);

  if (balanceResult.error) {
    log.error("credits_state_balance_failed", { userId, message: balanceResult.error.message });
    throw new Error("Could not load credits");
  }
  if (moneyInResult.error || debitResult.error) {
    log.error("credits_state_history_failed", {
      userId,
      message: moneyInResult.error?.message ?? debitResult.error?.message,
    });
    throw new Error("Could not load credits");
  }

  const balanceRow = balanceResult.data as
    | { granted_micro_usd?: number | string; purchased_micro_usd?: number | string }
    | null;
  const grantedMicroUsd = balanceRow ? Number(balanceRow.granted_micro_usd) || 0 : 0;
  const purchasedMicroUsd = balanceRow ? Number(balanceRow.purchased_micro_usd) || 0 : 0;
  const balanceMicroUsd = grantedMicroUsd + purchasedMicroUsd;

  const transactions = buildDisplayTransactions([
    ...(((moneyInResult.data as CreditRow[] | null) ?? [])),
    ...(((debitResult.data as CreditRow[] | null) ?? [])),
  ], allowance);

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
