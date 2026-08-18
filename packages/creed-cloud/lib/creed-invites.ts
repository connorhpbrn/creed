import "server-only";
import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { hashSecret } from "@creed/integrations/secret-crypto";
import { getCreedRole } from "@/lib/creed-membership";
import { getUserName, getAvatarUrl, getAvatarInitials } from "@/lib/creed-backend";

export type InviterProfile = { name: string; avatarUrl?: string; initials: string };

// Shared invites: create / accept / resend / revoke, with hashed, expiring tokens.
//
// A invite is an active member OR a pending invite. Invites expire after 7 days,
// carry a hashed token (the raw token only ever lives in the emailed link), and
// are unique-per-email-per-Creed while pending. All writes go through the admin
// client after an app-level owner/admin role check in the calling route.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteResult =
  | { ok: true; inviteId: string; token: string }
  | {
      ok: false;
      error: string;
      code: "forbidden" | "duplicate" | "already_member" | "failed";
    };

export type AcceptResult =
  | { ok: true; creedId: string }
  | { ok: false; error: string; code: "invalid" | "expired" | "email_mismatch" | "failed" };

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

/**
 * Flip pending invites past their expiry to `expired`. This lazy, idempotent
 * sweep is cheaper than a cron for the volume here.
 */
export async function sweepExpiredInvites(creedId: string): Promise<void> {
  const db = admin();
  await db
    .from("creed_invites")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("creed_id", creedId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

/**
 * True if the email already belongs to a member of this Creed. Fails CLOSED:
 * if any auth lookup errors we can't rule out a match, so we throw rather than
 * return false - the caller reports a retryable error instead of letting an
 * invite to an existing member through (which would consume a invite that can
 * never be used up).
 */
async function emailBelongsToMember(creedId: string, normalizedEmail: string): Promise<boolean> {
  const db = admin();
  const { data, error } = await db.rpc("get_member_profiles", {
    p_creed_id: creedId,
  });
  if (error) {
    throw new Error("Could not verify existing members.");
  }
  return ((data as Array<{ email?: string }> | null) ?? []).some(
    (row) => (row.email ?? "").trim().toLowerCase() === normalizedEmail
  );
}

/**
 * Create a pending invite. The caller must be owner/admin (checked here against
 * live membership). Enforces the freeze state, invite capacity, and one pending
 * invite per email. Returns the raw token so the route can build + send the
 * email link. Does not send email itself (kept side-effect free for testing).
 */
export async function createInvite(params: {
  creedId: string;
  actorUserId: string;
  email: string;
  role: "admin" | "member";
}): Promise<InviteResult> {
  const { creedId, actorUserId, email, role } = params;
  const db = admin();

  const actorRole = await getCreedRole(db, actorUserId, creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return { ok: false, error: "Only an owner or admin can invite.", code: "forbidden" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Inviting someone already on the team would consume a invite forever (accept
  // is idempotent for existing members, so the invite can never be "used up").
  // Reject cleanly before touching a invite. If the membership check can't
  // complete, fail closed with a retryable error rather than risk the invite.
  let alreadyMember: boolean;
  try {
    alreadyMember = await emailBelongsToMember(creedId, normalizedEmail);
  } catch {
    return { ok: false, error: "Could not verify members. Please try again.", code: "failed" };
  }
  if (alreadyMember) {
    return { ok: false, error: "That person is already a member.", code: "already_member" };
  }


  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSecret(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data, error } = (await db
    .from("creed_invites")
    .insert({
      creed_id: creedId,
      email: normalizedEmail,
      role,
      token_hash: tokenHash,
      invited_by: actorUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: { message?: string; code?: string } | null };

  if (error || !data) {
    // Unique violation on the partial index = a pending invite already exists.
    if (error?.code === "23505") {
      return { ok: false, error: "That email already has a pending invite.", code: "duplicate" };
    }
    return { ok: false, error: "Could not create the invite.", code: "failed" };
  }

  return { ok: true, inviteId: data.id, token };
}

/** Revoke a pending invite (owner/admin), freeing its invite. */
export async function revokeInvite(params: {
  creedId: string;
  actorUserId: string;
  inviteId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actorUserId, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return { ok: false, error: "Only an owner or admin can revoke invites." };
  }
  const { error } = await db
    .from("creed_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", params.inviteId)
    .eq("creed_id", params.creedId)
    .eq("status", "pending");
  return error ? { ok: false, error: "Could not revoke the invite." } : { ok: true };
}

/**
 * Rotate a pending invite's token (resend). Returns the fresh raw token + email
 * for the route to re-send. Extends the expiry another 7 days.
 */
export async function rotateInviteToken(params: {
  creedId: string;
  actorUserId: string;
  inviteId: string;
}): Promise<{ ok: true; token: string; email: string; role: "admin" | "member" } | { ok: false; error: string }> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actorUserId, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return { ok: false, error: "Only an owner or admin can resend invites." };
  }
  const token = randomBytes(32).toString("base64url");
  const { data, error } = (await db
    .from("creed_invites")
    .update({
      token_hash: hashSecret(token),
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.inviteId)
    .eq("creed_id", params.creedId)
    .eq("status", "pending")
    .select("email, role")
    .single()) as { data: { email: string; role: "admin" | "member" } | null; error: unknown };
  if (error || !data) return { ok: false, error: "Could not resend the invite." };
  return { ok: true, token, email: data.email, role: data.role };
}

type InviteRow = {
  id: string;
  creed_id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  expires_at: string;
  invited_by: string | null;
};

/** Display profile for the invite's sender, for the accept screen's avatars. */
async function resolveInviterProfile(userId: string | null, creedId: string): Promise<InviterProfile | null> {
  if (!userId) return null;
  const { data } = await admin().rpc("get_member_profiles", { p_creed_id: creedId });
  const row = ((data as Array<{
    user_id: string;
    email: string;
    raw_user_meta_data: Record<string, unknown>;
  }> | null) ?? []).find((member) => member.user_id === userId);
  if (!row) return null;
  const user = { id: row.user_id, email: row.email, user_metadata: row.raw_user_meta_data } as User;
  const name = getUserName(user);
  return { name, avatarUrl: getAvatarUrl(user), initials: getAvatarInitials(name) };
}

/**
 * Resolve an invite by its raw token (server-only), for the accept page.
 * `expired` is computed here (a plain async function) so the page's server
 * component render stays pure and never calls Date.now() itself.
 */
export async function resolveInviteByToken(
  token: string
): Promise<{ invite: InviteRow; sharedName: string; expired: boolean; inviter: InviterProfile | null } | null> {
  const db = admin();
  const { data } = (await db
    .from("creed_invites")
    .select("id, creed_id, email, role, status, expires_at, invited_by")
    .eq("token_hash", hashSecret(token))
    .maybeSingle()) as { data: InviteRow | null };
  if (!data) return null;
  const [{ data: creed }, inviter] = await Promise.all([
    db.from("creeds").select("name").eq("id", data.creed_id).maybeSingle() as Promise<{ data: { name: string } | null }>,
    resolveInviterProfile(data.invited_by, data.creed_id),
  ]);
  return {
    invite: data,
    sharedName: creed?.name ?? "the Shared Creed",
    expired: Date.parse(data.expires_at) < Date.now(),
    inviter,
  };
}

/**
 * Accept an invite for the signed-in user. Re-validates status, expiry, and
 * that the invite's email matches the user's
 * (case-insensitive). Creates the membership and marks the invite accepted.
 * Idempotent: an already-member returns ok.
 */
export async function acceptInvite(token: string, user: User): Promise<AcceptResult> {
  const db = admin();
  const resolved = await resolveInviteByToken(token);
  if (!resolved) return { ok: false, error: "This invite link is not valid.", code: "invalid" };

  const { invite, sharedName } = resolved;
  void sharedName;

  if (invite.status !== "pending") {
    return { ok: false, error: "This invite is no longer active.", code: "invalid" };
  }
  if (Date.parse(invite.expires_at) < Date.now()) {
    await db.from("creed_invites").update({ status: "expired" }).eq("id", invite.id);
    return { ok: false, error: "This invite has expired. Ask for a new one.", code: "expired" };
  }
  const userEmail = user.email?.trim().toLowerCase() ?? "";
  if (userEmail !== invite.email.trim().toLowerCase()) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that email.`,
      code: "email_mismatch",
    };
  }

  // Already a member? Accept idempotently.
  const existingRole = await getCreedRole(db, user.id, invite.creed_id);
  if (existingRole) {
    await db.from("creed_invites").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", invite.id);
    return { ok: true, creedId: invite.creed_id };
  }

  const rpc = db as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: accepted, error: memberError } = await rpc.rpc("accept_shared_invite", {
    p_invite_id: invite.id,
    p_user_id: user.id,
  });
  if (memberError || accepted === "invalid") {
    return { ok: false, error: "Could not join the Shared Creed.", code: "failed" };
  }

  return { ok: true, creedId: invite.creed_id };
}

/**
 * Decline an invite for the signed-in user. Validates the invite is pending and
 * addressed to the user's email, then marks it `declined` (freeing the invite -
 * only `pending` invites count toward capacity). A distinct status from an
 * owner-side `revoked` so the audit trail can tell a user-decline from an
 * admin-revoke. Idempotent: a non-pending invite for the right email returns ok.
 */
export async function declineInvite(token: string, user: User): Promise<{ ok: boolean; error?: string }> {
  const db = admin();
  const resolved = await resolveInviteByToken(token);
  if (!resolved) return { ok: false, error: "This invite link is not valid." };

  const { invite } = resolved;
  const userEmail = user.email?.trim().toLowerCase() ?? "";
  if (userEmail !== invite.email.trim().toLowerCase()) {
    return { ok: false, error: `This invite was sent to ${invite.email}.` };
  }
  if (invite.status !== "pending") return { ok: true };

  const { error } = await db
    .from("creed_invites")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending");
  return error ? { ok: false, error: "Could not decline the invite." } : { ok: true };
}

export type { InviteRow };
