import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listUserCreeds,
  getPersonalCreedId,
  getCreedRole,
  type CreedSummary,
} from "@/lib/creed-membership";
import type { CreedRole } from "@/lib/creed-permissions";
import { getDisplayName } from "@/lib/user-name";

// Active-Creed resolution.
//
// The app renders one Creed at a time. Which one is held in a cookie
// (ACTIVE_CREED_COOKIE) so server components and route handlers agree without a
// round-trip. The cookie is advisory: it is always validated against live
// membership, and falls back to the user's personal Creed (or their sole
// company Creed) when it is missing, stale, or points at a Creed they no longer
// belong to. This means a removed member silently drops back to their personal
// Creed rather than seeing an error.

export const ACTIVE_CREED_COOKIE = "creed_active";

export type ActiveCreed = {
  creedId: string;
  role: CreedRole;
  creeds: CreedSummary[];
};

/**
 * Resolve the active Creed for a request.
 *
 * Order: the cookie's Creed if the user still belongs to it; else their
 * personal Creed; else their first company Creed; else null (a brand-new user
 * with no Creed row yet, which the gate routes to onboarding). `client` is the
 * caller's session client (used to read membership under RLS).
 */
// cache()-wrapped: the app layout and AuthedProviders both resolve the active
// Creed in the same render. With a shared client+user (see getRequestAuth)
// the args match, so the membership read runs once per request. A no-op in
// route handlers.
export const resolveActiveCreed = cache(async function resolveActiveCreed(
  client: unknown,
  user: User
): Promise<ActiveCreed | null> {
  const creeds = await listUserCreeds(client, user.id);
  if (creeds.length === 0) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_CREED_COOKIE)?.value ?? null;

  const chosen =
    (requested && creeds.find((c) => c.id === requested)) ||
    creeds.find((c) => c.type === "personal") ||
    creeds[0];

  return { creedId: chosen.id, role: chosen.role, creeds };
});

/**
 * The active Creed's id if it is a company Creed the caller OWNS, else null.
 *
 * Company AI billing (credits, usage, BYOK) is owner-only, and the personal AI
 * routes reuse this to decide whether to serve company data: a null result means
 * "treat this request as personal" (personal Creed, a non-owner member, or no
 * Creed), which preserves the exact personal behaviour for everyone else.
 */
export async function resolveOwnedCompanyCreedId(
  client: unknown,
  user: User
): Promise<string | null> {
  const active = await resolveActiveCreed(client, user);
  if (!active) return null;
  const type = active.creeds.find((c) => c.id === active.creedId)?.type;
  return type === "company" && active.role === "owner" ? active.creedId : null;
}

/**
 * The active Creed's id if it is a company Creed the caller MANAGES (owner or
 * admin), else null. Used by the GitHub sync routes: version control is a
 * manager tool, and a null result means "treat this request as personal".
 */
export async function resolveManagedCompanyCreedId(
  client: unknown,
  user: User
): Promise<string | null> {
  const active = await resolveActiveCreed(client, user);
  if (!active) return null;
  const type = active.creeds.find((c) => c.id === active.creedId)?.type;
  return type === "company" && (active.role === "owner" || active.role === "admin")
    ? active.creedId
    : null;
}

/**
 * The active Creed if it is a company Creed the caller belongs to (any role),
 * with that role, else null. Used by the read-only company AI routes (credits /
 * usage / settings / balance): every member may VIEW the company's model usage,
 * while mutations stay gated on {@link resolveOwnedCompanyCreedId}. The role lets
 * a read strip owner-only detail (e.g. purchase history) for plain members.
 */
export async function resolveMemberCompanyCreed(
  client: unknown,
  user: User
): Promise<{ creedId: string; role: CreedRole } | null> {
  const active = await resolveActiveCreed(client, user);
  if (!active) return null;
  const type = active.creeds.find((c) => c.id === active.creedId)?.type;
  return type === "company" ? { creedId: active.creedId, role: active.role } : null;
}

/**
 * A specific company Creed the caller belongs to (any role), by explicit id -
 * independent of the active-Creed cookie. Company settings passes its own
 * creedId to the AI-data reads (credits / usage / settings) so the company card
 * always loads THAT company's pooled figures, never a cookie-timing fallback to
 * the caller's personal balance. Returns null if the id is not a company Creed
 * the user is a member of. `client` reads membership under RLS.
 */
export async function resolveMemberCompanyCreedById(
  client: unknown,
  user: User,
  creedId: string
): Promise<{ creedId: string; role: CreedRole } | null> {
  const creeds = await listUserCreeds(client, user.id);
  const match = creeds.find((c) => c.id === creedId && c.type === "company");
  return match ? { creedId: match.id, role: match.role } : null;
}

/**
 * Set the active-Creed cookie after validating membership. Returns the resolved
 * role, or null if the user is not a member of that Creed (caller should 403).
 * Called by POST /api/app/creeds/activate.
 */
export async function setActiveCreed(
  client: unknown,
  user: User,
  creedId: string
): Promise<CreedRole | null> {
  const role = await getCreedRole(client, user.id, creedId);
  if (!role) return null;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CREED_COOKIE, creedId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Persist across sessions; membership is re-validated on every read.
    maxAge: 60 * 60 * 24 * 365,
  });
  return role;
}

/**
 * The user's personal Creed id, provisioning one via the admin client if it is
 * somehow missing (e.g. a user created before the backfill, or a race). Used by
 * paths that must always resolve a personal Creed (the personal state loader).
 */
export async function ensurePersonalCreedId(
  client: unknown,
  user: User
): Promise<string> {
  const existing = await getPersonalCreedId(client, user.id);
  if (existing) return existing;

  const admin = getSupabaseAdminClient() as unknown as {
    from: (t: string) => {
      insert: (v: unknown) => {
        select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
      };
    };
  };
  const name = getDisplayName(user, "Your Creed");

  const { data, error } = await admin
    .from("creeds")
    .insert({ type: "personal", name, owner_user_id: user.id })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("Could not provision a personal Creed.");
  }

  // Owner membership row (best-effort; the unique index makes a retry safe).
  const adminMembers = getSupabaseAdminClient() as unknown as {
    from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> };
  };
  await adminMembers.from("creed_members").insert({
    creed_id: data.id,
    user_id: user.id,
    role: "owner",
  });

  return data.id;
}
