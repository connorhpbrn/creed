import "server-only";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import type { CreedRole, CreedType } from "@creed/core/creed-permissions";

// Membership + Creed-listing helpers.
//
// These read creeds and creed_members. They are the source of truth for which
// Creeds a user belongs to and what role they hold. Everything is keyed by
// creed_id; Personal Creeds are the one-member case.
//
// Reads go through whatever client the caller passes (the user's session client
// under RLS, or the service-role admin client). The generated Database types do
// not yet know these tables, so we use the SupabaseLikeClient cast the rest of
// the backend uses.

export type CreedSummary = {
  id: string;
  type: CreedType;
  name: string;
  role: CreedRole;
  avatarUrl?: string;
  // True while a Creed still has first-run Shared onboarding state. Additional
  // Creeds created from the switcher are ready immediately (needsSetup false).
  needsSetup: boolean;
};

type CreedRow = {
  id: string;
  type: CreedType;
  name: string;
  owner_user_id: string;
  avatar_url?: string | null;
  onboarding_stage: string | null;
};

type MemberRow = {
  creed_id: string;
  user_id: string;
  role: CreedRole;
};

/**
 * Every Creed a user can open, personal first then shared Creeds by name.
 * Used by the switcher and the app gate. Returns [] on any error so a transient
 * DB blip degrades to "personal only" rather than throwing.
 */
export async function listUserCreeds(
  client: unknown,
  userId: string
): Promise<CreedSummary[]> {
  const db = client as SupabaseLikeClient;
  const { data: memberRows, error: memberError } = (await db
    .from("creed_members")
    .select("creed_id, role")
    .eq("user_id", userId)) as { data: Array<{ creed_id: string; role: CreedRole }> | null; error: unknown };

  if (memberError || !memberRows || memberRows.length === 0) {
    return [];
  }

  const roleByCreed = new Map(memberRows.map((row) => [row.creed_id, row.role]));
  const ids = [...roleByCreed.keys()];

  const withAvatar = (await db
    .from("creeds")
    .select("id, type, name, owner_user_id, avatar_url, onboarding_stage")
    .in("id", ids)) as { data: CreedRow[] | null; error: unknown };
  if (withAvatar.error) return [];
  const creedRows = withAvatar.data;

  if (!creedRows) {
    return [];
  }

  const mapped = creedRows
    .map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      role: roleByCreed.get(row.id) ?? "member",
      avatarUrl: row.avatar_url ?? undefined,
      needsSetup: row.onboarding_stage != null,
    }))
    .sort((a, b) => {
      // Personal first, then shared Creeds alphabetically.
      if (a.type !== b.type) return a.type === "personal" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return mapped;
}

/** The caller's role on a Creed, or null if they are not a member. */
export async function getCreedRole(
  client: unknown,
  userId: string,
  creedId: string
): Promise<CreedRole | null> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_members")
    .select("role")
    .eq("creed_id", creedId)
    .eq("user_id", userId)
    .maybeSingle()) as { data: { role: CreedRole } | null; error: unknown };
  if (error || !data) return null;
  return data.role;
}

/** The owner's oldest Personal Creed id, creating nothing. Null if none exists. */
export async function getPersonalCreedId(
  client: unknown,
  userId: string
): Promise<string | null> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creeds")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("type", "personal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };
  if (error || !data) return null;
  return data.id;
}

/** Resolve an explicit Personal Creed only when the caller owns it. */
export async function getOwnedPersonalCreedId(
  client: unknown,
  userId: string,
  creedId: string,
): Promise<string | null> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creeds")
    .select("id")
    .eq("id", creedId)
    .eq("owner_user_id", userId)
    .eq("type", "personal")
    .maybeSingle()) as { data: { id: string } | null; error: unknown };
  return error || !data ? null : data.id;
}

export type { MemberRow, CreedRow };
