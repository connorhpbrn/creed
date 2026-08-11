import "server-only";
// Account Bonus credits home: Cloud granted allowance sits on one owned Creed
// the user assigns. Lasting purchased balances stay per Creed and do not move
// when Bonus is reassigned. AI spend debits the Creed in use: Bonus only when
// that Creed is the assigned home, otherwise only that Creed's purchased pot.

import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { log } from "@/lib/observability";

type RpcClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

function rpc(): RpcClient {
  return getSupabaseAdminClient() as unknown as RpcClient;
}

async function oldestOwnedCreedId(userId: string): Promise<string | null> {
  const { data, error } = (await admin()
    .from("creeds")
    .select("id, type, created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })) as {
    data: Array<{ id: string; type: string }> | null;
    error: unknown;
  };
  if (error || !data || data.length === 0) return null;
  const personal = data.find((row) => row.type === "personal");
  return personal?.id ?? data[0]?.id ?? null;
}

async function ownsCreed(userId: string, creedId: string): Promise<boolean> {
  const { data, error } = (await admin()
    .from("creeds")
    .select("id")
    .eq("id", creedId)
    .eq("owner_user_id", userId)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };
  return !error && Boolean(data?.id);
}

/** Read the stored home, or null if unset / invalid. */
export async function readCreditsHomeCreedId(
  userId: string,
): Promise<string | null> {
  const { data, error } = (await admin()
    .from("creed_credit_homes")
    .select("creed_id")
    .eq("user_id", userId)
    .maybeSingle()) as { data: { creed_id: string } | null; error: unknown };
  if (error) {
    log.error("credits_home_read_failed", { userId, message: String(error) });
    return null;
  }
  const creedId = data?.creed_id ?? null;
  if (!creedId) return null;
  if (!(await ownsCreed(userId, creedId))) return null;
  return creedId;
}

/**
 * Resolve the account credits home Creed. Creates the preference from the
 * oldest owned Creed (Personal preferred) when missing, consolidating any
 * stray granted Bonus onto that Creed.
 *
 * Returns null when the user owns no Creed (invite-only Shared members). Callers
 * must treat that as "no Bonus home", not a hard failure.
 */
export async function resolveCreditsHomeCreedId(
  userId: string,
): Promise<string | null> {
  const existing = await readCreditsHomeCreedId(userId);
  if (existing) return existing;

  const fallback = await oldestOwnedCreedId(userId);
  if (!fallback) {
    return null;
  }

  const { data, error } = await rpc().rpc("set_credit_home", {
    p_user_id: userId,
    p_creed_id: fallback,
  });
  if (error) {
    log.error("credits_home_seed_failed", { userId, message: error.message });
    return null;
  }
  return typeof data === "string" ? data : fallback;
}

/** Set home without requiring a prior home row. Used for first Creed / seed. */
export async function ensureCreditsHomeCreed(
  userId: string,
  creedId: string,
): Promise<void> {
  if (!(await ownsCreed(userId, creedId))) return;
  const existing = await readCreditsHomeCreedId(userId);
  if (existing) return;
  const { error } = await rpc().rpc("set_credit_home", {
    p_user_id: userId,
    p_creed_id: creedId,
  });
  if (error) {
    log.error("credits_home_ensure_failed", {
      userId,
      creedId,
      message: error.message,
    });
  }
}

/**
 * Point Bonus credits at another owned Creed and move the granted bucket only.
 * Purchased balances stay on each Creed. Transfer + home pointer are atomic.
 */
export async function setCreditsHomeCreed(params: {
  userId: string;
  creedId: string;
}): Promise<{ ok: true; creedId: string } | { ok: false; error: string }> {
  const { userId, creedId } = params;
  if (!(await ownsCreed(userId, creedId))) {
    return { ok: false, error: "You can only apply credits to a Creed you own." };
  }

  const fromId = await readCreditsHomeCreedId(userId);
  if (fromId === creedId) {
    return { ok: true, creedId };
  }

  const { data, error } = await rpc().rpc("set_credit_home", {
    p_user_id: userId,
    p_creed_id: creedId,
  });
  if (error) {
    log.error("credits_home_set_failed", {
      userId,
      creedId,
      message: error.message,
    });
    if (/credit_home_not_owner/i.test(error.message)) {
      return { ok: false, error: "You can only apply credits to a Creed you own." };
    }
    return { ok: false, error: "Could not update bonus credits." };
  }
  return { ok: true, creedId: typeof data === "string" ? data : creedId };
}

/**
 * Before deleting a Creed, move Bonus credits to another owned Creed when needed.
 * Returns the next home id (or null if the user owns nothing else).
 */
export async function reassignCreditsHomeBeforeDelete(params: {
  userId: string;
  deletingCreedId: string;
  preferredNextCreedId?: string | null;
}): Promise<string | null> {
  const home = await readCreditsHomeCreedId(params.userId);
  if (home !== params.deletingCreedId) {
    return home;
  }

  const { data } = (await admin()
    .from("creeds")
    .select("id, type, created_at")
    .eq("owner_user_id", params.userId)
    .order("created_at", { ascending: true })) as {
    data: Array<{ id: string; type: string }> | null;
  };

  const candidates = (data ?? []).filter(
    (row) => row.id !== params.deletingCreedId,
  );
  const preferred =
    params.preferredNextCreedId &&
    candidates.some((row) => row.id === params.preferredNextCreedId)
      ? params.preferredNextCreedId
      : null;
  const personal = candidates.find((row) => row.type === "personal")?.id;
  const next = preferred ?? personal ?? candidates[0]?.id ?? null;
  if (!next) {
    // Last Creed: delete the home row so ON DELETE RESTRICT does not block.
    await admin().from("creed_credit_homes").delete().eq("user_id", params.userId);
    return null;
  }

  const moved = await setCreditsHomeCreed({
    userId: params.userId,
    creedId: next,
  });
  return moved.ok ? next : null;
}
